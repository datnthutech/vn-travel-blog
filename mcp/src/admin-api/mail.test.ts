// API cấu hình mail: không bao giờ trả mật khẩu SMTP (dưới mọi dạng), ghi mật khẩu mã hoá, gửi thử, thống kê, nhật ký.
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { loadConfig } from '../config';
import { moDb, type Db } from '../db/ket-noi';
import { taoDichVuMail } from '../mail/dich-vu';
import { taoNguoiDung } from '../tai-khoan/nguoi-dung';

const MK = 'mat-khau-dai-12-ky-tu';
const MK_SMTP = 'mat-khau-smtp-sieu-bi-mat';
const KHOA = 'd'.repeat(64);

let db: Db;
let app: ReturnType<typeof createApp>;
let c: string;
let csrf: string;
let daGui: string[];

beforeEach(async () => {
  db = moDb(':memory:');
  daGui = [];
  const config = loadConfig({
    GITHUB_TOKEN: 't', GITHUB_REPO: 'a/b', ALLOWED_GITHUB_USER: 'u', PUBLIC_BASE_URL: 'http://localhost:8090',
    PREVIEW_BASE_URL: 'https://nhap.example.com', ANH_DIR: '/khong/co', SESSION_SECRET: 'x'.repeat(32),
    GITHUB_OAUTH_CLIENT_ID: 'i', GITHUB_OAUTH_CLIENT_SECRET: 's', GITHUB_WEBHOOK_SECRET: 'w', KHOA_BI_MAT: KHOA,
  });
  const mail = taoDichVuMail(db, { khoaBiMat: KHOA, taoTransport: () => ({ sendMail: async (o) => void daGui.push(o.to) }) });
  app = createApp(config, { db, mail });
  await taoNguoiDung(db, { email: 'chu@x.vn', ten: 'Chủ', vaiTro: 'quan-tri', matKhau: MK });
  const dn = await request(app).post('/api/admin/dang-nhap').send({ email: 'chu@x.vn', matKhau: MK });
  c = (dn.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
  csrf = (await request(app).get('/api/admin/toi').set('Cookie', c)).body.csrf;
});

const ghi = (method: 'post' | 'put' | 'delete', url: string, body?: object) =>
  request(app)[method](`/api/admin/mail${url}`).set('Cookie', c).set('X-CSRF-Token', csrf).send(body);
const docNcc = () => request(app).get('/api/admin/mail/nha-cung-cap').set('Cookie', c);
const NCC = { ten: 'Gmail', host: 'smtp.gmail.com', cong: 465, baoMat: 'ssl', taiKhoan: 'chu@gmail.com', matKhau: MK_SMTP, diaChiGui: 'chu@gmail.com', gioiHanNgay: 500, laChinh: true };

describe('nhà cung cấp mail', () => {
  it('chưa đăng nhập → 401', async () => {
    expect((await request(app).get('/api/admin/mail/nha-cung-cap')).status).toBe(401);
  });

  it('thêm → đọc lại có daDatMatKhau, KHÔNG chứa mật khẩu dưới mọi dạng (kể cả chuỗi mã hoá)', async () => {
    const them = await ghi('post', '/nha-cung-cap', NCC);
    expect(them.status).toBe(201);
    expect(JSON.stringify(them.body)).not.toContain(MK_SMTP);
    const ds = await docNcc();
    expect(ds.body.nhaCungCap).toHaveLength(1);
    expect(ds.body.nhaCungCap[0]).toMatchObject({ ten: 'Gmail', host: 'smtp.gmail.com', daDatMatKhau: true, laChinh: true });
    const tho = JSON.stringify(ds.body);
    expect(tho).not.toContain(MK_SMTP);
    expect(tho).not.toMatch(/matKhau"|mat_khau|gia_tri_ma_hoa/);
    const maHoa = (db.prepare('SELECT gia_tri_ma_hoa AS v FROM bi_mat').get() as { v: string }).v;
    expect(maHoa).not.toContain(MK_SMTP);
    expect(tho).not.toContain(maHoa);
  });

  it('thêm không mật khẩu → daDatMatKhau false; sửa để ghi mật khẩu → true; mật khẩu không lộ ở bảng nhật ký', async () => {
    const { id } = (await ghi('post', '/nha-cung-cap', { ...NCC, matKhau: undefined })).body;
    expect((await docNcc()).body.nhaCungCap[0].daDatMatKhau).toBe(false);
    expect((await ghi('put', `/nha-cung-cap/${id}`, { matKhau: MK_SMTP, gioiHanNgay: 450 })).status).toBe(200);
    const sau = (await docNcc()).body.nhaCungCap[0];
    expect(sau).toMatchObject({ daDatMatKhau: true, gioiHanNgay: 450 });
    expect(JSON.stringify(db.prepare('SELECT * FROM nhat_ky').all())).not.toContain(MK_SMTP);
  });

  it('chỉ một nhà cung cấp là chính; dữ liệu sai → 400; id lạ → 404; xoá cũng xoá bí mật', async () => {
    const a = (await ghi('post', '/nha-cung-cap', NCC)).body.id;
    const b = (await ghi('post', '/nha-cung-cap', { ...NCC, ten: 'Brevo', laChinh: true })).body.id;
    const ds = (await docNcc()).body.nhaCungCap as { id: number; laChinh: boolean }[];
    expect(ds.filter((x) => x.laChinh).map((x) => x.id)).toEqual([b]);
    expect((await ghi('post', '/nha-cung-cap', { ten: '' })).status).toBe(400);
    expect((await ghi('put', '/nha-cung-cap/9999', { ten: 'X' })).status).toBe(404);
    expect((await ghi('delete', `/nha-cung-cap/${a}`)).status).toBe(200);
    expect(db.prepare('SELECT count(*) AS n FROM bi_mat').get()).toEqual({ n: 1 });
  });

  it('POST thiếu CSRF → 403', async () => {
    expect((await request(app).post('/api/admin/mail/nha-cung-cap').set('Cookie', c).send(NCC)).status).toBe(403);
  });

  it('có sẵn mẫu Gmail và Brevo', async () => {
    const r = await request(app).get('/api/admin/mail/mau').set('Cookie', c);
    expect(r.body.mau).toEqual(expect.arrayContaining([
      expect.objectContaining({ host: 'smtp.gmail.com', cong: 465, baoMat: 'ssl', gioiHanNgay: 500 }),
      expect.objectContaining({ host: 'smtp-relay.brevo.com', cong: 587, baoMat: 'starttls', gioiHanNgay: 300 }),
    ]));
  });
});

describe('gửi thử, thống kê, nhật ký', () => {
  it('gui-thu gửi tới địa chỉ nhập; email sai → 400; thống kê tăng; nhật ký có dòng', async () => {
    const { id } = (await ghi('post', '/nha-cung-cap', NCC)).body;
    expect((await ghi('post', `/nha-cung-cap/${id}/gui-thu`, { den: 'khong-hop-le' })).status).toBe(400);
    expect((await ghi('post', `/nha-cung-cap/${id}/gui-thu`, { den: 'toi@x.vn' })).status).toBe(200);
    expect(daGui).toEqual(['toi@x.vn']);
    const tk = await request(app).get('/api/admin/mail/thong-ke').set('Cookie', c);
    expect(tk.body.homNay[0]).toMatchObject({ ten: 'Gmail', daGui: 1, gioiHan: 500 });
    const nk = await request(app).get('/api/admin/mail/nhat-ky?trang=1').set('Cookie', c);
    expect(nk.body.tong).toBe(1);
    expect(nk.body.dong[0]).toMatchObject({ ketQua: 'ok', den: 'toi@x.vn' });
  });

  it('gửi thử lỗi → 503 kèm thông báo, không lộ mật khẩu', async () => {
    const mail = taoDichVuMail(db, { khoaBiMat: KHOA, taoTransport: (_n, mk) => ({ sendMail: async () => { throw new Error(`xác thực lỗi ${mk}`); } }) });
    const config = loadConfig({
      GITHUB_TOKEN: 't', GITHUB_REPO: 'a/b', ALLOWED_GITHUB_USER: 'u', PUBLIC_BASE_URL: 'http://localhost:8090',
      PREVIEW_BASE_URL: 'https://nhap.example.com', ANH_DIR: '/khong/co', SESSION_SECRET: 'x'.repeat(32),
      GITHUB_OAUTH_CLIENT_ID: 'i', GITHUB_OAUTH_CLIENT_SECRET: 's', GITHUB_WEBHOOK_SECRET: 'w', KHOA_BI_MAT: KHOA,
    });
    app = createApp(config, { db, mail });
    const { id } = (await ghi('post', '/nha-cung-cap', NCC)).body;
    const r = await ghi('post', `/nha-cung-cap/${id}/gui-thu`, { den: 'toi@x.vn' });
    expect(r.status).toBe(503);
    expect(r.body.loi).toMatch(/Gửi thử thất bại/);
    expect(JSON.stringify(r.body)).not.toContain(MK_SMTP);
  });
});
