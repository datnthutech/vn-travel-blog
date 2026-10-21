// Redirect thủ công (kiểm tra đích/nguồn) và bảng tổng quan (đếm trạng thái, sao lưu ngoài VPS, cảnh báo 1 lần/ngày).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { taoNguoiDung } from '../tai-khoan/nguoi-dung';
import { baiDayDu, dungAdmin, MK, taoAnhGia } from './thu-nghiem';

type Moi = Awaited<ReturnType<typeof dungAdmin>>;
let m: Moi;
beforeEach(async () => {
  m = await dungAdmin();
  taoAnhGia(m.anhDir, 'anh1');
});
const tao = async (slug: string, over: Record<string, unknown> = {}, dang = true) => {
  const id = (await m.chinh.gui('post', '/bai', { bai: baiDayDu(slug, over), noiDung: 'x' })).body.id as number;
  if (dang) expect((await m.chinh.gui('post', `/bai/${id}/dang`)).status).toBe(200);
  return id;
};

describe('redirect', () => {
  it('redirect tới URL không tồn tại → 400; tới bài NHÁP → 400 (chưa có trên site)', async () => {
    await tao('nhap-1', {}, false);
    expect((await m.chinh.gui('post', '/redirect', { tu: '/cu/', den: '/khong-co/x/' })).status).toBe(400);
    expect((await m.chinh.gui('post', '/redirect', { tu: '/cu/', den: '/kinh-nghiem/nhap-1/' })).status).toBe(400);
  });

  it('thêm tới bài đã đăng / trang tỉnh / trang chuyên mục / trang tĩnh → 201; xuất hiện trong danh sách là thủ công', async () => {
    await tao('a');
    expect((await m.chinh.gui('post', '/redirect', { tu: '/bai-cu/', den: '/kinh-nghiem/a/' })).status).toBe(201);
    expect((await m.chinh.gui('post', '/redirect', { tu: '/ve-chung-toi/', den: '/gioi-thieu/' })).status).toBe(201);
    m.db.prepare("INSERT INTO tinh (slug, du_lieu) VALUES ('vung-tau', '{}')").run();
    expect((await m.chinh.gui('post', '/redirect', { tu: '/vt/', den: '/vung-tau/' })).status).toBe(201);
    const ds = (await m.chinh.gui('get', '/redirect')).body as { tu: string; tuDong: boolean }[];
    expect(ds.map((r) => r.tu)).toEqual(['/bai-cu/', '/ve-chung-toi/', '/vt/']);
    expect(ds.every((r) => r.tuDong === false)).toBe(true);
  });

  it('nguồn đè lên trang có thật → 400; trùng nguồn → 409; sai định dạng đường dẫn → 400; nguồn = đích → 400', async () => {
    await tao('a');
    expect((await m.chinh.gui('post', '/redirect', { tu: '/kinh-nghiem/a/', den: '/gioi-thieu/' })).status).toBe(400);
    expect((await m.chinh.gui('post', '/redirect', { tu: '/x/', den: '/gioi-thieu/' })).status).toBe(201);
    expect((await m.chinh.gui('post', '/redirect', { tu: '/x/', den: '/lien-he/' })).status).toBe(409);
    for (const tu of ['x', '/x', '/../etc/', '/x y/', 'https://evil.com/']) expect((await m.chinh.gui('post', '/redirect', { tu, den: '/gioi-thieu/' })).status, tu).toBe(400);
    expect((await m.chinh.gui('post', '/redirect', { tu: '/gioi-thieu/', den: '/gioi-thieu/' })).status).toBe(400);
  });

  it('redirect tự động (đổi slug) có tuDong=true; xoá được cả hai loại; xoá không có → 404; mỗi thay đổi xếp build', async () => {
    const id = await tao('a');
    await m.chinh.gui('put', `/bai/${id}`, { bai: { ...(await m.chinh.gui('get', `/bai/${id}`)).body.bai, slug: 'b' }, noiDung: 'x', phienSo: 2 });
    const ds = (await m.chinh.gui('get', '/redirect')).body as { tu: string; tuDong: boolean }[];
    expect(ds).toEqual([{ tu: '/kinh-nghiem/a/', den: '/kinh-nghiem/b/', tuDong: true }]);
    const y = m.yeuCau.so;
    expect((await m.chinh.gui('delete', '/redirect?tu=/kinh-nghiem/a/')).status).toBe(200);
    expect(m.yeuCau.so).toBe(y + 1);
    expect((await m.chinh.gui('delete', '/redirect?tu=/kinh-nghiem/a/')).status).toBe(404);
  });
});

describe('tổng quan', () => {
  it('đếm đúng trạng thái bài, ảnh, mail; chưa đăng nhập → 401', async () => {
    await tao('a');
    await tao('b', {}, false);
    const c = await tao('c', {}, false);
    await m.chinh.gui('post', `/bai/${c}/thung-rac`);
    const r = (await m.chinh.gui('get', '/tong-quan')).body;
    expect(r.bai).toEqual({ daDang: 1, nhap: 1, henGio: 0, thungRac: 1 });
    expect(r).toMatchObject({ banDichThieuHoacCu: 0, binhLuanMoi: 0, mail: [] });
    expect(r.build).toMatchObject({ trangThai: 'roi', previewNoiDungPhien: null });
    expect(r.saoLuu).toMatchObject({ trongVpsLuc: null, ngoaiVpsLuc: null, canhBao: true });
    expect(r.oDia).toHaveProperty('daDungByte');
    const { default: request } = await import('supertest');
    expect((await request(m.app).get('/api/admin/tong-quan')).status).toBe(401);
  });

  const danhDau = (v: number | string) => {
    mkdirSync(join(m.config.dataDir, 'db', 'sao-luu'), { recursive: true });
    writeFileSync(join(m.config.dataDir, 'db', 'sao-luu', '.da-day-ra-ngoai'), String(v));
  };

  it('ngoaiVpsLuc 27 giờ trước → canhBao=true và ĐÚNG 1 mail quan-trong/quản trị trong ngày dù gọi nhiều lần', async () => {
    await taoNguoiDung(m.db, { email: 'qt1@x.vn', ten: 'QT Một', vaiTro: 'quan-tri', matKhau: MK });
    await taoNguoiDung(m.db, { email: 'qt2@x.vn', ten: 'QT Hai', vaiTro: 'quan-tri', matKhau: MK });
    await taoNguoiDung(m.db, { email: 'ql@x.vn', ten: 'Quản lý', vaiTro: 'quan-ly', matKhau: MK });
    danhDau(m.dongHo.v - 27 * 3600_000);
    for (let i = 0; i < 4; i++) {
      const r = (await m.chinh.gui('get', '/tong-quan')).body;
      expect(r.saoLuu.canhBao).toBe(true);
    }
    const mails = m.db.prepare("SELECT loai, den FROM mail_hang_doi ORDER BY den").all() as { loai: string; den: string }[];
    expect(mails).toEqual([{ loai: 'quan-trong', den: 'qt1@x.vn' }, { loai: 'quan-trong', den: 'qt2@x.vn' }]);
  });

  it('sang ngày mới (giờ VN) và vẫn quá hạn → gửi thêm đúng 1 lần nữa; bản ra ngoài còn mới → không cảnh báo, không mail', async () => {
    await taoNguoiDung(m.db, { email: 'qt1@x.vn', ten: 'QT', vaiTro: 'quan-tri', matKhau: MK });
    const t0 = m.dongHo.v;
    danhDau(t0 - 30 * 3600_000);
    await m.chinh.gui('get', '/tong-quan');
    expect((m.db.prepare('SELECT count(*) AS n FROM mail_hang_doi').get() as { n: number }).n).toBe(1);
    // ngày kế tiếp giờ VN (t0 = 03:00 UTC = 10:00 VN → +17h = 03:00 VN ngày sau); đăng nhập lại vì phiên 12 giờ đã hết
    m.dongHo.v = t0 + 17 * 3600_000;
    const moi = await m.dangNhap('b@x.vn', 'B');
    await moi.gui('get', '/tong-quan');
    await moi.gui('get', '/tong-quan');
    expect((m.db.prepare('SELECT count(*) AS n FROM mail_hang_doi').get() as { n: number }).n).toBe(2);
    danhDau(m.dongHo.v - 3600_000); // vừa sao lưu ra ngoài
    m.dongHo.v += 20 * 3600_000;
    const c = await m.dangNhap('c@x.vn', 'C');
    const r = (await c.gui('get', '/tong-quan')).body;
    expect(r.saoLuu.canhBao).toBe(false);
    expect((m.db.prepare('SELECT count(*) AS n FROM mail_hang_doi').get() as { n: number }).n).toBe(2);
  });

  it('chưa có file đánh dấu (chưa cấu hình sao lưu ngoài) → chỉ cảnh báo trên bảng, KHÔNG gửi mail', async () => {
    await taoNguoiDung(m.db, { email: 'qt1@x.vn', ten: 'QT', vaiTro: 'quan-tri', matKhau: MK });
    expect((await m.chinh.gui('get', '/tong-quan')).body.saoLuu.canhBao).toBe(true);
    expect((m.db.prepare('SELECT count(*) AS n FROM mail_hang_doi').get() as { n: number }).n).toBe(0);
  });

  it('lần chuyển nhà cung cấp mail gần nhất được báo', async () => {
    m.db.prepare("INSERT INTO nhat_ky (luc, loai, chi_tiet) VALUES (?, 'mail-chuyen-nha-cung-cap', ?)").run(12345, JSON.stringify({ tu: 'Gmail', sang: 'Brevo' }));
    expect((await m.chinh.gui('get', '/tong-quan')).body.chuyenNhaCungCapGanNhat).toEqual({ luc: 12345, tu: 'Gmail', den: 'Brevo' });
  });
});
