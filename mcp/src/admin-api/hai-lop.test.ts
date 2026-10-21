// 2FA qua API: bật/xác nhận, đăng nhập 2 bước, mã dự phòng dùng một lần, bắt buộc với quản trị, chống dò mã.
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { giaiMa } from '../bi-mat';
import { loadConfig } from '../config';
import { moDb, type Db } from '../db/ket-noi';
import { taoNguoiDung } from '../tai-khoan/nguoi-dung';
import { maTotpHienTai } from '../tai-khoan/totp';

const MK = 'mat-khau-dai-12-ky-tu';
const KHOA = 'e'.repeat(64);
const BUOC = 30_000;

let db: Db;
let t: number;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  db = moDb(':memory:');
  t = Date.UTC(2026, 9, 21, 3, 0, 15);
  const config = loadConfig({
    GITHUB_TOKEN: 't', GITHUB_REPO: 'a/b',PUBLIC_BASE_URL: 'http://localhost:8090',
    PREVIEW_BASE_URL: 'https://nhap.example.com', ANH_DIR: '/khong/co', SESSION_SECRET: 'x'.repeat(32),
     GITHUB_WEBHOOK_SECRET: 'w', KHOA_BI_MAT: KHOA,
  });
  app = createApp(config, { db, now: () => t, cho: async () => {} });
});

async function taoVaDangNhap(email: string, vaiTro: 'quan-tri' | 'writer', ip = '1.1.1.1') {
  await taoNguoiDung(db, { email, ten: 'T', vaiTro, matKhau: MK });
  return dangNhap(email, ip);
}
async function dangNhap(email: string, ip = '1.1.1.1', mk = MK) {
  const r = await request(app).post('/api/admin/dang-nhap').set('X-Forwarded-For', ip).send({ email, matKhau: mk });
  const cookie = (r.headers['set-cookie'] as unknown as string[] | undefined)?.[0]?.split(';')[0] ?? '';
  const toi = cookie ? await request(app).get('/api/admin/toi').set('Cookie', cookie).set('X-Forwarded-For', ip) : undefined;
  return { r, cookie, csrf: (toi?.body.csrf ?? '') as string, toi };
}
const post = (s: { cookie: string; csrf: string }, url: string, body: object = {}, ip = '1.1.1.1') =>
  request(app).post(`/api/admin/${url}`).set('Cookie', s.cookie).set('X-CSRF-Token', s.csrf).set('X-Forwarded-For', ip).send(body);
const get = (s: { cookie: string }, url: string) => request(app).get(`/api/admin/${url}`).set('Cookie', s.cookie);

// Bật 2FA cho một phiên đã đăng nhập; trả bí mật base32 và mã dự phòng.
async function bat2fa(s: { cookie: string; csrf: string }, email: string) {
  const bd = await post(s, '2fa/bat-dau');
  expect(bd.status).toBe(200);
  expect(bd.body.otpauthUrl).toMatch(/^otpauth:\/\/totp\//);
  const biMat = /secret=([A-Z2-7]+)/.exec(bd.body.otpauthUrl)![1]!;
  const xn = await post(s, '2fa/xac-nhan', { ma: maTotpHienTai(biMat, t), matKhau: MK });
  expect(xn.status).toBe(200);
  expect(email).toBeTruthy();
  return { biMat, maDuPhong: xn.body.maDuPhong as string[] };
}

describe('bật 2FA', () => {
  it('bắt đầu → xác nhận bằng mã đúng → trả 10 mã dự phòng; DB không lưu bản rõ (bí mật mã hoá, mã dự phòng băm)', async () => {
    const s = await taoVaDangNhap('w@x.vn', 'writer');
    const { biMat, maDuPhong } = await bat2fa(s, 'w@x.vn');
    expect(maDuPhong).toHaveLength(10);
    const u = db.prepare('SELECT totp_bi_mat, totp_tam FROM nguoi_dung').get() as { totp_bi_mat: string; totp_tam: string | null };
    expect(u.totp_bi_mat).not.toContain(biMat);
    expect(giaiMa(KHOA, u.totp_bi_mat)).toBe(biMat);
    expect(u.totp_tam).toBeNull();
    const luu = JSON.stringify(db.prepare('SELECT * FROM ma_du_phong').all());
    for (const m of maDuPhong) expect(luu).not.toContain(m);
    expect((await get(s, 'toi')).body.nguoiDung.coTotp).toBe(true);
  });

  it('xác nhận sai mã → 400 và chưa bật; chưa bắt đầu mà xác nhận → 400', async () => {
    const s = await taoVaDangNhap('w@x.vn', 'writer');
    expect((await post(s, '2fa/xac-nhan', { ma: '123456', matKhau: MK })).status).toBe(400);
    await post(s, '2fa/bat-dau');
    expect((await post(s, '2fa/xac-nhan', { ma: '000000', matKhau: MK })).status).toBe(400);
    expect((await get(s, 'toi')).body.nguoiDung.coTotp).toBe(false);
  });

  it('đã bật rồi mà bắt đầu lại → 409', async () => {
    const s = await taoVaDangNhap('w@x.vn', 'writer');
    await bat2fa(s, 'w@x.vn');
    expect((await post(s, '2fa/bat-dau')).status).toBe(409);
  });
});

describe('đăng nhập 2 bước', () => {
  async function nguoiCo2fa() {
    const s = await taoVaDangNhap('w@x.vn', 'writer');
    const k = await bat2fa(s, 'w@x.vn');
    return k;
  }

  it('có 2FA: đăng nhập trả canTotp; /toi trả { choTotp: true }; API khác 401; nhập đúng mã mới dùng được', async () => {
    const { biMat } = await nguoiCo2fa();
    t += 5 * BUOC;
    const dn = await dangNhap('w@x.vn', '2.2.2.2');
    expect(dn.r.body).toEqual({ canTotp: true });
    expect(dn.toi!.body).toMatchObject({ choTotp: true });
    expect(dn.toi!.body.nguoiDung).toBeUndefined();
    expect((await get(dn, 'phien')).status).toBe(401);
    expect((await post(dn, '2fa/bat-dau')).status).toBe(401);
    const ok = await post(dn, 'dang-nhap/totp', { ma: maTotpHienTai(biMat, t) }, '2.2.2.2');
    expect(ok.status).toBe(200);
    expect((await get(dn, 'phien')).status).toBe(200);
    expect((await get(dn, 'toi')).body.nguoiDung).toMatchObject({ email: 'w@x.vn' });
  });

  it('lệch ±1 bước được chấp nhận, ±2 bị từ chối', async () => {
    const { biMat } = await nguoiCo2fa();
    t += 10 * BUOC;
    const a = await dangNhap('w@x.vn', '3.3.3.3');
    expect((await post(a, 'dang-nhap/totp', { ma: maTotpHienTai(biMat, t - 2 * BUOC) }, '3.3.3.3')).status).toBe(401);
    expect((await post(a, 'dang-nhap/totp', { ma: maTotpHienTai(biMat, t - BUOC) }, '3.3.3.3')).status).toBe(200);
  });

  it('mã TOTP đã dùng không dùng lại được (chống phát lại), kể cả ở phiên mới', async () => {
    const { biMat } = await nguoiCo2fa();
    t += 10 * BUOC;
    const ma = maTotpHienTai(biMat, t);
    const a = await dangNhap('w@x.vn', '4.4.4.4');
    expect((await post(a, 'dang-nhap/totp', { ma }, '4.4.4.4')).status).toBe(200);
    const b = await dangNhap('w@x.vn', '4.4.4.5');
    expect((await post(b, 'dang-nhap/totp', { ma }, '4.4.4.5')).status).toBe(401);
  });

  it('mã dự phòng dùng được một lần, lần 2 → sai', async () => {
    const { maDuPhong } = await nguoiCo2fa();
    const a = await dangNhap('w@x.vn', '5.5.5.5');
    expect((await post(a, 'dang-nhap/totp', { ma: maDuPhong[0] }, '5.5.5.5')).status).toBe(200);
    const b = await dangNhap('w@x.vn', '5.5.5.6');
    expect((await post(b, 'dang-nhap/totp', { ma: maDuPhong[0] }, '5.5.5.6')).status).toBe(401);
    expect((await post(b, 'dang-nhap/totp', { ma: maDuPhong[1] }, '5.5.5.6')).status).toBe(200);
  });

  it('5 mã TOTP sai cùng IP → bị chặn như mật khẩu (kể cả mã đúng và đăng nhập lại)', async () => {
    const { biMat } = await nguoiCo2fa();
    t += 10 * BUOC;
    const a = await dangNhap('w@x.vn', '6.6.6.6');
    for (let i = 0; i < 5; i++) expect((await post(a, 'dang-nhap/totp', { ma: '000000' }, '6.6.6.6')).status).toBe(401);
    const bi = await post(a, 'dang-nhap/totp', { ma: maTotpHienTai(biMat, t) }, '6.6.6.6');
    expect(bi.status).toBe(429);
    expect(bi.body.conLaiGiay).toBe(900);
    expect((await dangNhap('w@x.vn', '6.6.6.6')).r.status).toBe(429);
  });

  it('đăng nhập đúng mật khẩu KHÔNG xoá bộ đếm lần sai khi có 2FA (không cho dò mã vô hạn bằng cách đăng nhập lại)', async () => {
    await nguoiCo2fa();
    const ip = '7.7.7.7';
    for (let vong = 0; vong < 2; vong++) {
      const s = await dangNhap('w@x.vn', ip);
      if (s.r.status !== 200) break;
      for (let i = 0; i < 3; i++) await post(s, 'dang-nhap/totp', { ma: '000000' }, ip);
    }
    expect((await dangNhap('w@x.vn', ip)).r.status).toBe(429); // 6 lần sai cộng dồn qua hai phiên → đã bị chặn
  });
});

describe('bắt buộc 2FA với quản trị', () => {
  it('quản trị chưa bật 2FA: chỉ /toi, /2fa/*, /dang-xuat; API khác 403 "Cần bật xác thực 2 lớp"', async () => {
    const s = await taoVaDangNhap('q@x.vn', 'quan-tri');
    expect((await get(s, 'toi')).status).toBe(200);
    const khac = await get(s, 'phien');
    expect(khac.status).toBe(403);
    expect(khac.body).toEqual({ loi: 'Cần bật xác thực 2 lớp' });
    expect((await get(s, 'mail/nha-cung-cap')).status).toBe(403);
    expect((await post(s, '2fa/bat-dau')).status).toBe(200);
    await bat2fa({ ...s }, 'q@x.vn').catch(() => {}); // đã bắt đầu rồi, bật lại bí mật mới
    expect((await post(s, 'dang-xuat')).status).toBe(200);
  });

  it('bật xong thì dùng được các API khác ngay', async () => {
    const s = await taoVaDangNhap('q@x.vn', 'quan-tri');
    await bat2fa(s, 'q@x.vn');
    expect((await get(s, 'phien')).status).toBe(200);
  });

  it('writer chưa bật 2FA vẫn dùng API bình thường', async () => {
    const s = await taoVaDangNhap('w@x.vn', 'writer');
    expect((await get(s, 'phien')).status).toBe(200);
  });
});

describe('tắt 2FA', () => {
  it('quản trị gọi /2fa/tat → 403', async () => {
    const s = await taoVaDangNhap('q@x.vn', 'quan-tri');
    const { biMat } = await bat2fa(s, 'q@x.vn');
    const r = await post(s, '2fa/tat', { matKhau: MK, ma: maTotpHienTai(biMat, t + 3 * BUOC) });
    expect(r.status).toBe(403);
    expect((await get(s, 'toi')).body.nguoiDung.coTotp).toBe(true);
  });

  it('writer: sai mật khẩu hoặc sai mã → 400; đúng cả hai → tắt, xoá bí mật và mã dự phòng', async () => {
    const s = await taoVaDangNhap('w@x.vn', 'writer');
    const { biMat } = await bat2fa(s, 'w@x.vn');
    t += 5 * BUOC;
    expect((await post(s, '2fa/tat', { matKhau: 'sai-mat-khau-day-nhe', ma: maTotpHienTai(biMat, t) })).status).toBe(400);
    expect((await post(s, '2fa/tat', { matKhau: MK, ma: '000000' })).status).toBe(400);
    expect((await post(s, '2fa/tat', { matKhau: MK, ma: maTotpHienTai(biMat, t) })).status).toBe(200);
    expect((await get(s, 'toi')).body.nguoiDung.coTotp).toBe(false);
    expect(db.prepare('SELECT count(*) AS n FROM ma_du_phong').get()).toEqual({ n: 0 });
  });
});
