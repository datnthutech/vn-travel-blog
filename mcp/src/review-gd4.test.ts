// Các lỗi tìm thấy khi review giai đoạn 4.
import sharp from 'sharp';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { baiDayDu, dungAdmin, MK, taoAnhGia } from './admin-api/thu-nghiem';
import { moDb } from './db/ket-noi';
import { taoDichVuMail } from './mail/dich-vu';
import { themNhaCungCap } from './mail/nha-cung-cap';

const tokenCuoi = (m: Awaited<ReturnType<typeof dungAdmin>>) => /token=([A-Za-z0-9_-]+)/.exec((m.db.prepare('SELECT text FROM mail_hang_doi ORDER BY id DESC LIMIT 1').get() as { text: string }).text)![1]!;

describe('review GĐ4', () => {
  it('lời mời chưa dùng của người mời đã bị khoá (hoặc bị hạ vai trò) → vô hiệu cả khi xem lẫn khi nhận', async () => {
    const m = await dungAdmin();
    const hai = await m.dangNhap('hai@x.vn', 'Hai', 'quan-tri');
    await hai.gui('post', '/tai-khoan/moi', { email: 'ke-xau@x.vn', vaiTro: 'quan-tri' });
    const tk = tokenCuoi(m);
    expect((await request(m.app).get(`/api/admin/loi-moi/${tk}`)).status).toBe(200);
    await m.chinh.gui('put', `/tai-khoan/${hai.nguoi.id}`, { biKhoa: true });
    expect((await request(m.app).get(`/api/admin/loi-moi/${tk}`)).status).toBe(410);
    expect((await request(m.app).post(`/api/admin/loi-moi/${tk}/nhan`).send({ ten: 'X', matKhau: MK })).status).toBe(410);
    expect(m.db.prepare("SELECT count(*) AS n FROM nguoi_dung WHERE email = 'ke-xau@x.vn'").get()).toEqual({ n: 0 });
    // hạ vai trò (không khoá) cũng vô hiệu
    await m.chinh.gui('put', `/tai-khoan/${hai.nguoi.id}`, { biKhoa: false, vaiTro: 'quan-ly' });
    expect((await request(m.app).get(`/api/admin/loi-moi/${tk}`)).status).toBe(410);
  });

  it('mail có liên kết còn hiệu lực (mời, đặt lại mật khẩu): sau khi GỬI, html/text trong hàng đợi bị xoá; mail thường giữ nguyên', async () => {
    const db = moDb(':memory:');
    const daGui: string[] = [];
    const dv = taoDichVuMail(db, { khoaBiMat: 'a'.repeat(64), taoTransport: () => ({ sendMail: async (o) => void daGui.push(o.text) }) });
    themNhaCungCap(db, 'a'.repeat(64), { ten: 'g', host: 'h', cong: 465, baoMat: 'ssl', taiKhoan: 't', diaChiGui: 'a@b.vn', gioiHanNgay: 100, duPhongQuanTrong: 0, thuTu: 0, laChinh: true, bat: true });
    dv.gui({ loai: 'quan-trong', nhayCam: true, den: 'a@x.vn', tieuDe: 'Mời', text: 'LIEN-KET-BI-MAT', html: '<a>LIEN-KET-BI-MAT</a>' });
    dv.gui({ loai: 'thuong', den: 'b@x.vn', tieuDe: 'Thường', text: 'noi dung thuong', html: '<p>thuong</p>' });
    expect((db.prepare("SELECT text FROM mail_hang_doi WHERE den = 'a@x.vn'").get() as { text: string }).text).toBe('LIEN-KET-BI-MAT'); // chưa gửi: còn nội dung để gửi
    await dv.xuLyHangDoi();
    expect(daGui).toContain('LIEN-KET-BI-MAT'); // nhà cung cấp nhận đủ nội dung thật
    expect(db.prepare("SELECT text, html FROM mail_hang_doi WHERE den = 'a@x.vn'").get()).toEqual({ text: '', html: '' });
    expect((db.prepare("SELECT text FROM mail_hang_doi WHERE den = 'b@x.vn'").get() as { text: string }).text).toBe('noi dung thuong');
  });

  it('nhận lời mời mà tạo tài khoản thất bại → trả lại lời mời (không bị tiêu), thử lại được', async () => {
    const m = await dungAdmin();
    await m.chinh.gui('post', '/tai-khoan/moi', { email: 'loi@x.vn', vaiTro: 'writer' });
    const tk = tokenCuoi(m);
    m.db.exec("CREATE TRIGGER chan_tao BEFORE INSERT ON nguoi_dung WHEN NEW.email = 'loi@x.vn' BEGIN SELECT RAISE(ABORT, 'boom'); END;");
    const hong = await request(m.app).post(`/api/admin/loi-moi/${tk}/nhan`).send({ ten: 'X', matKhau: MK });
    expect(hong.status).toBe(500);
    m.db.exec('DROP TRIGGER chan_tao');
    expect((await request(m.app).get(`/api/admin/loi-moi/${tk}`)).status).toBe(200);
    expect((await request(m.app).post(`/api/admin/loi-moi/${tk}/nhan`).send({ ten: 'X', matKhau: MK })).status).toBe(200);
  });

  it('writer sửa alt mặc định: chỉ ảnh của mình (ảnh người khác → 403)', async () => {
    const m = await dungAdmin();
    const w = await m.dangNhap('w@x.vn', 'W', 'writer');
    const jpeg = (c: string) => sharp({ create: { width: 20, height: 20, channels: 3, background: c } }).jpeg().toBuffer();
    const cuaQt = (await m.chinh.gui('post', '/anh').attach('files', await jpeg('#111111'), 'a.jpg')).body.ok[0].ma as string;
    const cuaW = (await w.gui('post', '/anh').attach('files', await jpeg('#222222'), 'b.jpg')).body.ok[0].ma as string;
    expect((await w.gui('patch', `/anh/${cuaQt}`, { altMacDinh: 'phá' })).status).toBe(403);
    expect((await w.gui('patch', `/anh/${cuaW}`, { altMacDinh: 'của tôi' })).status).toBe(200);
    expect((await m.chinh.gui('patch', `/anh/${cuaW}`, { altMacDinh: 'quản trị sửa' })).status).toBe(200);
  });

  it('id không tồn tại: mọi vai trò nhận 404 như nhau (không phải 403 cho writer)', async () => {
    const m = await dungAdmin();
    taoAnhGia(m.anhDir, 'anh1');
    const w = await m.dangNhap('w@x.vn', 'W', 'writer');
    for (const p of [m.chinh, w]) {
      expect((await p.gui('put', '/bai/99999', { bai: baiDayDu('x'), noiDung: '' })).status).toBe(404);
      expect((await p.gui('post', '/bai/99999/dang')).status).toBe(404);
      expect((await p.gui('delete', '/anh/khongco')).status).toBe(404);
    }
  });
});
