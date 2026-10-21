// OAuth MCP đăng nhập bằng TÀI KHOẢN ADMIN (email + mật khẩu + 2FA), token gắn nguoi_dung_id, lưu SQLite.
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { baiDayDu as _b, dungAdmin, MK } from '../admin-api/thu-nghiem';
import { maHoa } from '../bi-mat';
import { loadConfig } from '../config';
import { moDb } from '../db/ket-noi';
import { taoNguoiDung } from '../tai-khoan/nguoi-dung';
import { maTotpHienTai, taoBiMatTotp } from '../tai-khoan/totp';
import { createOAuth } from './oauth';

void _b;
const REDIRECT = 'https://claude.ai/api/mcp/auth_callback';
type Moi = Awaited<ReturnType<typeof dungAdmin>>;
let m: Moi;
let admin2: Awaited<ReturnType<Moi['dangNhap']>>;
let ipDem = 0;
const HOST = 'localhost:8090';

beforeEach(async () => {
  m = await dungAdmin();
  ipDem = 0;
  // Thư viện MCP kiểm hạn token theo đồng hồ THẬT: đưa đồng hồ giả về giờ thật (rồi đăng nhập quản trị mới, vì phiên cũ tạo ở giờ giả cũ).
  m.dongHo.v = Date.now();
  admin2 = await m.dangNhap('chu2@x.vn', 'Chủ 2', 'quan-tri');
});

const pkce = () => {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
};
async function dangKy() {
  const r = await request(m.app).post('/oauth/register').send({ redirect_uris: [REDIRECT], token_endpoint_auth_method: 'none', client_name: 'Claude', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'] });
  expect(r.status).toBe(201);
  return r.body.client_id as string;
}
/** GET /oauth/authorize → form HTML; trả sid (state trong form) + cookie. */
async function mo(clientId: string, challenge: string, ip: string) {
  const r = await request(m.app).get('/oauth/authorize').set('X-Forwarded-For', ip).query({
    client_id: clientId, redirect_uri: REDIRECT, response_type: 'code', code_challenge: challenge, code_challenge_method: 'S256', state: 'trang-thai-cua-claude', resource: `http://${HOST}/mcp`,
  });
  const sid = /name="state" value="([^"]+)"/.exec(r.text)?.[1] ?? '';
  const cookie = ((r.headers['set-cookie'] as unknown as string[] | undefined) ?? []).map((c) => c.split(';')[0]).join('; ');
  return { r, sid, cookie };
}
const dn = (sid: string, cookie: string, ip: string, body: object) => request(m.app).post('/oauth/dang-nhap').set('X-Forwarded-For', ip).set('Cookie', cookie).type('form').send({ state: sid, ...body });
const taoUser = (email: string, vaiTro: 'quan-tri' | 'quan-ly' | 'writer' = 'quan-ly') => taoNguoiDung(m.db, { email, ten: email, vaiTro, matKhau: MK }, () => m.dongHo.v);
const doiToken = (p: Record<string, string>) => request(m.app).post('/oauth/token').type('form').send(p);
const taoTotp = (id: number, email: string) => {
  const { biMat } = taoBiMatTotp(email);
  m.db.prepare('UPDATE nguoi_dung SET totp_bi_mat = ? WHERE id = ?').run(maHoa('a'.repeat(64), biMat), id);
  return biMat;
};

/** Đi hết luồng với tài khoản quản lý (không 2FA): trả mã cấp + thông tin để đổi token. */
async function dangNhapXong(email = 'ql@x.vn') {
  const ip = `10.9.0.${++ipDem}`;
  await taoUser(email);
  const clientId = await dangKy();
  const { verifier, challenge } = pkce();
  const { sid, cookie } = await mo(clientId, challenge, ip);
  const cb = await dn(sid, cookie, ip, { email, matKhau: MK });
  return { clientId, verifier, cb, sid, cookie, ip };
}
async function layToken(email = 'ql@x.vn') {
  const { clientId, verifier, cb } = await dangNhapXong(email);
  const code = new URL(cb.headers.location).searchParams.get('code')!;
  const t = await doiToken({ grant_type: 'authorization_code', code, code_verifier: verifier, client_id: clientId, redirect_uri: REDIRECT });
  expect(t.status).toBe(200);
  return { ...t.body, clientId } as { access_token: string; refresh_token: string; clientId: string };
}
const goiMcp = (token: string) =>
  request(m.app).post('/mcp').set('Host', HOST).set('Authorization', `Bearer ${token}`).set('Accept', 'application/json, text/event-stream')
    .send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 't', version: '1' } } });

describe('/mcp mặc định đóng', () => {
  it('không token → 401 kèm chỉ dẫn metadata; token lạ → 401', async () => {
    const r = await request(m.app).post('/mcp').set('Host', HOST).send({});
    expect(r.status).toBe(401);
    expect(r.headers['www-authenticate']).toContain('resource_metadata');
    expect((await request(m.app).post('/mcp').set('Host', HOST).set('Authorization', 'Bearer rac').send({})).status).toBe(401);
  });
});

describe('đăng ký client chỉ nhận redirect_uri hợp lệ (chống lừa chủ blog cấp quyền cho kẻ lạ)', () => {
  const dk = (redirect_uris: string[]) => request(m.app).post('/oauth/register').send({ redirect_uris, token_endpoint_auth_method: 'none', client_name: 'X', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'] });
  it.each([['https://claude.ai/api/mcp/auth_callback'], ['https://claude.com/api/mcp/auth_callback'], ['http://localhost:54321/callback'], ['http://127.0.0.1:3456/callback']])('chấp nhận %s', async (u) => {
    expect((await dk([u])).status).toBe(201);
  });
  it.each([['https://evil.example/cb'], ['https://claude.ai.evil.example/api/mcp/auth_callback'], ['https://claude.ai/khac/duong-dan'], ['http://claude.ai/api/mcp/auth_callback'], ['http://localhost.evil.example/cb'], ['javascript:alert(1)']])('từ chối %s', async (u) => {
    const r = await dk([u]);
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('invalid_client_metadata');
  });
  it('một URI lạ lẫn trong danh sách cũng bị từ chối cả đơn', async () => {
    expect((await dk(['https://claude.ai/api/mcp/auth_callback', 'https://evil.example/cb'])).status).toBe(400);
  });
});

describe('metadata OAuth', () => {
  it('trỏ các endpoint về /oauth/*; protected resource nêu /mcp', async () => {
    const r = await request(m.app).get('/.well-known/oauth-authorization-server');
    expect(r.body.authorization_endpoint).toBe('http://localhost:8090/oauth/authorize');
    expect(r.body.code_challenge_methods_supported).toEqual(['S256']);
    const p = await request(m.app).get('/.well-known/oauth-protected-resource/mcp');
    expect(p.body.resource).toBe('http://localhost:8090/mcp');
  });
});

describe('form đăng nhập admin', () => {
  it('authorize trả FORM HTML tiếng Việt (không chuyển sang GitHub), cookie vtt_oauth httpOnly, không cache, chống nhúng khung', async () => {
    const clientId = await dangKy();
    const { r, sid, cookie } = await mo(clientId, pkce().challenge, '1.1.1.1');
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toMatch(/html/);
    expect(r.headers.location).toBeUndefined();
    expect(r.text).toContain('Mật khẩu');
    expect(r.text).not.toMatch(/github/i);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.headers['x-frame-options']).toBe('DENY');
    expect(r.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect((r.headers['set-cookie'] as unknown as string[]).join(';')).toMatch(/vtt_oauth=.*HttpOnly/i);
    expect(sid.length).toBeGreaterThan(20);
    expect(cookie).toContain(sid);
  });

  it('đăng nhập đúng (quản lý, không 2FA) → 303 về redirect_uri với code + state của Claude; đổi mã lấy token; gọi được /mcp', async () => {
    const { clientId, verifier, cb } = await dangNhapXong();
    expect(cb.status).toBe(303);
    const dich = new URL(cb.headers.location);
    expect(dich.origin + dich.pathname).toBe(REDIRECT);
    expect(dich.searchParams.get('state')).toBe('trang-thai-cua-claude');
    const t = await doiToken({ grant_type: 'authorization_code', code: dich.searchParams.get('code')!, code_verifier: verifier, client_id: clientId, redirect_uri: REDIRECT });
    expect(t.status).toBe(200);
    expect(t.body.access_token).toBeTruthy();
    expect(t.body.refresh_token).toBeTruthy();
    const init = await goiMcp(t.body.access_token);
    expect(init.status).toBe(200);
    expect(JSON.stringify(init.body)).toContain('vntraveltips');
    expect(m.db.prepare("SELECT count(*) AS n FROM nhat_ky WHERE loai = 'dang-nhap-oauth'").get()).toEqual({ n: 1 });
  });

  it('sai mật khẩu / email lạ → 401 hiện lại form (cùng thông báo), KHÔNG cấp mã', async () => {
    await taoUser('ql@x.vn');
    const clientId = await dangKy();
    const { sid, cookie } = await mo(clientId, pkce().challenge, '2.2.2.2');
    const a = await dn(sid, cookie, '2.2.2.2', { email: 'ql@x.vn', matKhau: 'sai-mat-khau-12345' });
    const b = await dn(sid, cookie, '2.2.2.3', { email: 'khong-co@x.vn', matKhau: 'sai-mat-khau-12345' });
    for (const r of [a, b]) {
      expect(r.status).toBe(401);
      expect(r.text).toContain('Sai email hoặc mật khẩu');
      expect(r.headers.location).toBeUndefined();
    }
    expect((await dn(sid, cookie, '2.2.2.2', { email: '', matKhau: '' })).status).toBe(400);
  });

  it('đăng nhập sai 5 lần qua form OAuth → bị chặn (429) và tính CHUNG với /api/admin/dang-nhap (Review Focus)', async () => {
    await taoUser('ql@x.vn');
    const clientId = await dangKy();
    const ip = '3.3.3.3';
    const { sid, cookie } = await mo(clientId, pkce().challenge, ip);
    for (let i = 0; i < 5; i++) expect((await dn(sid, cookie, ip, { email: 'ql@x.vn', matKhau: 'sai-mat-khau-12345' })).status).toBe(401);
    expect((await dn(sid, cookie, ip, { email: 'ql@x.vn', matKhau: MK })).status).toBe(429); // đúng mật khẩu cũng bị chặn
    const admin = await request(m.app).post('/api/admin/dang-nhap').set('X-Forwarded-For', ip).send({ email: 'ql@x.vn', matKhau: MK });
    expect(admin.status).toBe(429);
  });

  it('tài khoản bị khoá → không đăng nhập được', async () => {
    const u = await taoUser('khoa@x.vn');
    m.db.prepare('UPDATE nguoi_dung SET bi_khoa = 1 WHERE id = ?').run(u.id);
    const clientId = await dangKy();
    const { sid, cookie } = await mo(clientId, pkce().challenge, '4.4.4.4');
    expect((await dn(sid, cookie, '4.4.4.4', { email: 'khoa@x.vn', matKhau: MK })).status).toBe(401);
  });

  it('state không khớp cookie / thiếu cookie / state lạ → 400; state dùng một lần; hết hạn 10 phút → 400', async () => {
    await taoUser('ql@x.vn');
    const clientId = await dangKy();
    const a = await mo(clientId, pkce().challenge, '5.5.5.5');
    const b = await mo(clientId, pkce().challenge, '5.5.5.6');
    expect((await dn(a.sid, b.cookie, '5.5.5.5', { email: 'ql@x.vn', matKhau: MK })).status).toBe(400); // state của A + cookie của B
    expect((await dn(a.sid, '', '5.5.5.5', { email: 'ql@x.vn', matKhau: MK })).status).toBe(400);
    expect((await dn('khong-co', 'vtt_oauth=khong-co', '5.5.5.5', { email: 'ql@x.vn', matKhau: MK })).status).toBe(400);
    expect((await dn(b.sid, b.cookie, '5.5.5.6', { email: 'ql@x.vn', matKhau: MK })).status).toBe(303);
    expect((await dn(b.sid, b.cookie, '5.5.5.6', { email: 'ql@x.vn', matKhau: MK })).status).toBe(400); // dùng lại
    m.dongHo.v += 10 * 60_000 + 1;
    expect((await dn(a.sid, a.cookie, '5.5.5.5', { email: 'ql@x.vn', matKhau: MK })).status).toBe(400);
  });

  it('HTML trong tên client / lỗi không chạy được (thoát HTML)', async () => {
    const r = await request(m.app).post('/oauth/register').send({ redirect_uris: [REDIRECT], token_endpoint_auth_method: 'none', client_name: '<script>alert(1)</script>', grant_types: ['authorization_code'], response_types: ['code'] });
    const { r: form } = await mo(r.body.client_id, pkce().challenge, '6.6.6.6');
    expect(form.text).not.toContain('<script>alert(1)</script>');
    expect(form.text).toContain('&lt;script&gt;');
  });
});

describe('2FA', () => {
  it('quản trị CÓ 2FA: đúng mật khẩu chưa đủ — phải nhập mã mới nhận mã cấp; sai mã → 401; mã TOTP đã dùng không dùng lại được', async () => {
    const u = await taoUser('qt@x.vn', 'quan-tri');
    const biMat = taoTotp(u.id, 'qt@x.vn');
    const clientId = await dangKy();
    const ip = '7.7.7.7';
    const { sid, cookie } = await mo(clientId, pkce().challenge, ip);
    const b1 = await dn(sid, cookie, ip, { email: 'qt@x.vn', matKhau: MK });
    expect(b1.status).toBe(200);
    expect(b1.text).toContain('Mã xác thực');
    expect(b1.headers.location).toBeUndefined();
    expect((await dn(sid, cookie, ip, { ma: '000000' })).status).toBe(401);
    const ma = maTotpHienTai(biMat, m.dongHo.v);
    const b2 = await dn(sid, cookie, ip, { ma });
    expect(b2.status).toBe(303);
    expect(new URL(b2.headers.location).searchParams.get('code')).toBeTruthy();
    // phiên mới, cùng mã TOTP → bị từ chối (chống phát lại)
    const c = await mo(clientId, pkce().challenge, ip);
    await dn(c.sid, c.cookie, ip, { email: 'qt@x.vn', matKhau: MK });
    expect((await dn(c.sid, c.cookie, ip, { ma })).status).toBe(401);
  });

  it('quản trị CHƯA bật 2FA → 403, không cấp mã (Quản trị bắt buộc 2FA ở bước này)', async () => {
    await taoUser('qt@x.vn', 'quan-tri');
    const clientId = await dangKy();
    const { sid, cookie } = await mo(clientId, pkce().challenge, '8.8.8.8');
    const r = await dn(sid, cookie, '8.8.8.8', { email: 'qt@x.vn', matKhau: MK });
    expect(r.status).toBe(403);
    expect(r.text).toContain('xác thực 2 lớp');
    expect(r.headers.location).toBeUndefined();
  });

  it('gửi thẳng mã 2FA mà chưa nhập đúng mật khẩu → không qua (bước 2 chỉ mở sau bước 1)', async () => {
    const u = await taoUser('qt@x.vn', 'quan-tri');
    const biMat = taoTotp(u.id, 'qt@x.vn');
    const clientId = await dangKy();
    const { sid, cookie } = await mo(clientId, pkce().challenge, '9.9.9.9');
    const r = await dn(sid, cookie, '9.9.9.9', { ma: maTotpHienTai(biMat, m.dongHo.v) });
    expect(r.status).toBe(400);
    expect(r.headers.location).toBeUndefined();
  });
});

describe('mã, PKCE, refresh', () => {
  it('mã chỉ dùng một lần; PKCE sai bị từ chối', async () => {
    const { clientId, verifier, cb } = await dangNhapXong();
    const code = new URL(cb.headers.location).searchParams.get('code')!;
    const sai = await doiToken({ grant_type: 'authorization_code', code, code_verifier: 'sai'.repeat(20), client_id: clientId, redirect_uri: REDIRECT });
    expect(sai.status).toBe(400);
    const dung = await doiToken({ grant_type: 'authorization_code', code, code_verifier: verifier, client_id: clientId, redirect_uri: REDIRECT });
    expect(dung.status).toBe(200);
    const lai = await doiToken({ grant_type: 'authorization_code', code, code_verifier: verifier, client_id: clientId, redirect_uri: REDIRECT });
    expect(lai.body.error).toBe('invalid_grant');
  });

  it('refresh token cấp access token mới và vô hiệu refresh cũ; access token hết hạn sau 60 phút', async () => {
    const t = await layToken();
    const r1 = await doiToken({ grant_type: 'refresh_token', refresh_token: t.refresh_token, client_id: t.clientId });
    expect(r1.status).toBe(200);
    expect(r1.body.access_token).not.toBe(t.access_token);
    expect((await doiToken({ grant_type: 'refresh_token', refresh_token: t.refresh_token, client_id: t.clientId })).status).toBe(400);
    expect((await goiMcp(r1.body.access_token)).status).toBe(200);
    m.dongHo.v += 61 * 60_000;
    expect((await goiMcp(r1.body.access_token)).status).toBe(401);
  });

  it('mật khẩu không lọt vào response hay log', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { cb } = await dangNhapXong();
    expect(JSON.stringify([cb.text, cb.headers, log.mock.calls, err.mock.calls, m.db.prepare('SELECT * FROM nhat_ky').all()])).not.toContain(MK);
    vi.restoreAllMocks();
  });
});

describe('thu hồi token (Review Focus)', () => {
  it('khoá tài khoản → /mcp với token cũ 401 ngay và token bị xoá khỏi DB; mở khoá không làm token cũ sống lại', async () => {
    const t = await layToken();
    expect((await goiMcp(t.access_token)).status).toBe(200);
    const id = (m.db.prepare("SELECT id FROM nguoi_dung WHERE email = 'ql@x.vn'").get() as { id: number }).id;
    expect((await admin2.gui('put', `/tai-khoan/${id}`, { biKhoa: true })).status).toBe(200);
    expect((await goiMcp(t.access_token)).status).toBe(401);
    expect(m.db.prepare('SELECT count(*) AS n FROM oauth_token WHERE nguoi_dung_id = ?').get(id)).toEqual({ n: 0 });
    await admin2.gui('put', `/tai-khoan/${id}`, { biKhoa: false });
    expect((await goiMcp(t.access_token)).status).toBe(401);
    expect((await doiToken({ grant_type: 'refresh_token', refresh_token: t.refresh_token, client_id: t.clientId })).status).toBe(400);
  });

  it('đổi mật khẩu → token MCP cũ hết hiệu lực ngay; token của người khác không bị ảnh hưởng', async () => {
    const a = await layToken('a@x.vn');
    const b = await layToken('b@x.vn');
    const { doiMatKhau } = await import('../tai-khoan/nguoi-dung');
    const id = (m.db.prepare("SELECT id FROM nguoi_dung WHERE email = 'a@x.vn'").get() as { id: number }).id;
    await doiMatKhau(m.db, id, 'mat-khau-moi-rat-dai-12345');
    expect((await goiMcp(a.access_token)).status).toBe(401);
    expect((await goiMcp(b.access_token)).status).toBe(200);
  });

  it('xoá tài khoản khỏi DB → token biến mất theo (ON DELETE CASCADE)', async () => {
    const t = await layToken();
    m.db.prepare("DELETE FROM nguoi_dung WHERE email = 'ql@x.vn'").run();
    expect((await goiMcp(t.access_token)).status).toBe(401);
  });
});

describe('lưu trong SQLite + nhập file cũ', () => {
  it('client và token nằm trong DB (token chỉ dạng băm)', async () => {
    const t = await layToken();
    const dong = m.db.prepare('SELECT token_bam FROM oauth_token').all() as { token_bam: string }[];
    expect(dong).toHaveLength(2);
    expect(JSON.stringify(dong)).not.toContain(t.access_token);
    expect(m.db.prepare('SELECT count(*) AS n FROM oauth_client').get()).toEqual({ n: 1 });
  });

  it('`.oauth-state.json` cũ: client được nhập vào DB, file bị xoá, token cũ (gắn GitHub) bị bỏ', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vtt-oa-'));
    writeFileSync(join(dir, '.oauth-state.json'), JSON.stringify({ clients: { 'client-cu': { client_id: 'client-cu', redirect_uris: [REDIRECT] } }, tokens: { abc: { loai: 'access', login: 'github-user' } } }));
    const db = moDb(':memory:');
    const config = loadConfig({ GITHUB_TOKEN: 't', GITHUB_REPO: 'a/b', PUBLIC_BASE_URL: 'https://x.test', PREVIEW_BASE_URL: 'https://y.test', ANH_DIR: dir, SESSION_SECRET: 'x'.repeat(32), GITHUB_WEBHOOK_SECRET: 'w', KHOA_BI_MAT: 'a'.repeat(64) });
    const { provider } = createOAuth(config, db);
    expect(existsSync(join(dir, '.oauth-state.json'))).toBe(false);
    expect(provider.clientsStore.getClient('client-cu')).toMatchObject({ client_id: 'client-cu' });
    expect(db.prepare('SELECT count(*) AS n FROM oauth_token').get()).toEqual({ n: 0 });
    void readFileSync;
  });
});
