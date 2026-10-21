// API cấu hình mail của trang quản trị: nhà cung cấp SMTP, gửi thử, thống kê, nhật ký.
// Mật khẩu SMTP chỉ GHI; đọc ra chỉ có `daDatMatKhau: boolean`. (GĐ4 giới hạn cho vai trò quản trị.)
import { Router } from 'express';
import type { Db } from '../db/ket-noi';
import type { DichVuMail } from '../mail/dich-vu';
import { lietKeNhaCungCapCongKhai, MAU_NHA_CUNG_CAP, nhaCungCapSchema, suaNhaCungCap, themNhaCungCap, xoaNhaCungCap } from '../mail/nha-cung-cap';
import { ghiNhatKy } from '../tai-khoan/nhat-ky';

const TRANG = 50;

export function mailRouter(d: { db: Db; khoaBiMat: string; mail: DichVuMail; now: () => number }): Router {
  const r = Router();
  const idTuUrl = (v: string) => (/^\d+$/.test(v) ? Number(v) : NaN);

  r.get('/mail/mau', (_req, res) => {
    res.json({ mau: MAU_NHA_CUNG_CAP });
  });

  r.get('/mail/nha-cung-cap', (_req, res) => {
    res.json({ nhaCungCap: lietKeNhaCungCapCongKhai(d.db) });
  });

  r.post('/mail/nha-cung-cap', (req, res) => {
    const kq = nhaCungCapSchema.safeParse(req.body);
    if (!kq.success) {
      res.status(400).json({ loi: 'Dữ liệu nhà cung cấp mail không hợp lệ', chiTiet: kq.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) });
      return;
    }
    const id = themNhaCungCap(d.db, d.khoaBiMat, kq.data);
    ghiNhatKy(d.db, { nguoiDungId: req.nguoiDung!.id, loai: 'mail-them-nha-cung-cap', ip: req.ip, chiTiet: { id, ten: kq.data.ten } }, d.now);
    res.status(201).json({ id });
  });

  r.put('/mail/nha-cung-cap/:id', (req, res) => {
    const id = idTuUrl(req.params.id);
    const kq = nhaCungCapSchema.partial().safeParse(req.body);
    if (!kq.success) {
      res.status(400).json({ loi: 'Dữ liệu nhà cung cấp mail không hợp lệ', chiTiet: kq.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) });
      return;
    }
    if (!suaNhaCungCap(d.db, d.khoaBiMat, id, kq.data)) {
      res.status(404).json({ loi: 'Không tìm thấy nhà cung cấp mail' });
      return;
    }
    ghiNhatKy(d.db, { nguoiDungId: req.nguoiDung!.id, loai: 'mail-sua-nha-cung-cap', ip: req.ip, chiTiet: { id } }, d.now);
    res.json({ ok: true });
  });

  r.delete('/mail/nha-cung-cap/:id', (req, res) => {
    const id = idTuUrl(req.params.id);
    if (!xoaNhaCungCap(d.db, id)) {
      res.status(404).json({ loi: 'Không tìm thấy nhà cung cấp mail' });
      return;
    }
    ghiNhatKy(d.db, { nguoiDungId: req.nguoiDung!.id, loai: 'mail-xoa-nha-cung-cap', ip: req.ip, chiTiet: { id } }, d.now);
    res.json({ ok: true });
  });

  r.post('/mail/nha-cung-cap/:id/gui-thu', async (req, res) => {
    const den = (req.body as { den?: unknown } | undefined)?.den;
    if (typeof den !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(den)) {
      res.status(400).json({ loi: 'Cần nhập địa chỉ email nhận thư thử' });
      return;
    }
    try {
      await d.mail.guiThu(idTuUrl(req.params.id), den);
      res.json({ ok: true });
    } catch (e) {
      const loi = (e as Error).message;
      res.status(loi.startsWith('Không tìm thấy') ? 404 : 503).json({ loi: loi.startsWith('Không tìm thấy') ? loi : `Gửi thử thất bại: ${loi}` });
    }
  });

  r.get('/mail/thong-ke', (_req, res) => {
    res.json({ homNay: d.mail.thongKeHomNay() });
  });

  r.get('/mail/nhat-ky', (req, res) => {
    const trang = Math.max(1, Number.parseInt(String(req.query.trang ?? '1'), 10) || 1);
    const dong = d.db.prepare('SELECT id, luc, mail_id AS mailId, nha_cung_cap_id AS nhaCungCapId, den, loai, ket_qua AS ketQua, loi FROM mail_nhat_ky ORDER BY id DESC LIMIT ? OFFSET ?').all(TRANG, (trang - 1) * TRANG);
    const tong = (d.db.prepare('SELECT count(*) AS n FROM mail_nhat_ky').get() as { n: number }).n;
    res.json({ trang, tong, dong });
  });

  return r;
}
