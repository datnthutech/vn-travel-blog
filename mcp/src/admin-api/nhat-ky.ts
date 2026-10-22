// Xem nhật ký thao tác (đăng nhập, đổi vai trò, khoá, mời, đăng/xoá bài…) — chỉ người có quyền `nhat-ky.xem` (quản trị).
import { Router } from 'express';
import type { Db } from '../db/ket-noi';
import { gioVNSangEpoch } from '../noi-dung/hen-gio';
import { yeuCauQuyen } from '../tai-khoan/quyen';

const MOI_TRANG = 50;
const NGAY = 86_400_000;

// `tu`/`den`: epoch mili giây hoặc ngày YYYY-MM-DD theo GIỜ VIỆT NAM (`den` tính hết ngày đó).
function docThoiGian(v: unknown, cuoiNgay: boolean): number | null | 'sai' {
  if (v === undefined || v === '') return null;
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    try {
      return gioVNSangEpoch(`${s}T00:00`) + (cuoiNgay ? NGAY - 1 : 0);
    } catch {
      return 'sai';
    }
  }
  return /^\d+$/.test(s) ? Number(s) : 'sai';
}

export function nhatKyRouter(d: { db: Db }): Router {
  const r = Router();
  r.get('/nhat-ky', yeuCauQuyen('nhat-ky.xem'), (req, res) => {
    const tu = docThoiGian(req.query.tu, false);
    const den = docThoiGian(req.query.den, true);
    if (tu === 'sai' || den === 'sai') return void res.status(400).json({ loi: 'tu/den phải là ngày YYYY-MM-DD (giờ Việt Nam) hoặc epoch mili giây' });
    const nguoi = String(req.query.nguoiDungId ?? '');
    if (nguoi && !/^\d+$/.test(nguoi)) return void res.status(400).json({ loi: 'nguoiDungId phải là số' });
    const dk: string[] = [];
    const tham: unknown[] = [];
    if (typeof req.query.loai === 'string' && req.query.loai) (dk.push('n.loai = ?'), tham.push(req.query.loai));
    if (nguoi) (dk.push('n.nguoi_dung_id = ?'), tham.push(Number(nguoi)));
    if (tu !== null) (dk.push('n.luc >= ?'), tham.push(tu));
    if (den !== null) (dk.push('n.luc <= ?'), tham.push(den));
    const where = dk.length ? `WHERE ${dk.join(' AND ')}` : '';
    const trang = Math.max(1, Number.parseInt(String(req.query.trang ?? '1'), 10) || 1);
    const tong = (d.db.prepare(`SELECT count(*) AS n FROM nhat_ky n ${where}`).get(...tham) as { n: number }).n;
    const dong = d.db
      .prepare(`SELECT n.id, n.luc, n.nguoi_dung_id, u.ten, n.loai, n.ip, n.chi_tiet FROM nhat_ky n LEFT JOIN nguoi_dung u ON u.id = n.nguoi_dung_id ${where} ORDER BY n.id DESC LIMIT ? OFFSET ?`)
      .all(...tham, MOI_TRANG, (trang - 1) * MOI_TRANG) as { id: number; luc: number; nguoi_dung_id: number | null; ten: string | null; loai: string; ip: string | null; chi_tiet: string | null }[];
    res.json({
      trang,
      tong,
      dong: dong.map((x) => ({ id: x.id, luc: x.luc, nguoiDung: x.nguoi_dung_id === null ? null : { id: x.nguoi_dung_id, ten: x.ten }, loai: x.loai, ip: x.ip, chiTiet: x.chi_tiet ? JSON.parse(x.chi_tiet) : null })),
    });
  });
  return r;
}
