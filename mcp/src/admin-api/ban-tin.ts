// Quản trị bản tin (quyền `ban-tin.gui`, chỉ quản trị): soạn, gửi thử cho chính mình, gửi bằng tay, xem tiến độ; danh sách người đăng ký, CSV, xoá.
import { Router, type Request } from 'express';
import type { Config } from '../config';
import type { Db } from '../db/ket-noi';
import type { DichVuMail } from '../mail/dich-vu';
import { docBanTin, lietKeBanTin, linkHuy, nhapTuBai, tienDo, xepHangGui } from '../ban-tin/gui';
import { lietKe, xoaNguoiDangKy } from '../ban-tin/kho';
import { docChuoiBanTin } from '../ban-tin/chuoi';
import { mauMailBanTin } from '../ban-tin/mau-mail';
import { ghiNhatKy } from '../tai-khoan/nhat-ky';
import { yeuCauQuyen } from '../tai-khoan/quyen';

const NGON_NGU = /^[a-z]{2}(-[A-Za-z]{2,4})?$/;
const TRANG_THAI_DK = ['cho-xac-nhan', 'da-xac-nhan', 'da-huy'];

/** Ô CSV an toàn: bọc nháy kép; ô bắt đầu bằng = + - @ (Excel hiểu là công thức) thêm dấu ' phía trước. */
const oCsv = (v: string | number | null): string => {
  let s = v === null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};

export function banTinRouter(d: { config: Config; db: Db; mail: DichVuMail; now: () => number }): Router {
  const r = Router();
  const q = yeuCauQuyen('ban-tin.gui');
  const idTuUrl = (req: Request) => (/^\d+$/.test(String(req.params.id)) ? Number(req.params.id) : NaN);
  const nhatKy = (req: Request, loai: string, chiTiet: object) => ghiNhatKy(d.db, { nguoiDungId: req.nguoiDung!.id, loai, ip: req.ip, chiTiet }, d.now);
  const doc = (req: Request) => docBanTin(d.db, idTuUrl(req));

  const kiemNoiDung = (b: Record<string, unknown>): { tieuDe: string; noiDung: string; ngonNgu: string } | string => {
    const tieuDe = typeof b.tieuDe === 'string' ? b.tieuDe.trim() : '';
    const noiDung = typeof b.noiDung === 'string' ? b.noiDung.trim() : '';
    const ngonNgu = typeof b.ngonNgu === 'string' ? b.ngonNgu : 'vi';
    if (tieuDe.length < 1 || tieuDe.length > 150) return 'Tiêu đề cần từ 1 đến 150 ký tự';
    if (noiDung.length < 1 || noiDung.length > 20_000) return 'Nội dung cần từ 1 đến 20.000 ký tự';
    if (!NGON_NGU.test(ngonNgu)) return 'Ngôn ngữ không hợp lệ';
    return { tieuDe, noiDung, ngonNgu };
  };

  r.get('/ban-tin', q, (_req, res) => {
    const ds = lietKeBanTin(d.db).map((b) => ({ ...b, ...(b.trangThai === 'nhap' ? {} : { tienDo: tienDo(d.db, b.id) }) }));
    res.json({ banTin: ds });
  });

  r.post('/ban-tin', q, (req, res) => {
    const v = kiemNoiDung((req.body ?? {}) as Record<string, unknown>);
    if (typeof v === 'string') return void res.status(400).json({ loi: v });
    const id = Number(d.db.prepare("INSERT INTO ban_tin (tieu_de, noi_dung, ngon_ngu, loai, trang_thai, tao_luc) VALUES (?,?,?,'tu-soan','nhap',?)").run(v.tieuDe, v.noiDung, v.ngonNgu, d.now()).lastInsertRowid);
    res.status(201).json(docBanTin(d.db, id));
  });

  r.post('/ban-tin/tu-bai/:baiId', q, (req, res) => {
    const baiId = /^\d+$/.test(String(req.params.baiId)) ? Number(req.params.baiId) : NaN;
    const ngonNgu = typeof req.body?.ngonNgu === 'string' ? req.body.ngonNgu : 'vi';
    if (Number.isNaN(baiId) || !NGON_NGU.test(ngonNgu)) return void res.status(400).json({ loi: 'Bài hoặc ngôn ngữ không hợp lệ' });
    const bt = nhapTuBai(d.db, baiId, ngonNgu, d.config.publicBaseUrl, d.now);
    if (!bt) return void res.status(404).json({ loi: 'Chỉ tạo thông báo cho bài đã đăng' });
    res.status(201).json(bt);
  });

  r.put('/ban-tin/:id', q, (req, res) => {
    const bt = doc(req);
    if (!bt) return void res.status(404).json({ loi: 'Không tìm thấy bản tin' });
    if (bt.trangThai !== 'nhap') return void res.status(409).json({ loi: 'Bản tin đã gửi, không sửa được nữa' });
    const v = kiemNoiDung((req.body ?? {}) as Record<string, unknown>);
    if (typeof v === 'string') return void res.status(400).json({ loi: v });
    d.db.prepare('UPDATE ban_tin SET tieu_de = ?, noi_dung = ?, ngon_ngu = ? WHERE id = ?').run(v.tieuDe, v.noiDung, v.ngonNgu, bt.id);
    res.json(docBanTin(d.db, bt.id));
  });

  // Gửi thử: một mail `thuong` cho CHÍNH người đang đăng nhập (link huỷ trong thư thử không có tác dụng).
  r.post('/ban-tin/:id/gui-thu', q, (req, res) => {
    const bt = doc(req);
    if (!bt) return void res.status(404).json({ loi: 'Không tìm thấy bản tin' });
    const m = mauMailBanTin({ banTin: { ...bt, tieuDe: `[Gửi thử] ${bt.tieuDe}` }, linkHuy: linkHuy(d.config.publicBaseUrl, 'gui-thu'), chuoi: docChuoiBanTin(d.db, bt.ngonNgu) });
    d.mail.gui({ loai: 'thuong', den: req.nguoiDung!.email, tieuDe: m.tieuDe, html: m.html, text: m.text, headers: m.headers, nhayCam: true });
    res.json({ ok: true, den: req.nguoiDung!.email });
  });

  r.post('/ban-tin/:id/gui', q, (req, res) => {
    const bt = doc(req);
    if (!bt) return void res.status(404).json({ loi: 'Không tìm thấy bản tin' });
    if (bt.trangThai === 'da-gui') return void res.status(409).json({ loi: 'Bản tin này đã gửi xong' });
    const kq = xepHangGui(d.db, d.mail, { banTinId: bt.id, publicBaseUrl: d.config.publicBaseUrl, nguoiGuiId: req.nguoiDung!.id, now: d.now });
    if (kq.soNguoiNhan === 0) return void res.status(400).json({ loi: 'Chưa có người đăng ký đã xác nhận nào cùng ngôn ngữ với bản tin này' });
    nhatKy(req, 'ban-tin-gui', { banTinId: bt.id, soNguoiNhan: kq.soNguoiNhan, moiXep: kq.moiXep });
    res.json({ soNguoiNhan: kq.soNguoiNhan, moiXep: kq.moiXep });
  });

  r.get('/ban-tin/:id/tien-do', q, (req, res) => {
    const bt = doc(req);
    if (!bt) return void res.status(404).json({ loi: 'Không tìm thấy bản tin' });
    const td = tienDo(d.db, bt.id);
    res.json({ ...td, trangThai: docBanTin(d.db, bt.id)!.trangThai });
  });

  r.get('/nguoi-dang-ky', q, (req, res) => {
    const tt = String(req.query.trangThai ?? '');
    if (tt && !TRANG_THAI_DK.includes(tt)) return void res.status(400).json({ loi: 'trangThai không hợp lệ' });
    const nn = String(req.query.ngonNgu ?? '');
    if (nn && !NGON_NGU.test(nn)) return void res.status(400).json({ loi: 'ngonNgu không hợp lệ' });
    const trang = Math.max(1, Number.parseInt(String(req.query.trang ?? '1'), 10) || 1);
    res.json({ ...lietKe(d.db, { trangThai: tt || undefined, ngonNgu: nn || undefined, q: String(req.query.q ?? '').slice(0, 100) || undefined, trang, moiTrang: 50 }), trang });
  });

  r.get('/nguoi-dang-ky.csv', q, (req, res) => {
    const { nguoi } = lietKe(d.db, { moiTrang: 1_000_000 });
    const iso = (t: number | null) => (t === null ? '' : new Date(t).toISOString());
    const dong = nguoi.map((n) => [n.email, n.ngonNgu, n.trangThai, iso(n.taoLuc), iso(n.xacNhanLuc), iso(n.huyLuc)].map(oCsv).join(','));
    nhatKy(req, 'xuat-csv-nguoi-dang-ky', { soDong: nguoi.length });
    res
      .set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="nguoi-dang-ky.csv"', 'Cache-Control': 'no-store' })
      .send(`﻿${['email', 'ngonNgu', 'trangThai', 'taoLuc', 'xacNhanLuc', 'huyLuc'].map(oCsv).join(',')}\r\n${dong.join('\r\n')}${dong.length ? '\r\n' : ''}`);
  });

  r.delete('/nguoi-dang-ky/:id', q, (req, res) => {
    const id = idTuUrl(req);
    if (Number.isNaN(id) || !xoaNguoiDangKy(d.db, id)) return void res.status(404).json({ loi: 'Không tìm thấy người đăng ký' });
    nhatKy(req, 'xoa-nguoi-dang-ky', { id });
    res.json({ ok: true });
  });

  return r;
}
