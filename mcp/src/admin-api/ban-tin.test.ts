// API quản trị bản tin: quyền, soạn/sửa, nháp từ bài, gửi thử, gửi, tiến độ, danh sách + CSV + xoá người đăng ký.
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { taoDichVuMail } from '../mail/dich-vu';
import { themNhaCungCap } from '../mail/nha-cung-cap';
import { dangKy, xacNhan } from '../ban-tin/kho';
import { baiDayDu, dungAdmin, taoAnhGia, type PhienThu } from './thu-nghiem';

type Moi = Awaited<ReturnType<typeof dungAdmin>>;
let m: Moi;
let daGui: string[];
let mail: ReturnType<typeof taoDichVuMail>;
const KHOA = 'a'.repeat(64);

beforeEach(async () => {
  daGui = [];
  m = await dungAdmin({
    taoDeps: (db) => ({ mail: (mail = taoDichVuMail(db, { khoaBiMat: KHOA, now: () => m.dongHo.v, taoTransport: () => ({ sendMail: async (o) => void daGui.push(o.to) }) })) }),
  });
  themNhaCungCap(m.db, KHOA, { ten: 'g', host: 'smtp.g.test', cong: 465, baoMat: 'ssl', taiKhoan: 'u@g.test', matKhau: 'mk-rat-bi-mat-1', diaChiGui: 'b@g.test', gioiHanNgay: 500, duPhongQuanTrong: 30, thuTu: 0, laChinh: true, bat: true });
  taoAnhGia(m.anhDir, 'anh1');
});
const nguoi = (email: string, ngonNgu = 'vi') => xacNhan(m.db, dangKy(m.db, email, ngonNgu, m.dongHo.v).token!, m.dongHo.v);
const soBanTin = () => (m.db.prepare('SELECT count(*) AS n FROM ban_tin').get() as { n: number }).n;
const tao = async (over: object = {}) => (await m.chinh.gui('post', '/ban-tin', { tieuDe: 'Tin tháng 10', noiDung: 'Xin chào\n\nhttps://x.vn/bai', ngonNgu: 'vi', ...over })).body;

describe('soạn', () => {
  it('tạo, liệt kê, sửa khi còn nháp; kiểm tra độ dài; bản đã gửi không sửa được (409)', async () => {
    const bt = await tao();
    expect(bt).toMatchObject({ tieuDe: 'Tin tháng 10', trangThai: 'nhap', loai: 'tu-soan' });
    expect((await m.chinh.gui('post', '/ban-tin', { tieuDe: '', noiDung: 'x' })).status).toBe(400);
    expect((await m.chinh.gui('post', '/ban-tin', { tieuDe: 'x', noiDung: 'y'.repeat(20_001) })).status).toBe(400);
    expect((await m.chinh.gui('post', '/ban-tin', { tieuDe: 'x', noiDung: 'y', ngonNgu: '../x' })).status).toBe(400);
    expect((await m.chinh.gui('put', `/ban-tin/${bt.id}`, { tieuDe: 'Đổi', noiDung: 'Mới' })).body).toMatchObject({ tieuDe: 'Đổi', noiDung: 'Mới' });
    expect((await m.chinh.gui('get', '/ban-tin')).body.banTin).toHaveLength(1);
    await m.chinh.gui('post', `/ban-tin/${bt.id}/gui`);
    expect((await m.chinh.gui('put', `/ban-tin/${bt.id}`, { tieuDe: 'Muộn', noiDung: 'x' })).status).toBe(409);
    expect((await m.chinh.gui('put', '/ban-tin/9999', { tieuDe: 'x', noiDung: 'y' })).status).toBe(404);
  });

  it('nháp từ bài đã đăng: có tiêu đề, mô tả, ảnh bìa URL tuyệt đối, link bài; bài chưa đăng/không có → 404', async () => {
    const baiId = (await m.chinh.gui('post', '/bai', { bai: baiDayDu('bai-hay'), noiDung: 'x' })).body.id;
    expect((await m.chinh.gui('post', `/ban-tin/tu-bai/${baiId}`, { ngonNgu: 'vi' })).status).toBe(404); // còn nháp
    await m.chinh.gui('post', `/bai/${baiId}/dang`);
    const r = await m.chinh.gui('post', `/ban-tin/tu-bai/${baiId}`, { ngonNgu: 'vi' });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ tieuDe: 'Bài bai-hay', loai: 'bai-moi', baiId, trangThai: 'nhap' });
    expect(r.body.noiDung).toContain('a'.repeat(130));
    expect(r.body.noiDung).toContain('http://localhost:8090/anh/anh1/960.webp');
    expect(r.body.noiDung).toMatch(/http:\/\/localhost:8090\/\S*bai-hay/);
    expect((await m.chinh.gui('post', '/ban-tin/tu-bai/9999', { ngonNgu: 'vi' })).status).toBe(404);
  });
});

describe('gửi', () => {
  it('gửi thử: một mail cho chính người đang đăng nhập, tiêu đề có [Gửi thử]; không đụng tới người đăng ký', async () => {
    nguoi('doc@x.vn');
    const bt = await tao();
    expect((await m.chinh.gui('post', `/ban-tin/${bt.id}/gui-thu`)).body).toEqual({ ok: true, den: 'chu@x.vn' });
    await mail.xuLyHangDoi();
    expect(daGui).toEqual(['chu@x.vn']);
    expect(m.db.prepare("SELECT tieu_de FROM mail_hang_doi WHERE den = 'chu@x.vn'").get()).toEqual({ tieu_de: '[Gửi thử] Tin tháng 10' });
  });

  it('gửi: trả số người nhận; bấm lần hai không xếp trùng; tiến độ đếm đúng; xong → da-gui và 409 nếu bấm tiếp', async () => {
    for (const e of ['a@x.vn', 'b@x.vn', 'c@x.vn']) nguoi(e);
    nguoi('en@x.vn', 'en');
    const bt = await tao();
    expect((await m.chinh.gui('post', `/ban-tin/${bt.id}/gui`)).body).toEqual({ soNguoiNhan: 3, moiXep: 3 });
    expect((await m.chinh.gui('post', `/ban-tin/${bt.id}/gui`)).body).toEqual({ soNguoiNhan: 3, moiXep: 0 });
    expect((await m.chinh.gui('get', `/ban-tin/${bt.id}/tien-do`)).body).toMatchObject({ tong: 3, daGui: 0, dangCho: 3, loi: 0, trangThai: 'dang-gui' });
    await mail.xuLyHangDoi();
    expect((await m.chinh.gui('get', `/ban-tin/${bt.id}/tien-do`)).body).toMatchObject({ tong: 3, daGui: 3, dangCho: 0, trangThai: 'da-gui' });
    expect(daGui.sort()).toEqual(['a@x.vn', 'b@x.vn', 'c@x.vn']);
    expect((await m.chinh.gui('post', `/ban-tin/${bt.id}/gui`)).status).toBe(409);
    expect((await m.chinh.gui('get', '/ban-tin/9999/tien-do')).status).toBe(404);
  });
});

describe('người đăng ký', () => {
  it('danh sách lọc/tìm/phân trang, không trả token; xoá; tham số lạ → 400', async () => {
    nguoi('a@x.vn');
    nguoi('b@y.vn', 'en');
    dangKy(m.db, 'c@x.vn', 'vi', m.dongHo.v);
    const r = (await m.chinh.gui('get', '/nguoi-dang-ky')).body;
    expect(r.tong).toBe(3);
    expect(JSON.stringify(r)).not.toMatch(/token/);
    expect((await m.chinh.gui('get', '/nguoi-dang-ky?trangThai=da-xac-nhan&ngonNgu=vi')).body.nguoi.map((n: any) => n.email)).toEqual(['a@x.vn']);
    expect((await m.chinh.gui('get', '/nguoi-dang-ky?q=@y.vn')).body.tong).toBe(1);
    expect((await m.chinh.gui('get', '/nguoi-dang-ky?trangThai=linh-tinh')).status).toBe(400);
    const id = r.nguoi[0].id;
    expect((await m.chinh.gui('delete', `/nguoi-dang-ky/${id}`)).status).toBe(200);
    expect((await m.chinh.gui('delete', `/nguoi-dang-ky/${id}`)).status).toBe(404);
  });

  it('CSV: có dòng tiêu đề, chặn công thức Excel (=, +, -, @), tải về dạng file, ghi nhật ký; writer/quản lý → 403', async () => {
    nguoi('a@x.vn');
    nguoi('=HYPERLINK("http://e")@x.vn');
    const r = await m.chinh.gui('get', '/nguoi-dang-ky.csv');
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toMatch(/text\/csv/);
    expect(r.headers['content-disposition']).toContain('attachment');
    const dong = r.text.replace(/^﻿/, '').trim().split('\r\n');
    expect(dong[0]).toBe('"email","ngonNgu","trangThai","taoLuc","xacNhanLuc","huyLuc"');
    expect(dong).toHaveLength(3);
    expect(r.text).toContain(`"'=hyperlink(""http://e"")@x.vn"`);
    expect(m.db.prepare("SELECT count(*) AS n FROM nhat_ky WHERE loai = 'xuat-csv-nguoi-dang-ky'").get()).toEqual({ n: 1 });
    const w: PhienThu = await m.dangNhap('w@x.vn', 'W', 'writer');
    const ql: PhienThu = await m.dangNhap('ql@x.vn', 'QL', 'quan-ly');
    for (const p of [w, ql]) {
      expect((await p.gui('get', '/nguoi-dang-ky.csv')).status).toBe(403);
      expect((await p.gui('get', '/nguoi-dang-ky')).status).toBe(403);
      expect((await p.gui('post', '/ban-tin', { tieuDe: 'x', noiDung: 'y' })).status).toBe(403);
    }
    expect(soBanTin()).toBe(0);
    expect((await request(m.app).get('/api/admin/nguoi-dang-ky.csv')).status).toBe(401);
  });
});
