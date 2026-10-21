// Đăng nhập admin: chống dò tăng dần, phiên 12 giờ / 30 ngày, cookie Secure theo https, CSRF, đăng xuất mọi nơi.
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { loadConfig } from '../config';
import { moDb, type Db } from '../db/ket-noi';
import { taoNguoiDung } from '../tai-khoan/nguoi-dung';

const MK = 'mat-khau-dai-12-ky-tu';
const PHUT = 60_000;
const GIO = 60 * PHUT;
const NGAY = 24 * GIO;

const env = (publicBaseUrl: string) => ({
  GITHUB_TOKEN: 't', GITHUB_REPO: 'a/b', ALLOWED_GITHUB_USER: 'u', PUBLIC_BASE_URL: publicBaseUrl,
  PREVIEW_BASE_URL: 'https://nhap.example.com', ANH_DIR: '/khong/co', SESSION_SECRET: 'x'.repeat(32),
  GITHUB_OAUTH_CLIENT_ID: 'i', GITHUB_OAUTH_CLIENT_SECRET: 's', GITHUB_WEBHOOK_SECRET: 'w', KHOA_BI_MAT: 'b'.repeat(64),
});

let db: Db;
let t: number;
let cho: number[];
const dung = (url = 'http://localhost:8090') =>
  createApp(loadConfig(env(url)), { db, now: () => t, cho: async (ms) => void cho.push(ms) });

beforeEach(async () => {
  db = moDb(':memory:');
  t = Date.UTC(2026, 9, 21, 3, 0, 0);
  cho = [];
  await taoNguoiDung(db, { email: 'chu@x.vn', ten: 'Chủ', vaiTro: 'quan-ly', matKhau: MK }, () => t);
});

const dangNhap = (app: ReturnType<typeof dung>, mk = MK, ip = '1.1.1.1', email = 'chu@x.vn', ghiNho = false) =>
  request(app).post('/api/admin/dang-nhap').set('X-Forwarded-For', ip).send({ email, matKhau: mk, ghiNho });
const cookie = (res: request.Response) => (res.headers['set-cookie'] as unknown as string[])[0]!;
const gui = (app: ReturnType<typeof dung>, c: string, ip = '1.1.1.1') => request(app).get('/api/admin/toi').set('Cookie', c).set('X-Forwarded-For', ip);

describe('chống dò mật khẩu theo IP', () => {
  it('5 lần sai → lần 6 bị 429 kể cả mật khẩu đúng; sau 15 phút được thử lại', async () => {
    const app = dung();
    for (let i = 0; i < 5; i++) expect((await dangNhap(app, 'sai-mat-khau-day')).status).toBe(401);
    const r = await dangNhap(app, MK);
    expect(r.status).toBe(429);
    expect(r.body.conLaiGiay).toBe(15 * 60);
    t += 14 * PHUT;
    expect((await dangNhap(app, MK)).status).toBe(429);
    t += PHUT + 1000;
    expect((await dangNhap(app, MK)).status).toBe(200);
  });

  it('bị chặn lần 2 → 30 phút, lần 3 → 60 phút, …, không quá 24 giờ', async () => {
    const app = dung();
    for (let lan = 1; lan <= 9; lan++) {
      for (let i = 0; i < 5; i++) await dangNhap(app, 'sai-mat-khau-day');
      const mongDoi = Math.min(15 * 60 * 2 ** (lan - 1), 24 * 3600);
      const r = await dangNhap(app, MK);
      expect(r.status, `lần chặn ${lan}`).toBe(429);
      expect(r.body.conLaiGiay, `lần chặn ${lan}`).toBe(mongDoi);
      t += mongDoi * 1000 + 1000;
    }
  });

  it('đăng nhập đúng xoá bộ đếm và mức leo thang của IP', async () => {
    const app = dung();
    for (let i = 0; i < 4; i++) await dangNhap(app, 'sai-mat-khau-day');
    expect((await dangNhap(app, MK)).status).toBe(200);
    for (let i = 0; i < 4; i++) await dangNhap(app, 'sai-mat-khau-day'); // lại 4 lần: chưa tới 5
    expect((await dangNhap(app, MK)).status).toBe(200);
    // mức leo thang cũng về 0: bị chặn lần đầu sau khi từng bị chặn rồi đăng nhập đúng → vẫn 15 phút
    for (let i = 0; i < 5; i++) await dangNhap(app, 'sai-mat-khau-day');
    expect((await dangNhap(app, MK)).body.conLaiGiay).toBe(900);
    t += 901_000;
    expect((await dangNhap(app, MK)).status).toBe(200);
    for (let i = 0; i < 5; i++) await dangNhap(app, 'sai-mat-khau-day');
    expect((await dangNhap(app, MK)).body.conLaiGiay).toBe(900);
  });

  it('IP khác không bị ảnh hưởng', async () => {
    const app = dung();
    for (let i = 0; i < 5; i++) await dangNhap(app, 'sai-mat-khau-day', '2.2.2.2');
    expect((await dangNhap(app, MK, '2.2.2.2')).status).toBe(429);
    expect((await dangNhap(app, MK, '3.3.3.3')).status).toBe(200);
  });
});

describe('chống dò theo tài khoản', () => {
  it('21 lần sai từ 21 IP khác nhau → vẫn đăng nhập đúng được, bị làm chậm 3000 ms, không 429', async () => {
    const app = dung();
    for (let i = 0; i < 21; i++) await dangNhap(app, 'sai-mat-khau-day', `10.0.0.${i + 1}`);
    expect(cho).toEqual([]); // mới sai 20 lần trước lần thứ 21 → chưa chậm
    const r = await dangNhap(app, MK, '10.9.9.9');
    expect(r.status).toBe(200);
    expect(cho).toEqual([3000]);
  });

  it('tài khoản bình thường không bị làm chậm', async () => {
    expect((await dangNhap(dung())).status).toBe(200);
    expect(cho).toEqual([]);
  });
});

describe('thông báo lỗi', () => {
  it('sai email và sai mật khẩu cho phản hồi giống hệt nhau', async () => {
    const app = dung();
    const a = await dangNhap(app, 'sai-mat-khau-day');
    const b = await dangNhap(app, MK, '1.1.1.2', 'khong-co@x.vn');
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body).toEqual(b.body);
    expect(a.body).toEqual({ loi: 'Sai email hoặc mật khẩu' });
  });

  it('tài khoản bị khoá cũng chỉ nhận cùng thông báo', async () => {
    db.prepare('UPDATE nguoi_dung SET bi_khoa = 1').run();
    const r = await dangNhap(dung());
    expect(r.status).toBe(401);
    expect(r.body).toEqual({ loi: 'Sai email hoặc mật khẩu' });
  });

  it('thiếu trường → 400; phản hồi đăng nhập không chứa mật khẩu hay chuỗi băm', async () => {
    const app = dung();
    expect((await request(app).post('/api/admin/dang-nhap').send({ email: 'a@x.vn' })).status).toBe(400);
    const r = await dangNhap(app);
    expect(JSON.stringify(r.body) + JSON.stringify(r.headers)).not.toMatch(/argon2|mat-khau-dai/);
  });
});

describe('cookie phiên (Review Focus 5)', () => {
  it('http://localhost → không có Secure; vẫn HttpOnly, SameSite=Lax, Path=/', async () => {
    const c = cookie(await dangNhap(dung('http://localhost:8090')));
    expect(c).toMatch(/^vtt_phien=/);
    expect(c).not.toMatch(/Secure/i);
    expect(c).toMatch(/HttpOnly/i);
    expect(c).toMatch(/SameSite=Lax/i);
    expect(c).toMatch(/Path=\//);
  });

  it('https → có Secure', async () => {
    expect(cookie(await dangNhap(dung('https://vntraveltips.monai.click')))).toMatch(/Secure/i);
  });

  it('DB chỉ lưu SHA-256 của token, không lưu token thô', async () => {
    const c = cookie(await dangNhap(dung()));
    const token = /vtt_phien=([^;]+)/.exec(c)![1]!;
    expect(token.length).toBeGreaterThanOrEqual(43); // 32 byte base64url
    const bam = (db.prepare('SELECT token_bam FROM phien').get() as { token_bam: string }).token_bam;
    expect(bam).not.toBe(token);
    expect(bam).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('thời hạn phiên', () => {
  it('quá 12 giờ không dùng → 401; dùng đều thì gia hạn trượt', async () => {
    const app = dung();
    const c = cookie(await dangNhap(app)).split(';')[0]!;
    t += 11 * GIO;
    expect((await gui(app, c)).status).toBe(200);
    t += 11 * GIO; // tổng 22 giờ nhưng mới 11 giờ kể từ lần dùng cuối
    expect((await gui(app, c)).status).toBe(200);
    t += 12 * GIO + 1000;
    expect((await gui(app, c)).status).toBe(401);
  });

  it('ghiNho → còn hiệu lực ngày 29, hết hạn sau 30 ngày không dùng', async () => {
    const app = dung();
    const c = cookie(await dangNhap(app, MK, '1.1.1.1', 'chu@x.vn', true)).split(';')[0]!;
    t += 29 * NGAY;
    expect((await gui(app, c)).status).toBe(200);
    t += 30 * NGAY + 1000;
    expect((await gui(app, c)).status).toBe(401);
  });

  it('không có cookie → 401', async () => {
    expect((await request(dung()).get('/api/admin/toi')).status).toBe(401);
  });
});

describe('CSRF', () => {
  it('GET /toi trả csrf; POST thiếu/sai X-CSRF-Token → 403, đúng → 200; GET không cần', async () => {
    const app = dung();
    const c = cookie(await dangNhap(app)).split(';')[0]!;
    const toi = await gui(app, c);
    expect(toi.body.nguoiDung).toMatchObject({ email: 'chu@x.vn', vaiTro: 'quan-ly' });
    const csrf = toi.body.csrf as string;
    expect(csrf).toMatch(/^[0-9a-f]{64}$/);
    expect((await request(app).post('/api/admin/dang-xuat-moi-noi').set('Cookie', c)).status).toBe(403);
    expect((await request(app).post('/api/admin/dang-xuat-moi-noi').set('Cookie', c).set('X-CSRF-Token', 'sai')).status).toBe(403);
    expect((await request(app).post('/api/admin/dang-xuat-moi-noi').set('Cookie', c).set('X-CSRF-Token', csrf)).status).toBe(200);
  });

  it('csrf của phiên này không dùng được cho phiên khác', async () => {
    const app = dung();
    const c1 = cookie(await dangNhap(app)).split(';')[0]!;
    const c2 = cookie(await dangNhap(app, MK, '1.1.1.2')).split(';')[0]!;
    const csrf1 = (await gui(app, c1)).body.csrf as string;
    expect((await request(app).post('/api/admin/dang-xuat').set('Cookie', c2).set('X-CSRF-Token', csrf1)).status).toBe(403);
  });
});

describe('thiết bị và đăng xuất', () => {
  async function haiPhien() {
    const app = dung();
    const c1 = cookie(await dangNhap(app)).split(';')[0]!;
    const c2 = cookie(await dangNhap(app, MK, '1.1.1.2')).split(';')[0]!;
    const csrf1 = (await gui(app, c1)).body.csrf as string;
    return { app, c1, c2, csrf1 };
  }

  it('dang-xuat-moi-noi: phiên khác 401, phiên hiện tại vẫn dùng được', async () => {
    const { app, c1, c2, csrf1 } = await haiPhien();
    await request(app).post('/api/admin/dang-xuat-moi-noi').set('Cookie', c1).set('X-CSRF-Token', csrf1).expect(200);
    expect((await gui(app, c2)).status).toBe(401);
    expect((await gui(app, c1)).status).toBe(200);
  });

  it('GET /phien liệt kê thiết bị (đánh dấu hiện tại); DELETE /phien/:id xoá đúng thiết bị đó', async () => {
    const { app, c1, c2, csrf1 } = await haiPhien();
    const ds = (await request(app).get('/api/admin/phien').set('Cookie', c1)).body.phien as { id: number; hienTai: boolean }[];
    expect(ds).toHaveLength(2);
    expect(ds.filter((p) => p.hienTai)).toHaveLength(1);
    const khac = ds.find((p) => !p.hienTai)!;
    await request(app).delete(`/api/admin/phien/${khac.id}`).set('Cookie', c1).set('X-CSRF-Token', csrf1).expect(200);
    expect((await gui(app, c2)).status).toBe(401);
    await request(app).delete(`/api/admin/phien/${khac.id}`).set('Cookie', c1).set('X-CSRF-Token', csrf1).expect(404);
  });

  it('không xoá được phiên của người khác', async () => {
    const { app, c1, csrf1 } = await haiPhien();
    const nguoiKhac = await taoNguoiDung(db, { email: 'k@x.vn', ten: 'K', vaiTro: 'writer', matKhau: MK });
    db.prepare('INSERT INTO phien (token_bam, nguoi_dung_id, tao_luc, dung_cuoi_luc, het_han_luc) VALUES (?,?,1,1,?)').run('zzz', nguoiKhac.id, t + GIO);
    const id = (db.prepare('SELECT id FROM phien WHERE token_bam = ?').get('zzz') as { id: number }).id;
    await request(app).delete(`/api/admin/phien/${id}`).set('Cookie', c1).set('X-CSRF-Token', csrf1).expect(404);
    expect(db.prepare('SELECT count(*) AS n FROM phien WHERE id = ?').get(id)).toEqual({ n: 1 });
  });

  it('dang-xuat xoá phiên: dùng lại cookie cũ → 401; ghi nhật ký', async () => {
    const { app, c1, csrf1 } = await haiPhien();
    await request(app).post('/api/admin/dang-xuat').set('Cookie', c1).set('X-CSRF-Token', csrf1).expect(200);
    expect((await gui(app, c1)).status).toBe(401);
    const loai = (db.prepare('SELECT loai FROM nhat_ky ORDER BY id').all() as { loai: string }[]).map((x) => x.loai);
    expect(loai).toEqual(['dang-nhap', 'dang-nhap', 'dang-xuat']);
  });

  it('đăng nhập sai ghi nhat_ky dang-nhap-that-bai kèm IP, không chứa mật khẩu', async () => {
    await dangNhap(dung(), 'sai-mat-khau-day', '9.9.9.9');
    const dong = db.prepare('SELECT * FROM nhat_ky').get() as { loai: string; ip: string; chi_tiet: string | null };
    expect(dong.loai).toBe('dang-nhap-that-bai');
    expect(dong.ip).toBe('9.9.9.9');
    expect(JSON.stringify(dong)).not.toContain('sai-mat-khau-day');
  });
});

describe('đổi mật khẩu', () => {
  it('mật khẩu cũ sai → 400; mật khẩu mới ngắn → 400', async () => {
    const app = dung();
    const c = cookie(await dangNhap(app)).split(';')[0]!;
    const csrf = (await gui(app, c)).body.csrf as string;
    const gui2 = (body: object) => request(app).post('/api/admin/doi-mat-khau').set('Cookie', c).set('X-CSRF-Token', csrf).send(body);
    expect((await gui2({ matKhauCu: 'sai-mat-khau-cu-day', matKhauMoi: 'mat-khau-moi-12-ky-tu' })).status).toBe(400);
    expect((await gui2({ matKhauCu: MK, matKhauMoi: 'ngan' })).status).toBe(400);
    expect((await dangNhap(app, MK, '1.1.1.9')).status).toBe(200); // vẫn mật khẩu cũ
  });

  it('đổi đúng → mọi phiên cũ hết hiệu lực, máy này nhận phiên mới, đăng nhập bằng mật khẩu mới', async () => {
    const app = dung();
    const c1 = cookie(await dangNhap(app)).split(';')[0]!;
    const c2 = cookie(await dangNhap(app, MK, '1.1.1.2')).split(';')[0]!;
    const csrf = (await gui(app, c1)).body.csrf as string;
    const r = await request(app).post('/api/admin/doi-mat-khau').set('Cookie', c1).set('X-CSRF-Token', csrf).send({ matKhauCu: MK, matKhauMoi: 'mat-khau-moi-12-ky-tu' });
    expect(r.status).toBe(200);
    expect((await gui(app, c1)).status).toBe(401);
    expect((await gui(app, c2)).status).toBe(401);
    expect((await gui(app, cookie(r).split(';')[0]!)).status).toBe(200);
    expect((await dangNhap(app, 'mat-khau-moi-12-ky-tu', '1.1.1.3')).status).toBe(200);
    expect((await dangNhap(app, MK, '1.1.1.4')).status).toBe(401);
  });
});

describe('/api/admin chưa biết đường dẫn', () => {
  it('chưa đăng nhập → 401 JSON; đã đăng nhập mà sai đường dẫn → 404 JSON', async () => {
    const app = dung();
    expect((await request(app).get('/api/admin/khong-co')).status).toBe(401);
    const c = cookie(await dangNhap(app)).split(';')[0]!;
    const r = await request(app).get('/api/admin/khong-co').set('Cookie', c);
    expect(r.status).toBe(404);
    expect(r.body).toHaveProperty('loi');
  });
});
