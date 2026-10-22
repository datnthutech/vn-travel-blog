// Quản lý tài khoản (đổi vai trò, khoá, đặt lại 2FA) + nhật ký. Review Focus GĐ4: quản trị cuối cùng không tự hạ/khoá mình.
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { dungAdmin, MK } from './thu-nghiem';

type Moi = Awaited<ReturnType<typeof dungAdmin>>;
let m: Moi;
beforeEach(async () => {
  m = await dungAdmin();
});
const nhatKy = async (qs = '') => (await m.chinh.gui('get', `/nhat-ky${qs}`)).body as { tong: number; dong: { loai: string; chiTiet: Record<string, unknown> | null; nguoiDung: { ten: string } | null }[] };

describe('danh sách tài khoản', () => {
  it('trả đủ trường, KHÔNG có mật khẩu/bí mật; dangNhapCuoiLuc lấy từ nhật ký đăng nhập; chỉ quản trị xem được', async () => {
    const w = await m.dangNhap('w@x.vn', 'Writer', 'writer');
    const r = await m.chinh.gui('get', '/tai-khoan');
    expect(r.status).toBe(200);
    const ds = r.body as { id: number; email: string; vaiTro: string; biKhoa: boolean; coTotp: boolean; dangNhapCuoiLuc: number | null }[];
    expect(ds).toHaveLength(2);
    expect(ds.find((u) => u.email === 'w@x.vn')).toMatchObject({ vaiTro: 'writer', biKhoa: false, coTotp: false, dangNhapCuoiLuc: m.dongHo.v });
    expect(ds.find((u) => u.email === 'chu@x.vn')).toMatchObject({ vaiTro: 'quan-tri', coTotp: true });
    expect(JSON.stringify(r.body)).not.toMatch(/argon2|totp_bi_mat|mat_khau/);
    expect((await w.gui('get', '/tai-khoan')).status).toBe(403);
  });
});

describe('đổi vai trò và khoá', () => {
  it('khoá người đang đăng nhập → request kế tiếp của họ 401; không đăng nhập lại được; mở khoá thì đăng nhập lại được', async () => {
    const w = await m.dangNhap('w@x.vn', 'Writer', 'writer');
    expect((await w.gui('get', '/bai')).status).toBe(200);
    expect((await m.chinh.gui('put', `/tai-khoan/${w.nguoi.id}`, { biKhoa: true })).status).toBe(200);
    expect((await w.gui('get', '/bai')).status).toBe(401);
    const thu = await request(m.app).post('/api/admin/dang-nhap').set('X-Forwarded-For', '5.5.5.5').send({ email: 'w@x.vn', matKhau: MK });
    expect(thu.status).toBe(401);
    expect(m.db.prepare('SELECT count(*) AS n FROM phien WHERE nguoi_dung_id = ?').get(w.nguoi.id)).toEqual({ n: 0 });
    expect((await m.chinh.gui('put', `/tai-khoan/${w.nguoi.id}`, { biKhoa: false })).status).toBe(200);
    expect((await request(m.app).post('/api/admin/dang-nhap').set('X-Forwarded-For', '6.6.6.6').send({ email: 'w@x.vn', matKhau: MK })).status).toBe(200);
  });

  it('đổi vai trò có hiệu lực NGAY ở phiên đang mở (quản lý → writer mất quyền sửa cấu trúc)', async () => {
    const q = await m.dangNhap('q@x.vn', 'QL', 'quan-ly');
    expect((await q.gui('post', '/chuyen-muc', { ten: 'Thử' })).status).toBe(201);
    await m.chinh.gui('put', `/tai-khoan/${q.nguoi.id}`, { vaiTro: 'writer' });
    expect((await q.gui('post', '/chuyen-muc', { ten: 'Thử hai' })).status).toBe(403);
  });

  it('(Review Focus) quản trị cuối cùng tự hạ vai trò hoặc tự khoá mình → 409, không đổi gì', async () => {
    const tu = m.chinh.nguoi.id;
    for (const body of [{ vaiTro: 'quan-ly' }, { vaiTro: 'writer' }, { biKhoa: true }, { vaiTro: 'writer', biKhoa: true }]) {
      const r = await m.chinh.gui('put', `/tai-khoan/${tu}`, body);
      expect(r.status, JSON.stringify(body)).toBe(409);
      expect(r.body.loi).toMatch(/ít nhất một quản trị/);
    }
    expect((await m.chinh.gui('get', '/toi')).body.nguoiDung).toMatchObject({ vaiTro: 'quan-tri', biKhoa: false });
  });

  it('có 2 quản trị thì hạ được 1; rồi người còn lại là quản trị cuối → không hạ/khoá được nữa; quản trị bị khoá không tính', async () => {
    const hai = await m.dangNhap('hai@x.vn', 'Hai', 'quan-tri');
    expect((await m.chinh.gui('put', `/tai-khoan/${hai.nguoi.id}`, { vaiTro: 'quan-ly' })).status).toBe(200);
    expect((await m.chinh.gui('put', `/tai-khoan/${m.chinh.nguoi.id}`, { biKhoa: true })).status).toBe(409);
    // quản trị bị khoá không phải là "đang hoạt động": mở lại hai làm quản trị, khoá chu → rồi hai là cuối cùng
    await m.chinh.gui('put', `/tai-khoan/${hai.nguoi.id}`, { vaiTro: 'quan-tri' });
    expect((await m.chinh.gui('put', `/tai-khoan/${m.chinh.nguoi.id}`, { biKhoa: true })).status).toBe(200);
    expect((await hai.gui('put', `/tai-khoan/${hai.nguoi.id}`, { biKhoa: true })).status).toBe(409);
    expect((await hai.gui('put', `/tai-khoan/${hai.nguoi.id}`, { vaiTro: 'writer' })).status).toBe(409);
  });

  it('dữ liệu sai → 400; tài khoản lạ → 404; quản lý/writer gọi → 403', async () => {
    const w = await m.dangNhap('w@x.vn', 'W', 'writer');
    expect((await m.chinh.gui('put', `/tai-khoan/${w.nguoi.id}`, { vaiTro: 'sieu-nhan' })).status).toBe(400);
    expect((await m.chinh.gui('put', `/tai-khoan/${w.nguoi.id}`, { biKhoa: 'co' })).status).toBe(400);
    expect((await m.chinh.gui('put', `/tai-khoan/${w.nguoi.id}`, {})).status).toBe(400);
    expect((await m.chinh.gui('put', '/tai-khoan/9999', { biKhoa: true })).status).toBe(404);
    const q = await m.dangNhap('q@x.vn', 'Q', 'quan-ly');
    expect((await q.gui('put', `/tai-khoan/${w.nguoi.id}`, { biKhoa: true })).status).toBe(403);
    expect((await w.gui('put', `/tai-khoan/${m.chinh.nguoi.id}`, { vaiTro: 'writer' })).status).toBe(403);
  });
});

describe('đặt lại 2FA', () => {
  it('xoá bí mật và mã dự phòng, đăng xuất mọi phiên của người đó; quản trị bị đặt lại phải bật lại 2FA mới dùng được API', async () => {
    const hai = await m.dangNhap('hai@x.vn', 'Hai', 'quan-tri'); // đã bật 2FA bằng bộ test
    expect(m.db.prepare('SELECT count(*) AS n FROM ma_du_phong WHERE nguoi_dung_id = ?').get(hai.nguoi.id)).toEqual({ n: 10 });
    expect((await m.chinh.gui('post', `/tai-khoan/${hai.nguoi.id}/dat-lai-2fa`)).status).toBe(200);
    expect(m.db.prepare('SELECT totp_bi_mat AS t FROM nguoi_dung WHERE id = ?').get(hai.nguoi.id)).toEqual({ t: null });
    expect(m.db.prepare('SELECT count(*) AS n FROM ma_du_phong WHERE nguoi_dung_id = ?').get(hai.nguoi.id)).toEqual({ n: 0 });
    expect((await hai.gui('get', '/toi')).status).toBe(401);
    const dn = await request(m.app).post('/api/admin/dang-nhap').set('X-Forwarded-For', '7.7.7.7').send({ email: 'hai@x.vn', matKhau: MK });
    expect(dn.body).toEqual({ canTotp: false });
    const cookie = (dn.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
    const khac = await request(m.app).get('/api/admin/bai').set('Cookie', cookie);
    expect(khac.status).toBe(403);
    expect(khac.body.loi).toBe('Cần bật xác thực 2 lớp');
  });

  it('review cuối #4: đặt lại 2FA thu hồi luôn token MCP (Claude) của người đó', async () => {
    const ba = await m.dangNhap('ba@x.vn', 'Ba', 'writer');
    m.db.prepare("INSERT INTO oauth_token (token_bam, loai, client_id, nguoi_dung_id, het_han_luc, scopes, resource) VALUES ('t1', 'refresh', 'c', ?, ?, '', NULL)").run(ba.nguoi.id, Date.now() + 86_400_000);
    expect((await m.chinh.gui('post', `/tai-khoan/${ba.nguoi.id}/dat-lai-2fa`)).status).toBe(200);
    expect(m.db.prepare('SELECT count(*) AS n FROM oauth_token WHERE nguoi_dung_id = ?').get(ba.nguoi.id)).toEqual({ n: 0 });
  });

  it('không tự đặt lại 2FA của mình (400); tài khoản lạ 404; writer gọi 403', async () => {
    expect((await m.chinh.gui('post', `/tai-khoan/${m.chinh.nguoi.id}/dat-lai-2fa`)).status).toBe(400);
    expect((await m.chinh.gui('post', '/tai-khoan/9999/dat-lai-2fa')).status).toBe(404);
    const w = await m.dangNhap('w@x.vn', 'W', 'writer');
    expect((await w.gui('post', `/tai-khoan/${m.chinh.nguoi.id}/dat-lai-2fa`)).status).toBe(403);
  });
});

describe('nhật ký', () => {
  it('ghi đủ loại: moi, doi-vai-tro, khoa, mo-khoa, dat-lai-2fa — kèm người thao tác; lọc theo loại/người/ngày; quản lý gọi → 403', async () => {
    const w = await m.dangNhap('w@x.vn', 'Writer', 'writer');
    await m.chinh.gui('post', '/tai-khoan/moi', { email: 'moi@x.vn', vaiTro: 'writer' });
    await m.chinh.gui('put', `/tai-khoan/${w.nguoi.id}`, { vaiTro: 'quan-ly' });
    await m.chinh.gui('put', `/tai-khoan/${w.nguoi.id}`, { biKhoa: true });
    await m.chinh.gui('put', `/tai-khoan/${w.nguoi.id}`, { biKhoa: false });
    await m.chinh.gui('post', `/tai-khoan/${w.nguoi.id}/dat-lai-2fa`);
    const tat = await nhatKy();
    const loai = new Set(tat.dong.map((d) => d.loai));
    for (const l of ['moi', 'doi-vai-tro', 'khoa', 'mo-khoa', 'dat-lai-2fa', 'dang-nhap']) expect(loai.has(l), l).toBe(true);
    const doiVaiTro = (await nhatKy('?loai=doi-vai-tro')).dong;
    expect(doiVaiTro).toHaveLength(1);
    expect(doiVaiTro[0]).toMatchObject({ chiTiet: { doi: w.nguoi.id, tu: 'writer', sang: 'quan-ly' }, nguoiDung: { ten: 'Chủ blog' } });
    expect((await nhatKy(`?nguoiDungId=${m.chinh.nguoi.id}&loai=khoa`)).tong).toBe(1);
    expect((await nhatKy('?nguoiDungId=9999')).tong).toBe(0);
    const homNay = new Date(m.dongHo.v + 7 * 3600_000).toISOString().slice(0, 10);
    expect((await nhatKy(`?tu=${homNay}&den=${homNay}`)).tong).toBe(tat.tong);
    expect((await nhatKy('?tu=2000-01-01&den=2000-01-02')).tong).toBe(0);
    expect((await m.chinh.gui('get', '/nhat-ky?tu=khong-phai-ngay')).status).toBe(400);
    expect((await m.chinh.gui('get', '/nhat-ky?nguoiDungId=abc')).status).toBe(400);
    const q = await m.dangNhap('q@x.vn', 'QL', 'quan-ly');
    expect((await q.gui('get', '/nhat-ky')).status).toBe(403);
  });

  it('phân trang 50 dòng/trang, mới nhất trước', async () => {
    for (let i = 0; i < 55; i++) m.db.prepare("INSERT INTO nhat_ky (luc, loai) VALUES (?, 'thu')").run(i);
    const t1 = await nhatKy('?loai=thu');
    expect(t1.dong).toHaveLength(50);
    expect(t1.tong).toBe(55);
    expect((await nhatKy('?loai=thu&trang=2')).dong).toHaveLength(5);
  });
});
