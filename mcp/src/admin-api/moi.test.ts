// Mời người dùng qua email: token 48 giờ dùng một lần, chống lạm dụng, tạo tài khoản + đăng nhập, quản trị phải bật 2FA.
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { dungAdmin, MK } from './thu-nghiem';

type Moi = Awaited<ReturnType<typeof dungAdmin>>;
let m: Moi;
beforeEach(async () => {
  m = await dungAdmin();
});
const GIO = 3600_000;
const moi = (email = 'nguoi-moi@x.vn', vaiTro = 'writer') => m.chinh.gui('post', '/tai-khoan/moi', { email, vaiTro });
const hang = () => m.db.prepare('SELECT * FROM mail_hang_doi ORDER BY id').all() as { loai: string; den: string; text: string; html: string }[];
const tokenCuoi = () => /token=([A-Za-z0-9_-]+)/.exec(hang().at(-1)!.text)![1]!;
const nhan = (token: string, body: object = { ten: 'Người Mới', matKhau: MK }) => request(m.app).post(`/api/admin/loi-moi/${token}/nhan`).send(body);

describe('gửi lời mời', () => {
  it('mời → đúng 1 mail quan-trong có link /quan-tri/nhan-loi-moi?token=…; token chỉ lưu băm; ghi nhật ký', async () => {
    expect((await moi()).status).toBe(201);
    const ds = hang();
    expect(ds).toHaveLength(1);
    expect(ds[0]).toMatchObject({ loai: 'quan-trong', den: 'nguoi-moi@x.vn' });
    expect(ds[0]!.text).toContain('http://localhost:8090/quan-tri/nhan-loi-moi?token=');
    expect(ds[0]!.text).toContain('Người viết (writer)');
    expect(JSON.stringify(m.db.prepare('SELECT * FROM loi_moi').all())).not.toContain(tokenCuoi());
    expect(m.db.prepare("SELECT count(*) AS n FROM nhat_ky WHERE loai = 'moi'").get()).toEqual({ n: 1 });
  });

  it('email đã có tài khoản (khác hoa/thường) → 409; email hoặc vai trò sai → 400', async () => {
    expect((await moi('CHU@x.vn')).status).toBe(409);
    expect((await moi('khong-phai-email')).status).toBe(400);
    expect((await moi('a@x.vn', 'sieu-nhan')).status).toBe(400);
    expect(hang()).toHaveLength(0);
  });

  it('writer / quản lý gọi /moi → 403', async () => {
    for (const vt of ['writer', 'quan-ly'] as const) {
      const p = await m.dangNhap(`${vt}@x.vn`, vt, vt);
      expect((await p.gui('post', '/tai-khoan/moi', { email: 'a@x.vn', vaiTro: 'writer' })).status, vt).toBe(403);
    }
    expect(hang()).toHaveLength(0);
  });

  it('tối đa 5 lời mời/giờ/người mời; sau 1 giờ mời tiếp được', async () => {
    for (let i = 0; i < 5; i++) expect((await moi(`n${i}@x.vn`)).status).toBe(201);
    expect((await moi('n5@x.vn')).status).toBe(429);
    m.dongHo.v += GIO + 1000;
    const lai = await m.dangNhap('chu2@x.vn', 'Chủ 2'); // phiên cũ hết hạn sau 12 giờ? vẫn dưới 12 giờ nên dùng lại được
    expect((await lai.gui('post', '/tai-khoan/moi', { email: 'n5@x.vn', vaiTro: 'writer' })).status).toBe(201);
  });

  it('mời lại cùng email → lời mời cũ vô hiệu, chỉ link mới dùng được', async () => {
    await moi();
    const cu = tokenCuoi();
    await moi();
    const moiTk = tokenCuoi();
    expect((await request(m.app).get(`/api/admin/loi-moi/${cu}`)).status).toBe(410);
    expect((await request(m.app).get(`/api/admin/loi-moi/${moiTk}`)).status).toBe(200);
  });
});

describe('nhận lời mời', () => {
  it('xem lời mời (công khai) → email + vai trò; nhận → tạo tài khoản đúng vai trò, đăng nhập luôn (cookie), dùng được API', async () => {
    await moi('writer-moi@x.vn', 'writer');
    const tk = tokenCuoi();
    expect((await request(m.app).get(`/api/admin/loi-moi/${tk}`)).body).toEqual({ email: 'writer-moi@x.vn', vaiTro: 'writer' });
    const r = await nhan(tk);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, canBatTotp: false, nguoiDung: { email: 'writer-moi@x.vn', vaiTro: 'writer', ten: 'Người Mới' } });
    const cookie = (r.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
    expect((await request(m.app).get('/api/admin/toi').set('Cookie', cookie)).body.nguoiDung.vaiTro).toBe('writer');
    expect((await request(m.app).get('/api/admin/bai').set('Cookie', cookie)).status).toBe(200);
    expect(JSON.stringify(r.body)).not.toMatch(/argon2/);
  });

  it('nhận sau 48 giờ 1 phút → 410; còn 1 phút trước hạn vẫn được', async () => {
    await moi('a@x.vn');
    const tk = tokenCuoi();
    m.dongHo.v += 48 * GIO - 60_000;
    expect((await request(m.app).get(`/api/admin/loi-moi/${tk}`)).status).toBe(200);
    m.dongHo.v += 120_000;
    expect((await request(m.app).get(`/api/admin/loi-moi/${tk}`)).status).toBe(410);
    expect((await nhan(tk)).status).toBe(410);
  });

  it('nhận 2 lần → lần 2 410; nhận song song → đúng một cái thành công', async () => {
    await moi('a@x.vn');
    const tk = tokenCuoi();
    expect((await nhan(tk)).status).toBe(200);
    expect((await nhan(tk, { ten: 'Kẻ khác', matKhau: MK })).status).toBe(410);
    await moi('b@x.vn');
    const tk2 = tokenCuoi();
    const kq = await Promise.all([nhan(tk2), nhan(tk2), nhan(tk2)]);
    expect(kq.filter((x) => x.status === 200)).toHaveLength(1);
    expect(m.db.prepare("SELECT count(*) AS n FROM nguoi_dung WHERE email = 'b@x.vn'").get()).toEqual({ n: 1 });
  });

  it('mật khẩu < 12 ký tự → 400 (lời mời chưa bị tiêu); thiếu tên → 400; token lạ → 410', async () => {
    await moi('a@x.vn');
    const tk = tokenCuoi();
    const ngan = await nhan(tk, { ten: 'A', matKhau: 'ngan' });
    expect(ngan.status).toBe(400);
    expect(ngan.body.loi).toMatch(/12/);
    expect((await nhan(tk, { ten: '', matKhau: MK })).status).toBe(400);
    expect((await nhan('khong-phai-token')).status).toBe(410);
    expect((await nhan(tk)).status).toBe(200);
  });

  it('lời mời vai trò quan-tri: nhận xong báo canBatTotp và API khác bị chặn "Cần bật xác thực 2 lớp" (luật GĐ1)', async () => {
    await moi('qt-moi@x.vn', 'quan-tri');
    const r = await nhan(tokenCuoi());
    expect(r.body).toMatchObject({ canBatTotp: true, nguoiDung: { vaiTro: 'quan-tri' } });
    const cookie = (r.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
    const khac = await request(m.app).get('/api/admin/bai').set('Cookie', cookie);
    expect(khac.status).toBe(403);
    expect(khac.body).toEqual({ loi: 'Cần bật xác thực 2 lớp' });
    expect((await request(m.app).get('/api/admin/toi').set('Cookie', cookie)).status).toBe(200);
  });

  it('người đã có tài khoản trong lúc chờ (tạo bằng CLI) → lời mời thành 410', async () => {
    await moi('a@x.vn');
    const tk = tokenCuoi();
    const { taoNguoiDung } = await import('../tai-khoan/nguoi-dung');
    await taoNguoiDung(m.db, { email: 'a@x.vn', ten: 'Đã có', vaiTro: 'writer', matKhau: MK });
    expect((await nhan(tk)).status).toBe(410);
  });
});
