// Quên mật khẩu qua email: không lộ email nào tồn tại, token 1 giờ dùng một lần, đặt lại xong đăng xuất mọi nơi.
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { loadConfig } from '../config';
import { moDb, type Db } from '../db/ket-noi';
import { taoNguoiDung } from '../tai-khoan/nguoi-dung';

const MK = 'mat-khau-dai-12-ky-tu';
const MK_MOI = 'mat-khau-moi-12-ky-tu';
const GIO = 3_600_000;

let db: Db;
let t: number;
let app: ReturnType<typeof createApp>;

beforeEach(async () => {
  db = moDb(':memory:');
  t = Date.UTC(2026, 9, 21, 3, 0, 0);
  const config = loadConfig({
    GITHUB_TOKEN: 't', GITHUB_REPO: 'a/b',PUBLIC_BASE_URL: 'https://vntraveltips.monai.click',
    PREVIEW_BASE_URL: 'https://nhap.example.com', ANH_DIR: '/khong/co', SESSION_SECRET: 'x'.repeat(32),
     GITHUB_WEBHOOK_SECRET: 'w', KHOA_BI_MAT: 'f'.repeat(64),
  });
  app = createApp(config, { db, now: () => t, cho: async () => {} });
  await taoNguoiDung(db, { email: 'chu@x.vn', ten: 'Chủ <b>', vaiTro: 'quan-ly', matKhau: MK });
});

const quen = (email: string, ip = '1.1.1.1') => request(app).post('/api/admin/quen-mat-khau').set('X-Forwarded-For', ip).send({ email });
const datLai = (token: string, matKhauMoi = MK_MOI) => request(app).post('/api/admin/dat-lai-mat-khau').send({ token, matKhauMoi });
const hangDoi = () => db.prepare('SELECT * FROM mail_hang_doi ORDER BY id').all() as { loai: string; den: string; text: string; html: string }[];
const tokenTuMail = () => /token=([A-Za-z0-9_-]+)/.exec(hangDoi().at(-1)!.text)![1]!;

describe('POST /quen-mat-khau', () => {
  it('email không tồn tại → 200 cùng nội dung, không có mail trong hàng đợi', async () => {
    const co = await quen('chu@x.vn');
    const khong = await quen('khong-co@x.vn', '2.2.2.2');
    expect(khong.status).toBe(200);
    expect(khong.body).toEqual(co.body);
    expect(hangDoi()).toHaveLength(1); // chỉ mail của email có thật
    expect(hangDoi()[0]!.den).toBe('chu@x.vn');
  });

  it('email có → đúng 1 mail quan-trong chứa link /quan-tri/dat-lai?token=…, token chỉ lưu băm', async () => {
    await quen('CHU@x.vn');
    const m = hangDoi();
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ loai: 'quan-trong', den: 'chu@x.vn' });
    expect(m[0]!.text).toContain('https://vntraveltips.monai.click/quan-tri/dat-lai?token=');
    const token = tokenTuMail();
    expect(token.length).toBeGreaterThanOrEqual(43);
    const luu = JSON.stringify(db.prepare('SELECT * FROM dat_lai_mat_khau').all());
    expect(luu).not.toContain(token);
    expect(m[0]!.html).toContain('Chủ &lt;b&gt;'); // tên được escape trong HTML
  });

  it('tài khoản bị khoá → vẫn 200 nhưng không gửi mail', async () => {
    db.prepare('UPDATE nguoi_dung SET bi_khoa = 1').run();
    expect((await quen('chu@x.vn')).status).toBe(200);
    expect(hangDoi()).toHaveLength(0);
  });

  it('lần thứ 4 trong 1 giờ cùng IP → 429; IP khác vẫn được; sau 1 giờ được lại', async () => {
    for (let i = 0; i < 3; i++) expect((await quen('chu@x.vn')).status).toBe(200);
    expect((await quen('chu@x.vn')).status).toBe(429);
    expect((await quen('chu@x.vn', '9.9.9.9')).status).toBe(200);
    t += GIO + 1000;
    expect((await quen('chu@x.vn')).status).toBe(200);
  });

  it('thiếu email → 400', async () => {
    expect((await request(app).post('/api/admin/quen-mat-khau').send({})).status).toBe(400);
  });
});

describe('POST /dat-lai-mat-khau', () => {
  it('đặt lại đúng → đăng nhập được bằng mật khẩu mới, mật khẩu cũ hết dùng, mọi phiên cũ 401', async () => {
    const dn = await request(app).post('/api/admin/dang-nhap').send({ email: 'chu@x.vn', matKhau: MK });
    const cookie = (dn.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
    await quen('chu@x.vn');
    expect((await datLai(tokenTuMail())).status).toBe(200);
    expect((await request(app).get('/api/admin/toi').set('Cookie', cookie)).status).toBe(401);
    expect((await request(app).post('/api/admin/dang-nhap').set('X-Forwarded-For', '3.3.3.3').send({ email: 'chu@x.vn', matKhau: MK_MOI })).status).toBe(200);
    expect((await request(app).post('/api/admin/dang-nhap').set('X-Forwarded-For', '3.3.3.4').send({ email: 'chu@x.vn', matKhau: MK })).status).toBe(401);
  });

  it('token quá 1 giờ → 400', async () => {
    await quen('chu@x.vn');
    const token = tokenTuMail();
    t += GIO + 1000;
    expect((await datLai(token)).status).toBe(400);
  });

  it('token dùng lần 2 → 400; yêu cầu mới cũng vô hiệu liên kết cũ chưa dùng sau khi đã đặt lại', async () => {
    await quen('chu@x.vn');
    const a = tokenTuMail();
    await quen('chu@x.vn', '4.4.4.4');
    const b = tokenTuMail();
    expect((await datLai(a)).status).toBe(200);
    expect((await datLai(a)).status).toBe(400);
    expect((await datLai(b)).status).toBe(400); // đặt lại xong, mọi liên kết còn lại bị vô hiệu
  });

  it('token lạ → 400; mật khẩu mới ngắn → 400 và token chưa bị tiêu', async () => {
    expect((await datLai('khong-phai-token')).status).toBe(400);
    await quen('chu@x.vn');
    const token = tokenTuMail();
    const ngan = await datLai(token, 'ngan');
    expect(ngan.status).toBe(400);
    expect(ngan.body.loi).toMatch(/12/);
    expect((await datLai(token)).status).toBe(200);
  });
});
