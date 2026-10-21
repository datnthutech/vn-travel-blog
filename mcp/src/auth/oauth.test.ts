import { createHash, randomBytes } from 'node:crypto';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app';
import { loadConfig } from '../config';
import { kiemTraNguoiDung } from './oauth';

const GH_TOKEN = 'gho_TOKEN_GITHUB_RAT_BI_MAT';
const REDIRECT = 'https://claude.ai/api/mcp/auth_callback';
const HOST = 'x.test';

const config = loadConfig({
  GITHUB_TOKEN: 't', GITHUB_REPO: 'a/b', ALLOWED_GITHUB_USER: 'Chu-Blog',
  PUBLIC_BASE_URL: `https://${HOST}`, PREVIEW_BASE_URL: 'https://y.test',
  ANH_DIR: '/khong/ghi/duoc', SESSION_SECRET: 'x'.repeat(32),
  GITHUB_OAUTH_CLIENT_ID: 'gh-id', GITHUB_OAUTH_CLIENT_SECRET: 'gh-secret', GITHUB_WEBHOOK_SECRET: 'whsec',
});

// Giả GitHub: đổi code lấy token, rồi hỏi /user ra tài khoản `login`.
const giaGithub = (login: string) =>
  (async (url: string) =>
    new Response(JSON.stringify(String(url).includes('access_token') ? { access_token: GH_TOKEN } : { login }), {
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch;

const taoApp = (login = 'chu-blog', now?: () => number) =>
  createApp(config, { fetchFn: giaGithub(login), khongLuuOAuth: true, now });

const pkce = () => {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
};

async function dangKy(app: ReturnType<typeof taoApp>) {
  const r = await request(app)
    .post('/oauth/register')
    .send({
      redirect_uris: [REDIRECT], token_endpoint_auth_method: 'none', client_name: 'Claude',
      grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'],
    });
  expect(r.status).toBe(201);
  return r.body.client_id as string;
}

// Đi hết bước authorize → GitHub callback; trả sid (state gửi sang GitHub) và các giá trị cần dùng tiếp.
async function batDauDangNhap(app: ReturnType<typeof taoApp>, clientId: string, challenge: string) {
  const r = await request(app).get('/oauth/authorize').query({
    client_id: clientId, redirect_uri: REDIRECT, response_type: 'code',
    code_challenge: challenge, code_challenge_method: 'S256', state: 'trang-thai-cua-claude',
    resource: `https://${HOST}/mcp`,
  });
  expect(r.status).toBe(302);
  const url = new URL(r.headers.location);
  expect(url.origin + url.pathname).toBe('https://github.com/login/oauth/authorize');
  expect(url.searchParams.get('client_id')).toBe('gh-id');
  expect(url.searchParams.get('redirect_uri')).toBe(`https://${HOST}/oauth/github/callback`);
  return url.searchParams.get('state')!;
}

async function dangNhapXong(app: ReturnType<typeof taoApp>) {
  const clientId = await dangKy(app);
  const { verifier, challenge } = pkce();
  const sid = await batDauDangNhap(app, clientId, challenge);
  const cb = await request(app).get('/oauth/github/callback').query({ code: 'ma-github', state: sid });
  return { clientId, verifier, cb };
}

const doiToken = (app: ReturnType<typeof taoApp>, p: Record<string, string>) =>
  request(app).post('/oauth/token').type('form').send(p);

afterEach(() => vi.restoreAllMocks());

describe('kiemTraNguoiDung', () => {
  it('so sánh không phân biệt hoa thường, sai thì false', () => {
    expect(kiemTraNguoiDung('chu-blog', 'Chu-Blog')).toBe(true);
    expect(kiemTraNguoiDung('ke-la', 'Chu-Blog')).toBe(false);
    expect(kiemTraNguoiDung('', 'Chu-Blog')).toBe(false);
  });
});

describe('/mcp mặc định đóng', () => {
  it('không token → 401 kèm chỉ dẫn metadata', async () => {
    const r = await request(taoApp()).post('/mcp').set('Host', HOST).send({});
    expect(r.status).toBe(401);
    expect(r.headers['www-authenticate']).toContain('resource_metadata');
  });

  it('token lạ → 401', async () => {
    const r = await request(taoApp()).post('/mcp').set('Host', HOST).set('Authorization', 'Bearer rac').send({});
    expect(r.status).toBe(401);
  });
});

describe('đăng ký client chỉ nhận redirect_uri hợp lệ (chống lừa chủ blog cấp quyền cho kẻ lạ)', () => {
  const dk = (redirect_uris: string[]) =>
    request(taoApp()).post('/oauth/register').send({
      redirect_uris, token_endpoint_auth_method: 'none', client_name: 'X',
      grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'],
    });

  it.each([
    ['https://claude.ai/api/mcp/auth_callback'],
    ['https://claude.com/api/mcp/auth_callback'],
    ['http://localhost:54321/callback'],
    ['http://127.0.0.1:3456/callback'],
  ])('chấp nhận %s', async (u) => {
    expect((await dk([u])).status).toBe(201);
  });

  it.each([
    ['https://evil.example/cb'],
    ['https://claude.ai.evil.example/api/mcp/auth_callback'],
    ['https://claude.ai/khac/duong-dan'],
    ['http://claude.ai/api/mcp/auth_callback'],
    ['http://localhost.evil.example/cb'],
    ['javascript:alert(1)'],
  ])('từ chối %s', async (u) => {
    const r = await dk([u]);
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('invalid_client_metadata');
  });

  it('một URI lạ lẫn trong danh sách cũng bị từ chối cả đơn', async () => {
    expect((await dk(['https://claude.ai/api/mcp/auth_callback', 'https://evil.example/cb'])).status).toBe(400);
  });
});

describe('metadata OAuth', () => {
  it('trỏ các endpoint về /oauth/*', async () => {
    const r = await request(taoApp()).get('/.well-known/oauth-authorization-server');
    expect(r.status).toBe(200);
    expect(r.body.issuer).toBe(`https://${HOST}/`);
    expect(r.body.authorization_endpoint).toBe(`https://${HOST}/oauth/authorize`);
    expect(r.body.token_endpoint).toBe(`https://${HOST}/oauth/token`);
    expect(r.body.registration_endpoint).toBe(`https://${HOST}/oauth/register`);
    expect(r.body.code_challenge_methods_supported).toEqual(['S256']);
  });

  it('protected resource nêu /mcp và authorization server', async () => {
    const r = await request(taoApp()).get('/.well-known/oauth-protected-resource/mcp');
    expect(r.status).toBe(200);
    expect(r.body.resource).toBe(`https://${HOST}/mcp`);
    expect(r.body.authorization_servers).toEqual([`https://${HOST}/`]);
  });
});

describe('luồng đăng nhập đầy đủ', () => {
  it('đúng tài khoản → mã → token → gọi được /mcp (initialize)', async () => {
    const app = taoApp();
    const { clientId, verifier, cb } = await dangNhapXong(app);
    expect(cb.status).toBe(302);
    const dich = new URL(cb.headers.location);
    expect(dich.origin + dich.pathname).toBe(REDIRECT);
    expect(dich.searchParams.get('state')).toBe('trang-thai-cua-claude');
    const code = dich.searchParams.get('code')!;

    const t = await doiToken(app, {
      grant_type: 'authorization_code', code, code_verifier: verifier, client_id: clientId, redirect_uri: REDIRECT,
    });
    expect(t.status).toBe(200);
    expect(t.body.token_type.toLowerCase()).toBe('bearer');
    expect(t.body.access_token).toBeTruthy();
    expect(t.body.refresh_token).toBeTruthy();

    const init = await request(app)
      .post('/mcp').set('Host', HOST)
      .set('Authorization', `Bearer ${t.body.access_token}`)
      .set('Accept', 'application/json, text/event-stream')
      .send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 't', version: '1' } } });
    expect(init.status).toBe(200);
    expect(JSON.stringify(init.body)).toContain('vntraveltips');
  });

  it('tài khoản GitHub khác allowlist → 403, KHÔNG cấp mã', async () => {
    const app = taoApp('ke-la-mat');
    const { cb } = await dangNhapXong(app);
    expect(cb.status).toBe(403);
    expect(cb.headers.location).toBeUndefined();
    expect(cb.text).not.toContain('code=');
  });

  it('state lạ → 400; dùng lại state đã dùng → 400', async () => {
    const app = taoApp();
    expect((await request(app).get('/oauth/github/callback').query({ code: 'x', state: 'khong-co' })).status).toBe(400);
    const clientId = await dangKy(app);
    const sid = await batDauDangNhap(app, clientId, pkce().challenge);
    expect((await request(app).get('/oauth/github/callback').query({ code: 'x', state: sid })).status).toBe(302);
    expect((await request(app).get('/oauth/github/callback').query({ code: 'x', state: sid })).status).toBe(400);
  });

  it('state hết hạn (10 phút) → 400', async () => {
    let t = 1_000_000;
    const app = taoApp('chu-blog', () => t);
    const clientId = await dangKy(app);
    const sid = await batDauDangNhap(app, clientId, pkce().challenge);
    t += 10 * 60_000 + 1;
    expect((await request(app).get('/oauth/github/callback').query({ code: 'x', state: sid })).status).toBe(400);
  });

  it('mã chỉ dùng được một lần; PKCE sai bị từ chối', async () => {
    const app = taoApp();
    const { clientId, verifier, cb } = await dangNhapXong(app);
    const code = new URL(cb.headers.location).searchParams.get('code')!;
    const sai = await doiToken(app, { grant_type: 'authorization_code', code, code_verifier: 'sai'.repeat(20), client_id: clientId, redirect_uri: REDIRECT });
    expect(sai.status).toBe(400);
    const dung = await doiToken(app, { grant_type: 'authorization_code', code, code_verifier: verifier, client_id: clientId, redirect_uri: REDIRECT });
    expect(dung.status).toBe(200);
    const lai = await doiToken(app, { grant_type: 'authorization_code', code, code_verifier: verifier, client_id: clientId, redirect_uri: REDIRECT });
    expect(lai.status).toBe(400);
    expect(lai.body.error).toBe('invalid_grant');
  });

  it('refresh token cấp access token mới và vô hiệu refresh cũ', async () => {
    const app = taoApp();
    const { clientId, verifier, cb } = await dangNhapXong(app);
    const code = new URL(cb.headers.location).searchParams.get('code')!;
    const t = await doiToken(app, { grant_type: 'authorization_code', code, code_verifier: verifier, client_id: clientId, redirect_uri: REDIRECT });
    const r1 = await doiToken(app, { grant_type: 'refresh_token', refresh_token: t.body.refresh_token, client_id: clientId });
    expect(r1.status).toBe(200);
    expect(r1.body.access_token).not.toBe(t.body.access_token);
    const r2 = await doiToken(app, { grant_type: 'refresh_token', refresh_token: t.body.refresh_token, client_id: clientId });
    expect(r2.status).toBe(400);
  });

  it('token GitHub không lọt vào response hay log', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const app = taoApp();
    const { cb } = await dangNhapXong(app);
    const hetNoiDung = JSON.stringify([cb.text, cb.headers, log.mock.calls, err.mock.calls, warn.mock.calls]);
    expect(hetNoiDung).not.toContain(GH_TOKEN);
  });
});
