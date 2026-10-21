import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app';
import { trangThaiToken } from '../anh/token';
import { loadConfig } from '../config';

const GH_TOKEN = 'gho_TOKEN_CMS_RAT_BI_MAT';
const ORIGIN = 'https://x.test';
const config = loadConfig({
  GITHUB_TOKEN: 't', GITHUB_REPO: 'a/b', ALLOWED_GITHUB_USER: 'Chu-Blog',
  PUBLIC_BASE_URL: ORIGIN, PREVIEW_BASE_URL: 'https://y.test',
  ANH_DIR: '/khong/ghi/duoc', SESSION_SECRET: 's'.repeat(40),
  GITHUB_OAUTH_CLIENT_ID: 'gh-id', GITHUB_OAUTH_CLIENT_SECRET: 'gh-secret', GITHUB_WEBHOOK_SECRET: 'whsec',
});
const giaGithub = (login: string) =>
  (async (url: string) =>
    new Response(JSON.stringify(String(url).includes('access_token') ? { access_token: GH_TOKEN } : { login }), {
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch;
const taoApp = (login = 'chu-blog', now?: () => number) => createApp(config, { fetchFn: giaGithub(login), khongLuuOAuth: true, now });

async function batDau(app: ReturnType<typeof taoApp>, duongDan: string) {
  const r = await request(app).get(duongDan);
  expect(r.status).toBe(302);
  const u = new URL(r.headers.location);
  expect(u.origin + u.pathname).toBe('https://github.com/login/oauth/authorize');
  expect(u.searchParams.get('client_id')).toBe('gh-id');
  expect(u.searchParams.get('redirect_uri')).toBe(`${ORIGIN}/oauth/cms/callback`);
  return { state: u.searchParams.get('state')!, scope: u.searchParams.get('scope')! };
}

afterEach(() => vi.restoreAllMocks());

describe('/oauth/cms/auth → /oauth/cms/callback (Sveltia CMS)', () => {
  it('đúng tài khoản → trang trả token cho cửa sổ mở nó, CSP có nonce, chỉ gửi tới đúng origin', async () => {
    const app = taoApp();
    const { state, scope } = await batDau(app, '/oauth/cms/auth?provider=github&site_id=x&scope=repo');
    expect(scope).toBe('repo');
    const r = await request(app).get('/oauth/cms/callback').query({ code: 'ma-gh', state });
    expect(r.status).toBe(200);
    expect(r.text).toContain('authorizing:github');
    expect(r.text).toContain('authorization:github:success:');
    expect(r.text).toContain(GH_TOKEN);
    expect(r.text).toContain(`"${ORIGIN}"`);
    expect(r.text).not.toMatch(/postMessage\([^)]*"\*"/);
    const nonce = /nonce="([^"]+)"/.exec(r.text)![1];
    expect(r.headers['content-security-policy']).toContain(`'nonce-${nonce}'`);
    expect(r.headers['content-security-policy']).toContain("default-src 'none'");
    expect(r.headers['cache-control']).toContain('no-store');
  });

  it('tài khoản GitHub khác allowlist → 403, KHÔNG có token trong phản hồi', async () => {
    const app = taoApp('ke-la-mat');
    const { state } = await batDau(app, '/oauth/cms/auth');
    const r = await request(app).get('/oauth/cms/callback').query({ code: 'ma-gh', state });
    expect(r.status).toBe(403);
    expect(r.text).not.toContain(GH_TOKEN);
    expect(r.text).not.toContain('authorization:github:success');
  });

  it('state sai / giả mạo / thiếu → 400', async () => {
    const app = taoApp();
    const { state } = await batDau(app, '/oauth/cms/auth');
    const giaMao = state.slice(0, -2) + (state.endsWith('aa') ? 'bb' : 'aa');
    for (const s of [giaMao, 'rac', '', state.replace(/^\d+/, '9999999999999')]) {
      const r = await request(app).get('/oauth/cms/callback').query({ code: 'ma-gh', state: s });
      expect(r.status, `state="${s.slice(0, 20)}"`).toBe(400);
    }
    expect((await request(app).get('/oauth/cms/callback').query({ state })).status).toBe(400); // thiếu code
  });

  it('state hết hạn sau 10 phút → 400', async () => {
    let t = 1_000_000;
    const app = taoApp('chu-blog', () => t);
    const { state } = await batDau(app, '/oauth/cms/auth');
    t += 10 * 60_000 + 1;
    expect((await request(app).get('/oauth/cms/callback').query({ code: 'x', state })).status).toBe(400);
  });

  it('token GitHub không lọt vào log', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const app = taoApp();
    const { state } = await batDau(app, '/oauth/cms/auth');
    await request(app).get('/oauth/cms/callback').query({ code: 'x', state });
    expect(JSON.stringify([log.mock.calls, err.mock.calls])).not.toContain(GH_TOKEN);
  });
});

describe('/oauth/cms/tai-anh (nút "Tải ảnh" ở /admin)', () => {
  it('đăng nhập đúng tài khoản → chuyển sang /tai-anh/<token hợp lệ>, không lộ token GitHub', async () => {
    const app = taoApp();
    const { state, scope } = await batDau(app, '/oauth/cms/tai-anh');
    expect(scope).toBe('read:user'); // chỉ cần biết "bạn là ai", không cần quyền repo
    const r = await request(app).get('/oauth/cms/callback').query({ code: 'ma-gh', state });
    expect(r.status).toBe(302);
    const m = /^\/tai-anh\/([a-f0-9]{64})$/.exec(r.headers.location)!;
    expect(m).not.toBeNull();
    expect(trangThaiToken(m[1])).toBe('ok');
    expect(JSON.stringify([r.text, r.headers])).not.toContain(GH_TOKEN);
  });

  it('tài khoản lạ → 403, không tạo token tải ảnh', async () => {
    const app = taoApp('ke-la-mat');
    const { state } = await batDau(app, '/oauth/cms/tai-anh');
    const r = await request(app).get('/oauth/cms/callback').query({ code: 'ma-gh', state });
    expect(r.status).toBe(403);
    expect(r.headers.location).toBeUndefined();
  });

  it('state của luồng CMS không dùng được để lấy link tải ảnh bằng scope khác (mục đích ghi trong state có chữ ký)', async () => {
    const app = taoApp();
    const { state } = await batDau(app, '/oauth/cms/auth');
    const doiMucDich = state.replace('.cms.', '.tai-anh.');
    expect((await request(app).get('/oauth/cms/callback').query({ code: 'x', state: doiMucDich })).status).toBe(400);
  });
});
