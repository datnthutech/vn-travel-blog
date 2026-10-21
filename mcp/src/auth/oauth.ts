// Đăng nhập OAuth 2.1 để Claude (claude.ai web + app iOS) kết nối MCP.
// Vai trò: server MCP của ta là "authorization server" với Claude, còn việc xác minh CON NGƯỜI giao cho GitHub:
//   Claude → /oauth/authorize → (chuyển sang) GitHub login → /oauth/github/callback → ta kiểm tra đúng tài khoản
//   được phép (ALLOWED_GITHUB_USER) → cấp mã → Claude đổi mã lấy token ở /oauth/token (có PKCE) → gọi /mcp.
// Mặc định đóng: không token hợp lệ thì /mcp trả 401. Token GitHub chỉ dùng một lần để hỏi "bạn là ai" rồi bỏ,
// không lưu, không log.
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import express, { type RequestHandler, type Response, type Router } from 'express';
import { authorizationHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/authorize.js';
import { clientRegistrationHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/register.js';
import { metadataHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/metadata.js';
import { revocationHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/revoke.js';
import { tokenHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/token.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { InvalidClientMetadataError, InvalidGrantError, InvalidTokenError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import type { AuthorizationParams, OAuthServerProvider } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { OAuthClientInformationFull, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js';
import type { Config } from '../config';
import { dangNhapGithub } from './github-login';

export interface OAuthDeps {
  fetchFn?: typeof fetch;
  now?: () => number;
  /** Test: không ghi trạng thái ra đĩa. */
  khongLuuOAuth?: boolean;
}

const PHUT = 60_000;
const NGAY = 24 * 60 * PHUT;
const TTL_STATE = 10 * PHUT; // thời gian để người dùng đăng nhập GitHub
const TTL_MA = 5 * PHUT;
const TTL_ACCESS = 60 * PHUT;
const TTL_REFRESH = 30 * NGAY;
const TOI_DA_CLIENT = 50;

const bam = (s: string) => createHash('sha256').update(s).digest('hex');
const ngauNhien = () => randomBytes(32).toString('base64url');

// So sánh tên tài khoản không phân biệt hoa thường, thời gian không phụ thuộc vị trí khác biệt.
export function kiemTraNguoiDung(login: string, allowed: string): boolean {
  const a = createHash('sha256').update(login.toLowerCase()).digest();
  const b = createHash('sha256').update(allowed.toLowerCase()).digest();
  return login !== '' && timingSafeEqual(a, b);
}

const REDIRECT_CLAUDE = new Set([
  'https://claude.ai/api/mcp/auth_callback',
  'https://claude.com/api/mcp/auth_callback',
]);
function redirectUriHopLe(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol === 'https:' && !u.search && !u.hash) return REDIRECT_CLAUDE.has(`${u.origin}${u.pathname}`);
  // Claude Code (CLI) nhận mã ở cổng loopback trên máy người dùng.
  return u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]');
}

// Dọn các mục đã hết hạn trong một Map (state đăng nhập, mã cấp) để bộ nhớ không phình.
export function donHetHan(m: Map<string, { hetHan: number }>, now: number): void {
  for (const [k, v] of m) if (v.hetHan < now) m.delete(k);
}

interface TokenLuu {
  loai: 'access' | 'refresh';
  clientId: string;
  login: string;
  hetHan: number;
  scopes: string[];
  resource?: string;
}
interface TrangThai {
  clients: Record<string, OAuthClientInformationFull>;
  tokens: Record<string, TokenLuu>; // khoá = SHA-256 của token
}
interface ChoDangNhap {
  client: OAuthClientInformationFull;
  params: AuthorizationParams;
  hetHan: number;
}
interface MaCap {
  clientId: string;
  codeChallenge: string;
  redirectUri: string;
  login: string;
  scopes: string[];
  resource?: string;
  hetHan: number;
}

export function createOAuth(config: Config, deps: OAuthDeps = {}) {
  const now = deps.now ?? Date.now;
  const fetchFn = deps.fetchFn ?? fetch;
  const duongDanTrangThai = join(config.anhDir, '.oauth-state.json');

  // --- Trạng thái bền (client đã đăng ký + token đã cấp, token chỉ lưu dạng băm) ---
  let tt: TrangThai = { clients: {}, tokens: {} };
  if (!deps.khongLuuOAuth) {
    try {
      tt = { ...tt, ...JSON.parse(readFileSync(duongDanTrangThai, 'utf8')) };
    } catch {
      /* chưa có file → bắt đầu trống */
    }
  }
  const luu = () => {
    if (deps.khongLuuOAuth) return;
    try {
      const tam = `${duongDanTrangThai}.tmp`;
      writeFileSync(tam, JSON.stringify(tt), { mode: 0o600 });
      renameSync(tam, duongDanTrangThai);
    } catch (e) {
      console.error('Không lưu được trạng thái OAuth:', (e as Error).message);
    }
  };
  // Tên riêng (không trùng donHetHan của module): trước đây trùng tên nên donHetHan(choDangNhap, …) gọi nhầm hàm này
  // và không bao giờ dọn lượt đăng nhập/mã cấp đã hết hạn → bộ nhớ tăng mãi.
  const donTokenHetHan = () => {
    for (const [k, t] of Object.entries(tt.tokens)) if (t.hetHan < now()) delete tt.tokens[k];
  };
  // Khi đã đủ chỗ: bỏ các client đăng ký quá 24 giờ mà chưa từng được cấp token → kẻ lạ không thể giữ kín 50 chỗ mãi.
  const donClientBoHoang = () => {
    const dangDung = new Set(Object.values(tt.tokens).map((t) => t.clientId));
    for (const [id, c] of Object.entries(tt.clients)) {
      const dangKyLuc = (c.client_id_issued_at ?? 0) * 1000;
      if (!dangDung.has(id) && dangKyLuc < now() - NGAY) delete tt.clients[id];
    }
    luu();
  };

  // --- Trạng thái tạm trong bộ nhớ ---
  const choDangNhap = new Map<string, ChoDangNhap>(); // khoá = băm của sid gửi sang GitHub
  const maCap = new Map<string, MaCap>(); // khoá = băm của mã

  const goc = new URL(config.publicBaseUrl);
  const issuer = new URL('/', goc);
  const url = (p: string) => new URL(p, goc).href;
  const callbackUrl = url('/oauth/github/callback');
  const resourceUrl = new URL('/mcp', goc);

  function phatHanhToken(clientId: string, login: string, scopes: string[], resource?: URL): OAuthTokens {
    const access = ngauNhien();
    const refresh = ngauNhien();
    const r = resource?.href;
    tt.tokens[bam(access)] = { loai: 'access', clientId, login, hetHan: now() + TTL_ACCESS, scopes, resource: r };
    tt.tokens[bam(refresh)] = { loai: 'refresh', clientId, login, hetHan: now() + TTL_REFRESH, scopes, resource: r };
    donTokenHetHan();
    luu();
    return { access_token: access, token_type: 'Bearer', expires_in: TTL_ACCESS / 1000, refresh_token: refresh, scope: scopes.join(' ') };
  }

  const provider: OAuthServerProvider = {
    clientsStore: {
      getClient: (id) => tt.clients[id],
      registerClient: (client) => {
        // Chỉ nhận redirect_uri của Claude (hoặc loopback cho Claude Code). Nếu không, kẻ lạ đăng ký client với
        // redirect_uri của mình rồi gửi link /oauth/authorize cho chủ blog — GitHub tự chuyển tiếp (đã từng cấp quyền)
        // và mã đăng nhập sẽ về tay kẻ lạ.
        if (!client.redirect_uris.every((u) => redirectUriHopLe(String(u)))) {
          throw new InvalidClientMetadataError('redirect_uri must be a Claude callback URL or a loopback address');
        }
        if (Object.keys(tt.clients).length >= TOI_DA_CLIENT) donClientBoHoang();
        if (Object.keys(tt.clients).length >= TOI_DA_CLIENT) throw new Error('Đã đăng ký quá nhiều client');
        const full = { ...client, client_id: randomUUID(), client_id_issued_at: Math.floor(now() / 1000) } as OAuthClientInformationFull;
        tt.clients[full.client_id] = full;
        luu();
        return full;
      },
    },

    // Bước 1: chưa biết người dùng là ai → chuyển sang GitHub để đăng nhập.
    async authorize(client, params, res: Response) {
      const sid = ngauNhien();
      donHetHan(choDangNhap, now());
      donHetHan(maCap, now());
      choDangNhap.set(bam(sid), { client, params, hetHan: now() + TTL_STATE });
      const gh = new URL('https://github.com/login/oauth/authorize');
      gh.searchParams.set('client_id', config.githubOauthClientId);
      gh.searchParams.set('redirect_uri', callbackUrl);
      gh.searchParams.set('scope', 'read:user');
      gh.searchParams.set('state', sid);
      gh.searchParams.set('allow_signup', 'false');
      res.redirect(gh.href);
    },

    async challengeForAuthorizationCode(client, code) {
      const m = maCap.get(bam(code));
      if (!m || m.clientId !== client.client_id || m.hetHan < now()) throw new InvalidGrantError('Mã không hợp lệ hoặc đã hết hạn');
      return m.codeChallenge;
    },

    async exchangeAuthorizationCode(client, code, _verifier, redirectUri, resource) {
      const k = bam(code);
      const m = maCap.get(k);
      maCap.delete(k); // dùng một lần — kể cả khi các bước sau thất bại
      if (!m || m.clientId !== client.client_id || m.hetHan < now()) throw new InvalidGrantError('Mã không hợp lệ hoặc đã hết hạn');
      if (redirectUri && redirectUri !== m.redirectUri) throw new InvalidGrantError('redirect_uri không khớp');
      return phatHanhToken(m.clientId, m.login, m.scopes, resource ?? (m.resource ? new URL(m.resource) : undefined));
    },

    async exchangeRefreshToken(client, refreshToken) {
      const k = bam(refreshToken);
      const t = tt.tokens[k];
      delete tt.tokens[k]; // xoay vòng: mỗi refresh token chỉ dùng một lần
      if (!t || t.loai !== 'refresh' || t.clientId !== client.client_id || t.hetHan < now() || !kiemTraNguoiDung(t.login, config.allowedGithubUser)) {
        luu();
        throw new InvalidGrantError('Refresh token không hợp lệ');
      }
      return phatHanhToken(t.clientId, t.login, t.scopes, t.resource ? new URL(t.resource) : undefined);
    },

    async verifyAccessToken(token) {
      const t = tt.tokens[bam(token)];
      // Lưu ý: thông điệp của InvalidTokenError được đưa vào header WWW-Authenticate → PHẢI là ASCII (có dấu sẽ làm Node văng lỗi 500).
      if (!t || t.loai !== 'access' || t.hetHan < now()) throw new InvalidTokenError('Invalid or expired token');
      // Kiểm tra lại allowlist mỗi lần: đổi ALLOWED_GITHUB_USER là thu hồi quyền ngay.
      if (!kiemTraNguoiDung(t.login, config.allowedGithubUser)) throw new InvalidTokenError('Account is no longer allowed');
      return { token, clientId: t.clientId, scopes: t.scopes, expiresAt: Math.floor(t.hetHan / 1000), resource: t.resource ? new URL(t.resource) : undefined, extra: { login: t.login } };
    },

    async revokeToken(_client, request) {
      delete tt.tokens[bam(request.token)];
      luu();
    },
  };

  // --- Metadata để Claude tự khám phá các endpoint (đường dẫn dưới /oauth/) ---
  const oauthMetadata = {
    issuer: issuer.href,
    authorization_endpoint: url('/oauth/authorize'),
    token_endpoint: url('/oauth/token'),
    registration_endpoint: url('/oauth/register'),
    revocation_endpoint: url('/oauth/revoke'),
    response_types_supported: ['code'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['client_secret_post', 'none'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    scopes_supported: ['mcp'],
  };
  const protectedResource = {
    resource: resourceUrl.href,
    authorization_servers: [issuer.href],
    scopes_supported: ['mcp'],
    resource_name: 'VNTravelTips',
  };

  const router: Router = express.Router();
  router.use('/.well-known/oauth-authorization-server', metadataHandler(oauthMetadata));
  router.use('/.well-known/oauth-protected-resource/mcp', metadataHandler(protectedResource));
  router.use('/oauth/authorize', authorizationHandler({ provider }));
  router.use('/oauth/token', tokenHandler({ provider }));
  router.use('/oauth/register', clientRegistrationHandler({ clientsStore: provider.clientsStore }));
  router.use('/oauth/revoke', revocationHandler({ provider }));

  // Bước 2: GitHub gọi lại. Mọi nhánh lỗi trả thông báo chung, không lộ chi tiết nội bộ.
  router.get('/oauth/github/callback', async (req, res) => {
    const sid = typeof req.query.state === 'string' ? req.query.state : '';
    const ma = typeof req.query.code === 'string' ? req.query.code : '';
    const k = bam(sid);
    const cho = choDangNhap.get(k);
    choDangNhap.delete(k); // state chỉ dùng một lần
    if (!cho || cho.hetHan < now() || !ma) {
      return void res.status(400).type('text').send('Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Hãy kết nối lại từ Claude.');
    }
    try {
      const kq = await dangNhapGithub(config, ma, callbackUrl, fetchFn);
      if (!kq) return void res.status(502).type('text').send('Không đăng nhập được với GitHub.');
      const login = kq.login;
      if (!kiemTraNguoiDung(login, config.allowedGithubUser)) {
        return void res.status(403).type('text').send('Tài khoản GitHub này không được phép dùng VNTravelTips.');
      }
      const code = ngauNhien();
      maCap.set(bam(code), {
        clientId: cho.client.client_id,
        codeChallenge: cho.params.codeChallenge,
        redirectUri: cho.params.redirectUri,
        login,
        scopes: cho.params.scopes?.length ? cho.params.scopes : ['mcp'],
        resource: cho.params.resource?.href,
        hetHan: now() + TTL_MA,
      });
      const dich = new URL(cho.params.redirectUri);
      dich.searchParams.set('code', code);
      if (cho.params.state) dich.searchParams.set('state', cho.params.state);
      res.redirect(dich.href);
    } catch {
      res.status(502).type('text').send('Không đăng nhập được với GitHub.');
    }
  });

  const requireAuth: RequestHandler = requireBearerAuth({
    verifier: provider,
    resourceMetadataUrl: url('/.well-known/oauth-protected-resource/mcp'),
  });

  return { router, requireAuth, provider };
}
