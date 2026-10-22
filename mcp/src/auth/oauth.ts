// Đăng nhập OAuth 2.1 để Claude (claude.ai web + app iOS) kết nối MCP.
// Vai trò: server MCP của ta là "authorization server" với Claude; việc xác minh CON NGƯỜI dùng chính TÀI KHOẢN ADMIN của blog
// (email + mật khẩu + mã 2FA nếu có) qua form do server trả:
//   Claude → /oauth/authorize (HTML form) → POST /oauth/dang-nhap (mật khẩu, rồi mã 2FA) → cấp mã → Claude đổi mã lấy token
//   ở /oauth/token (có PKCE) → gọi /mcp. Token MCP gắn với `nguoi_dung_id`; khoá tài khoản / đổi mật khẩu → token bị xoá ngay.
// Mặc định đóng: không token hợp lệ thì /mcp trả 401. Client đăng ký và token (chỉ lưu dạng băm) nằm trong SQLite.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import express, { type Request, type RequestHandler, type Response, type Router } from 'express';
import { authorizationHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/authorize.js';
import { clientRegistrationHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/register.js';
import { metadataHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/metadata.js';
import { revocationHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/revoke.js';
import { tokenHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/token.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { InvalidClientMetadataError, InvalidGrantError, InvalidTokenError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import type { AuthorizationParams, OAuthServerProvider } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { OAuthClientInformationFull, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js';
import { thuMa } from '../admin-api/hai-lop';
import { laHttps } from '../admin-api/xac-thuc';
import type { Config } from '../config';
import type { Db } from '../db/ket-noi';
import { taoChongDo, tuanTu } from '../tai-khoan/chong-do';
import { bamMatKhau, kiemMatKhau } from '../tai-khoan/mat-khau';
import { docMatKhauBam, timTheoEmail, timTheoId } from '../tai-khoan/nguoi-dung';
import { ghiNhatKy } from '../tai-khoan/nhat-ky';

export interface OAuthDeps {
  now?: () => number;
  /** Chờ ms mili giây (làm chậm IP bị dò); test truyền bản giả. */
  cho?: (ms: number) => Promise<void>;
}

const PHUT = 60_000;
const NGAY = 24 * 60 * PHUT;
const TTL_STATE = 10 * PHUT; // thời gian để người dùng đăng nhập
const TTL_MA = 5 * PHUT;
const TTL_ACCESS = 60 * PHUT;
const TTL_REFRESH = 30 * NGAY;
const TOI_DA_CLIENT = 50;

const bam = (s: string) => createHash('sha256').update(s).digest('hex');
const ngauNhien = () => randomBytes(32).toString('base64url');
const escHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

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

interface ChoDangNhap {
  client: OAuthClientInformationFull;
  params: AuthorizationParams;
  hetHan: number;
  /** Đã nhập đúng mật khẩu, đang chờ mã 2FA. */
  nguoiDungId?: number;
}
interface MaCap {
  clientId: string;
  codeChallenge: string;
  redirectUri: string;
  nguoiDungId: number;
  scopes: string[];
  resource?: string;
  hetHan: number;
}

const SAI_DANG_NHAP = 'Sai email hoặc mật khẩu';
// form-action: trình duyệt kiểm cả ĐÍCH CHUYỂN HƯỚNG sau khi gửi form → phải cho phép nơi nhận mã (claude.ai/claude.com, hoặc loopback cho Claude Code).
const CSP = "default-src 'none'; style-src 'unsafe-inline'; form-action 'self' https://claude.ai https://claude.com http://localhost:* http://127.0.0.1:*; frame-ancestors 'none'; base-uri 'none'";
/** Mỗi lượt đăng nhập một cookie riêng (tên theo sid) → nhiều lượt song song (web + app iOS, thử lại) không đè nhau. */
const tenCookie = (sid: string) => `vtt_oauth_${bam(sid).slice(0, 16)}`;

function trangForm(o: { sid: string; buoc: 'mat-khau' | 'totp'; loi?: string; tenClient?: string }): string {
  const noiDung =
    o.buoc === 'mat-khau'
      ? `<p>${escHtml(o.tenClient || 'Claude')} muốn kết nối với VNTravelTips. Đăng nhập bằng tài khoản quản trị của blog để cho phép.</p>
<label for="email">Email</label><input id="email" name="email" type="email" autocomplete="username" required autofocus>
<label for="mk">Mật khẩu</label><input id="mk" name="matKhau" type="password" autocomplete="current-password" required>`
      : `<p>Nhập mã 6 số từ ứng dụng xác thực (hoặc một mã dự phòng).</p>
<label for="ma">Mã xác thực</label><input id="ma" name="ma" type="text" inputmode="numeric" autocomplete="one-time-code" required autofocus>`;
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Kết nối Claude — VNTravelTips</title><style>body{font:18px/1.6 system-ui,sans-serif;max-width:26rem;margin:8vh auto;padding:0 1rem;color:#1f2937}label{display:block;margin-top:1rem}input{display:block;width:100%;box-sizing:border-box;min-height:44px;font:inherit;padding:.4rem .6rem}button{margin-top:1.2rem;min-height:44px;font:inherit;padding:0 1.2rem;background:#0f766e;color:#fff;border:0;border-radius:6px}.loi{color:#b91c1c}</style></head><body><h1>VNTravelTips</h1>${o.loi ? `<p class="loi" role="alert">${escHtml(o.loi)}</p>` : ''}<form method="post" action="/oauth/dang-nhap"><input type="hidden" name="state" value="${escHtml(o.sid)}">${noiDung}<button type="submit">${o.buoc === 'mat-khau' ? 'Đăng nhập và cho phép' : 'Xác nhận'}</button></form></body></html>`;
}

export function createOAuth(config: Config, db: Db, deps: OAuthDeps = {}) {
  const now = deps.now ?? Date.now;
  const cho = deps.cho ?? ((ms: number) => new Promise<void>((xong) => setTimeout(xong, ms)));
  const chongDo = taoChongDo(db, now);

  // Nhập client từ file cũ `.oauth-state.json` (trước đây lưu ở volume ảnh) rồi xoá file. Token cũ gắn với GitHub nên BỎ — Claude phải kết nối lại.
  const fileCu = join(config.anhDir, '.oauth-state.json');
  if (existsSync(fileCu)) {
    try {
      const cu = JSON.parse(readFileSync(fileCu, 'utf8')) as { clients?: Record<string, OAuthClientInformationFull> };
      const them = db.prepare('INSERT OR IGNORE INTO oauth_client (client_id, du_lieu, tao_luc) VALUES (?,?,?)');
      for (const [id, c] of Object.entries(cu.clients ?? {})) them.run(id, JSON.stringify(c), now());
      unlinkSync(fileCu);
    } catch (e) {
      console.error('Không nhập được .oauth-state.json cũ:', (e as Error).message);
    }
  }

  const layClient = (id: string): OAuthClientInformationFull | undefined => {
    const r = db.prepare('SELECT du_lieu FROM oauth_client WHERE client_id = ?').get(id) as { du_lieu: string } | undefined;
    return r ? (JSON.parse(r.du_lieu) as OAuthClientInformationFull) : undefined;
  };
  const demClient = () => (db.prepare('SELECT count(*) AS n FROM oauth_client').get() as { n: number }).n;
  const donTokenHetHan = () => void db.prepare('DELETE FROM oauth_token WHERE het_han_luc < ?').run(now());
  // Khi đã đủ chỗ: bỏ các client đăng ký quá 24 giờ mà chưa từng được cấp token → kẻ lạ không thể giữ kín 50 chỗ mãi.
  const donClientBoHoang = () =>
    void db.prepare('DELETE FROM oauth_client WHERE tao_luc < ? AND client_id NOT IN (SELECT client_id FROM oauth_token)').run(now() - NGAY);

  // --- Trạng thái tạm trong bộ nhớ ---
  const choDangNhap = new Map<string, ChoDangNhap>(); // khoá = băm của sid
  const maCap = new Map<string, MaCap>(); // khoá = băm của mã

  const goc = new URL(config.publicBaseUrl);
  const issuer = new URL('/', goc);
  const url = (p: string) => new URL(p, goc).href;
  const resourceUrl = new URL('/mcp', goc);

  function phatHanhToken(clientId: string, nguoiDungId: number, scopes: string[], resource?: URL): OAuthTokens {
    const access = ngauNhien();
    const refresh = ngauNhien();
    const r = resource?.href ?? null;
    const them = db.prepare('INSERT INTO oauth_token (token_bam, loai, client_id, nguoi_dung_id, het_han_luc, scopes, resource) VALUES (?,?,?,?,?,?,?)');
    them.run(bam(access), 'access', clientId, nguoiDungId, now() + TTL_ACCESS, JSON.stringify(scopes), r);
    them.run(bam(refresh), 'refresh', clientId, nguoiDungId, now() + TTL_REFRESH, JSON.stringify(scopes), r);
    donTokenHetHan();
    return { access_token: access, token_type: 'Bearer', expires_in: TTL_ACCESS / 1000, refresh_token: refresh, scope: scopes.join(' ') };
  }
  interface DongToken { loai: 'access' | 'refresh'; client_id: string; nguoi_dung_id: number; het_han_luc: number; scopes: string; resource: string | null }
  const layToken = (token: string) => db.prepare('SELECT loai, client_id, nguoi_dung_id, het_han_luc, scopes, resource FROM oauth_token WHERE token_bam = ?').get(bam(token)) as DongToken | undefined;
  /** Người dùng của token còn dùng được không (tồn tại, chưa bị khoá). */
  const nguoiConDung = (id: number) => {
    const u = timTheoId(db, id);
    return u !== null && !u.biKhoa;
  };

  const provider: OAuthServerProvider = {
    clientsStore: {
      getClient: (id) => layClient(id),
      registerClient: (client) => {
        // Chỉ nhận redirect_uri của Claude (hoặc loopback cho Claude Code). Nếu không, kẻ lạ đăng ký client với
        // redirect_uri của mình rồi gửi link /oauth/authorize cho chủ blog — mã đăng nhập sẽ về tay kẻ lạ.
        if (!client.redirect_uris.every((u) => redirectUriHopLe(String(u)))) {
          throw new InvalidClientMetadataError('redirect_uri must be a Claude callback URL or a loopback address');
        }
        if (demClient() >= TOI_DA_CLIENT) donClientBoHoang();
        if (demClient() >= TOI_DA_CLIENT) throw new Error('Đã đăng ký quá nhiều client');
        const full = { ...client, client_id: randomUUID(), client_id_issued_at: Math.floor(now() / 1000) } as OAuthClientInformationFull;
        db.prepare('INSERT INTO oauth_client (client_id, du_lieu, tao_luc) VALUES (?,?,?)').run(full.client_id, JSON.stringify(full), now());
        return full;
      },
    },

    // Bước 1: chưa biết người dùng là ai → trả form đăng nhập admin (cookie riêng + state trong form chống CSRF/đăng nhập chéo).
    async authorize(client, params, res: Response) {
      const sid = ngauNhien();
      donHetHan(choDangNhap, now());
      donHetHan(maCap, now());
      choDangNhap.set(bam(sid), { client, params, hetHan: now() + TTL_STATE });
      res.cookie(tenCookie(sid), sid, { httpOnly: true, sameSite: 'lax', path: '/oauth', secure: laHttps(config), maxAge: TTL_STATE });
      res.status(200).set({ 'Cache-Control': 'no-store', 'Content-Security-Policy': CSP, 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer' }).type('html').send(trangForm({ sid, buoc: 'mat-khau', tenClient: client.client_name }));
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
      if (!nguoiConDung(m.nguoiDungId)) throw new InvalidGrantError('Tài khoản không còn dùng được');
      return phatHanhToken(m.clientId, m.nguoiDungId, m.scopes, resource ?? (m.resource ? new URL(m.resource) : undefined));
    },

    async exchangeRefreshToken(client, refreshToken) {
      const t = layToken(refreshToken);
      db.prepare('DELETE FROM oauth_token WHERE token_bam = ?').run(bam(refreshToken)); // xoay vòng: mỗi refresh token chỉ dùng một lần
      if (!t || t.loai !== 'refresh' || t.client_id !== client.client_id || t.het_han_luc < now() || !nguoiConDung(t.nguoi_dung_id)) {
        throw new InvalidGrantError('Refresh token không hợp lệ');
      }
      return phatHanhToken(t.client_id, t.nguoi_dung_id, JSON.parse(t.scopes) as string[], t.resource ? new URL(t.resource) : undefined);
    },

    async verifyAccessToken(token) {
      const t = layToken(token);
      // Lưu ý: thông điệp của InvalidTokenError được đưa vào header WWW-Authenticate → PHẢI là ASCII (có dấu sẽ làm Node văng lỗi 500).
      if (!t || t.loai !== 'access' || t.het_han_luc < now()) throw new InvalidTokenError('Invalid or expired token');
      // Kiểm tra lại người dùng mỗi lần: khoá tài khoản là thu hồi quyền ngay (đổi mật khẩu/khoá còn xoá hẳn token).
      if (!nguoiConDung(t.nguoi_dung_id)) throw new InvalidTokenError('Account is no longer allowed');
      return { token, clientId: t.client_id, scopes: JSON.parse(t.scopes) as string[], expiresAt: Math.floor(t.het_han_luc / 1000), resource: t.resource ? new URL(t.resource) : undefined, extra: { nguoiDungId: t.nguoi_dung_id } };
    },

    async revokeToken(_client, request) {
      db.prepare('DELETE FROM oauth_token WHERE token_bam = ?').run(bam(request.token));
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

  const traForm = (res: Response, status: number, sid: string, buoc: 'mat-khau' | 'totp', loi?: string, tenClient?: string) =>
    void res.status(status).set({ 'Cache-Control': 'no-store', 'Content-Security-Policy': CSP, 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer' }).type('html').send(trangForm({ sid, buoc, loi, tenClient }));

  function cookieOauth(req: Request, sid: string): string {
    const m = new RegExp(`(?:^|;\\s*)${tenCookie(sid)}=([^;]+)`).exec(req.headers.cookie ?? '');
    try {
      return m ? decodeURIComponent(m[1]!) : '';
    } catch {
      return ''; // cookie hỏng: coi như không có
    }
  }

  // Bước 2: form gửi về đây — lần 1 (email + mật khẩu), lần 2 (mã 2FA nếu tài khoản có). Sai thì hiện lại form; đúng thì cấp mã và về Claude.
  router.post('/oauth/dang-nhap', express.urlencoded({ extended: false, limit: '8kb' }), (req, res, next) => {
    tuanTu(req.ip ?? 'khong-ro', () => xuLyDangNhap(req, res)).catch(next);
  });

  async function xuLyDangNhap(req: Request, res: Response): Promise<void> {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const sid = typeof body.state === 'string' ? body.state : '';
    // State trong form PHẢI khớp cookie của chính trình duyệt này (chống bị lừa đăng nhập vào phiên của người khác).
    const k = bam(sid);
    const cho_ = sid && cookieOauth(req, sid) === sid ? choDangNhap.get(k) : undefined;
    if (!cho_ || cho_.hetHan < now()) {
      choDangNhap.delete(k);
      res.status(400).type('text').send('Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Hãy kết nối lại từ Claude.');
      return;
    }
    const ip = req.ip ?? 'khong-ro';

    if (cho_.nguoiDungId === undefined) {
      // --- Lần 1: email + mật khẩu (cùng bộ đếm chống dò với /api/admin/dang-nhap) ---
      const email = typeof body.email === 'string' ? body.email : '';
      const matKhau = typeof body.matKhau === 'string' ? body.matKhau : '';
      if (!email || !matKhau) return void traForm(res, 400, sid, 'mat-khau', 'Cần nhập email và mật khẩu', cho_.client.client_name);
      const kt = chongDo.kiemTra(ip, email);
      if (!kt.choPhep) return void traForm(res, 429, sid, 'mat-khau', 'Đăng nhập sai quá nhiều lần. Hãy thử lại sau.', cho_.client.client_name);
      if (kt.treMs > 0) await cho(kt.treMs);
      const u = timTheoEmail(db, email);
      let dung = false;
      if (u && !u.biKhoa) dung = await kiemMatKhau(docMatKhauBam(db, u.id)!, matKhau);
      else await kiemMatKhau(await bamGia(), matKhau); // tốn cùng thời gian khi email không có tài khoản
      if (!u || !dung) {
        chongDo.ghiThatBai(ip, email);
        ghiNhatKy(db, { nguoiDungId: u?.id, loai: 'dang-nhap-oauth-that-bai', ip }, now);
        return void traForm(res, 401, sid, 'mat-khau', SAI_DANG_NHAP, cho_.client.client_name);
      }
      if (u.coTotp) {
        cho_.nguoiDungId = u.id; // đúng một nửa: chưa xoá bộ đếm sai, chờ mã 2FA
        return void traForm(res, 200, sid, 'totp', undefined, cho_.client.client_name);
      }
      if (u.vaiTro === 'quan-tri') {
        // Quản trị bắt buộc 2FA: chưa bật thì không cho kết nối Claude (mật khẩu đúng nhưng chưa đủ yếu tố).
        return void traForm(res, 403, sid, 'mat-khau', 'Tài khoản quản trị cần bật xác thực 2 lớp trong trang quản trị trước khi kết nối Claude.', cho_.client.client_name);
      }
      chongDo.ghiThanhCong(ip, email);
      return capMa(res, k, cho_, u.id, ip);
    }

    // --- Lần 2: mã 2FA ---
    const u = timTheoId(db, cho_.nguoiDungId);
    if (!u || u.biKhoa) {
      choDangNhap.delete(k);
      res.status(400).type('text').send('Phiên đăng nhập không hợp lệ. Hãy kết nối lại từ Claude.');
      return;
    }
    const ma = typeof body.ma === 'string' ? body.ma.trim() : '';
    const kt = chongDo.kiemTra(ip, u.email);
    if (!kt.choPhep) return void traForm(res, 429, sid, 'totp', 'Nhập sai quá nhiều lần. Hãy thử lại sau.', cho_.client.client_name);
    if (!thuMa(db, config.khoaBiMat, u.id, ma, now())) {
      chongDo.ghiThatBai(ip, u.email);
      ghiNhatKy(db, { nguoiDungId: u.id, loai: 'dang-nhap-oauth-totp-that-bai', ip }, now);
      return void traForm(res, 401, sid, 'totp', 'Mã xác thực không đúng', cho_.client.client_name);
    }
    chongDo.ghiThanhCong(ip, u.email);
    capMa(res, k, cho_, u.id, ip);
  }

  function capMa(res: Response, k: string, cho_: ChoDangNhap, nguoiDungId: number, ip: string): void {
    choDangNhap.delete(k); // state chỉ dùng một lần
    const code = ngauNhien();
    maCap.set(bam(code), {
      clientId: cho_.client.client_id,
      codeChallenge: cho_.params.codeChallenge,
      redirectUri: cho_.params.redirectUri,
      nguoiDungId,
      scopes: cho_.params.scopes?.length ? cho_.params.scopes : ['mcp'],
      resource: cho_.params.resource?.href,
      hetHan: now() + TTL_MA,
    });
    ghiNhatKy(db, { nguoiDungId, loai: 'dang-nhap-oauth', ip, chiTiet: { client: cho_.client.client_name ?? '' } }, now);
    res.clearCookie(`vtt_oauth_${k.slice(0, 16)}`, { path: '/oauth' });
    const dich = new URL(cho_.params.redirectUri);
    dich.searchParams.set('code', code);
    if (cho_.params.state) dich.searchParams.set('state', cho_.params.state);
    res.redirect(303, dich.href); // 303: trình duyệt chuyển sang GET, không gửi lại mật khẩu cho redirect_uri
  }

  const bearer = requireBearerAuth({ verifier: provider, resourceMetadataUrl: url('/.well-known/oauth-protected-resource/mcp') });
  /** Sau khi token hợp lệ: gắn `req.nguoiDung` (người dùng admin của token) cho các tool kiểm quyền. */
  const ganNguoiDung: RequestHandler = (req, res, next) => {
    const id = (req as Request & { auth?: { extra?: { nguoiDungId?: unknown } } }).auth?.extra?.nguoiDungId;
    const u = typeof id === 'number' ? timTheoId(db, id) : null;
    if (!u || u.biKhoa) return void res.status(401).json({ error: 'invalid_token', error_description: 'Account is no longer allowed' });
    req.nguoiDung = u;
    next();
  };
  const requireAuth: RequestHandler[] = [bearer, ganNguoiDung];

  return { router, requireAuth, provider };
}

let bamGiaCache: Promise<string> | undefined;
const bamGia = () => (bamGiaCache ??= bamMatKhau('khong-ai-dung-mat-khau-nay'));
