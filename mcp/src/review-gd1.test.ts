// Các lỗi tìm thấy khi review giai đoạn 1 — mỗi test tái hiện một lỗi.
import { cpSync, mkdirSync, mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app';
import { loadConfig } from './config';
import { moDb } from './db/ket-noi';
import { khoiPhuc, saoLuu } from './db/sao-luu';
import { nhapNeuDbRong } from './noi-dung/nhap';
import { taoNguoiDung } from './tai-khoan/nguoi-dung';

const config = loadConfig({
  GITHUB_TOKEN: 't', GITHUB_REPO: 'a/b', ALLOWED_GITHUB_USER: 'u', PUBLIC_BASE_URL: 'http://localhost:8090',
  PREVIEW_BASE_URL: 'https://nhap.example.com', ANH_DIR: '/khong/co', SESSION_SECRET: 'x'.repeat(32),
  GITHUB_OAUTH_CLIENT_ID: 'i', GITHUB_OAUTH_CLIENT_SECRET: 's', GITHUB_WEBHOOK_SECRET: 'w', KHOA_BI_MAT: 'a'.repeat(64),
});
const MK = 'mat-khau-dai-12-ky-tu';

describe('review GĐ1', () => {
  it('PUT nhà cung cấp một phần (vd {laChinh:true}) không ghi đè trường khác bằng giá trị mặc định', async () => {
    const db = moDb(':memory:');
    const app = createApp(config, { db });
    await taoNguoiDung(db, { email: 'a@x.vn', ten: 'A', vaiTro: 'quan-ly', matKhau: MK });
    const dn = await request(app).post('/api/admin/dang-nhap').send({ email: 'a@x.vn', matKhau: MK });
    const c = (dn.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
    const csrf = (await request(app).get('/api/admin/toi').set('Cookie', c)).body.csrf;
    const g = (m: 'post' | 'put', u: string, b: object) => request(app)[m](`/api/admin/mail${u}`).set('Cookie', c).set('X-CSRF-Token', csrf).send(b);
    const base = { host: 'h', cong: 465, baoMat: 'ssl', taiKhoan: 't', diaChiGui: 'a@b.vn', gioiHanNgay: 100 };
    const a = (await g('post', '/nha-cung-cap', { ...base, ten: 'A', laChinh: true, duPhongQuanTrong: 7, thuTu: 3 })).body.id;
    const b = (await g('post', '/nha-cung-cap', { ...base, ten: 'B', bat: false })).body.id;
    await g('put', `/nha-cung-cap/${b}`, { laChinh: true });
    const ds = (await request(app).get('/api/admin/mail/nha-cung-cap').set('Cookie', c)).body.nhaCungCap as Record<string, unknown>[];
    expect(ds.find((x) => x.id === b)).toMatchObject({ laChinh: true, bat: false, duPhongQuanTrong: 30 });
    await g('put', `/nha-cung-cap/${a}`, { bat: false });
    expect((await request(app).get('/api/admin/mail/nha-cung-cap').set('Cookie', c)).body.nhaCungCap.find((x: { id: number }) => x.id === a)).toMatchObject({ bat: false, duPhongQuanTrong: 7, thuTu: 3 });
  });

  it('nhập nội dung cũ là nguyên tử: một file hỏng → không bài nào được ghi, chưa đặt cờ, lần sau nhập lại được', () => {
    const db = moDb(':memory:');
    const thu = mkdtempSync(join(tmpdir(), 'vtt-nhap-'));
    cpSync(join(import.meta.dirname, '../../site/src/content'), thu, { recursive: true });
    writeFileSync(join(thu, 'bai-viet', 'zzz-hong.md'), 'không có frontmatter');
    expect(() => nhapNeuDbRong(db, thu)).toThrow();
    expect(db.prepare('SELECT count(*) AS n FROM bai').get()).toEqual({ n: 0 });
    expect(db.prepare("SELECT count(*) AS n FROM he_thong WHERE khoa = 'da_nhap_noi_dung_cu'").get()).toEqual({ n: 0 });
    mkdirSync(thu, { recursive: true });
    writeFileSync(join(thu, 'bai-viet', 'zzz-hong.md'), readFileSync(join(thu, 'bai-viet', 'top-bai-bien-cho-be.md'), 'utf8').replace('slug: top-bai-bien-cho-be', 'slug: bai-khac'));
    expect(nhapNeuDbRong(db, thu)?.soBai).toBe(3);
  });

  it('20 lần đăng nhập sai SONG SONG cùng IP vẫn bị chặn sau đúng 5 lần (không vượt giới hạn)', async () => {
    const db = moDb(':memory:');
    const app = createApp(config, { db, cho: async () => {} });
    await taoNguoiDung(db, { email: 'a@x.vn', ten: 'A', vaiTro: 'quan-ly', matKhau: MK });
    const kq = await Promise.all(
      Array.from({ length: 20 }, (_, i) => request(app).post('/api/admin/dang-nhap').set('X-Forwarded-For', '8.8.8.8').send({ email: 'a@x.vn', matKhau: `sai-mat-khau-so-${i}` })),
    );
    expect(kq.filter((r) => r.status === 401)).toHaveLength(5);
    expect(kq.filter((r) => r.status === 429)).toHaveLength(15);
  });

  it('khôi phục: noi_dung_phien sau khôi phục lớn hơn cả giá trị cũ lẫn giá trị trong bản sao (build không bị bỏ qua)', async () => {
    const thu = mkdtempSync(join(tmpdir(), 'vtt-kp-'));
    const f = join(thu, 'a.sqlite');
    const db = moDb(f);
    db.prepare("UPDATE he_thong SET gia_tri = '42' WHERE khoa = 'noi_dung_phien'").run();
    const sao = await saoLuu(db, join(thu, 'sl'), Date.now());
    db.prepare("UPDATE he_thong SET gia_tri = '45' WHERE khoa = 'noi_dung_phien'").run();
    db.close();
    khoiPhuc(sao, f);
    const moi = moDb(f);
    expect(Number((moi.prepare("SELECT gia_tri FROM he_thong WHERE khoa = 'noi_dung_phien'").get() as { gia_tri: string }).gia_tri)).toBe(46);
  });

  it('đoán mật khẩu cũ ở /doi-mat-khau cũng bị chặn sau 5 lần sai', async () => {
    const db = moDb(':memory:');
    const app = createApp(config, { db });
    await taoNguoiDung(db, { email: 'a@x.vn', ten: 'A', vaiTro: 'quan-ly', matKhau: MK });
    const dn = await request(app).post('/api/admin/dang-nhap').send({ email: 'a@x.vn', matKhau: MK });
    const c = (dn.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
    const csrf = (await request(app).get('/api/admin/toi').set('Cookie', c)).body.csrf;
    const doi = () => request(app).post('/api/admin/doi-mat-khau').set('Cookie', c).set('X-CSRF-Token', csrf).send({ matKhauCu: 'sai-mat-khau-cu-day', matKhauMoi: 'mat-khau-moi-12-ky-tu' });
    for (let i = 0; i < 5; i++) expect((await doi()).status).toBe(400);
    expect((await doi()).status).toBe(429);
  });

  it('bật 2FA phải nhập đúng mật khẩu; bật xong các thiết bị khác bị đăng xuất', async () => {
    const db = moDb(':memory:');
    const app = createApp(config, { db });
    await taoNguoiDung(db, { email: 'a@x.vn', ten: 'A', vaiTro: 'quan-ly', matKhau: MK });
    const dang = async (ip: string) => {
      const r = await request(app).post('/api/admin/dang-nhap').set('X-Forwarded-For', ip).send({ email: 'a@x.vn', matKhau: MK });
      return (r.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
    };
    const c = await dang('1.1.1.1');
    const khac = await dang('2.2.2.2');
    const csrf = (await request(app).get('/api/admin/toi').set('Cookie', c)).body.csrf;
    const post = (u: string, b: object) => request(app).post(`/api/admin/${u}`).set('Cookie', c).set('X-CSRF-Token', csrf).send(b);
    const url = (await post('2fa/bat-dau', {})).body.otpauthUrl as string;
    const { maTotpHienTai } = await import('./tai-khoan/totp');
    const ma = maTotpHienTai(/secret=([A-Z2-7]+)/.exec(url)![1]!, Date.now());
    expect((await post('2fa/xac-nhan', { ma })).status).toBe(400);
    expect((await post('2fa/xac-nhan', { ma, matKhau: 'sai-mat-khau-day-nhe' })).status).toBe(400);
    expect((await post('2fa/xac-nhan', { ma, matKhau: MK })).status).toBe(200);
    expect((await request(app).get('/api/admin/toi').set('Cookie', khac)).status).toBe(401);
    expect((await request(app).get('/api/admin/toi').set('Cookie', c)).status).toBe(200);
  });
});
