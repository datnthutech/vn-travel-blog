// API trang tĩnh: danh sách, thêm, sửa (có kiểm tra phiên bản), tự lưu, đăng/gỡ, xoá, lịch sử.
import { yeuCauQuyen } from '../tai-khoan/quyen';
import { Router, type Request, type Response } from 'express';
import type { HangDoiBuild } from '../build/hang-doi';
import type { Db } from '../db/ket-noi';
import { gioVN } from '../mail/ngay-vn';
import { XungDotPhienBan } from '../noi-dung/bai';
import { datTrangThaiTrang, docTrang, lietKeTrang, suaTrang, themTrang, tuLuuTrang, xoaTrang } from '../noi-dung/trang';
import { ghiNhatKy } from '../tai-khoan/nhat-ky';
import { traLoiNghiepVu } from './chuyen-muc';

export function trangRouter(d: { db: Db; hangDoi: HangDoiBuild; now: () => number }): Router {
  const r = Router();
  const xong = (req: Request, loai: string, chiTiet: object) => {
    ghiNhatKy(d.db, { nguoiDungId: req.nguoiDung!.id, loai, ip: req.ip, chiTiet }, d.now);
    d.hangDoi.yeuCau();
  };
  const loi = (res: Response, e: unknown) => {
    if (e instanceof XungDotPhienBan) {
      return void res.status(409).json({ loi: `Trang đã được ${e.nguoiSua ?? 'một người khác'} sửa lúc ${gioVN(e.luc)}. Tải lại để xem bản mới.`, nguoiSua: e.nguoiSua, luc: e.luc });
    }
    traLoiNghiepVu(res, e);
  };
  const phienSo = (req: Request): number | undefined => {
    const v = (req.body as { phienSo?: unknown } | undefined)?.phienSo;
    return Number.isInteger(v) ? (v as number) : undefined;
  };
  const tenNguoi = (id: number | null) => (id === null ? null : ((d.db.prepare('SELECT id, ten FROM nguoi_dung WHERE id = ?').get(id) as { id: number; ten: string } | undefined) ?? null));

  r.get('/trang', (_req, res) => {
    res.json({ trang: lietKeTrang(d.db).map(({ noiDung: _n, nhapTuLuu: _t, ...con }) => ({ ...con, nguoiSuaCuoi: tenNguoi(con.nguoiSuaCuoiId) })) });
  });

  r.post('/trang', yeuCauQuyen('cau-truc.sua'), (req, res) => {
    try {
      const t = themTrang(d.db, req.body ?? {}, req.nguoiDung!.id, d.now);
      xong(req, 'them-trang', { slug: t.slug });
      res.status(201).json(t);
    } catch (e) {
      loi(res, e);
    }
  });

  r.get('/trang/:slug', (req, res) => {
    const t = docTrang(d.db, String(req.params.slug));
    if (!t) return void res.status(404).json({ loi: 'Không tìm thấy trang' });
    res.json({ ...t, nguoiSuaCuoi: tenNguoi(t.nguoiSuaCuoiId) });
  });

  r.put('/trang/:slug', yeuCauQuyen('cau-truc.sua'), (req, res) => {
    try {
      const t = suaTrang(d.db, String(req.params.slug), { ...(req.body ?? {}), phienSo: phienSo(req) }, req.nguoiDung!.id, d.now);
      xong(req, 'sua-trang', { tu: String(req.params.slug), den: t.slug });
      res.json(t);
    } catch (e) {
      loi(res, e);
    }
  });

  r.patch('/trang/:slug/tu-luu', yeuCauQuyen('cau-truc.sua'), (req, res) => {
    try {
      tuLuuTrang(d.db, String(req.params.slug), { ...(req.body ?? {}), phienSo: phienSo(req) }, d.now);
      res.json({ ok: true });
    } catch (e) {
      loi(res, e);
    }
  });

  for (const [duong, trangThai, loai] of [['dang', 'da-dang', 'dang-trang'], ['go', 'nhap', 'go-trang']] as const) {
    r.post(`/trang/:slug/${duong}`, yeuCauQuyen('cau-truc.sua'), (req, res) => {
      try {
        datTrangThaiTrang(d.db, String(req.params.slug), trangThai);
        xong(req, loai, { slug: String(req.params.slug) });
        res.json({ ok: true });
      } catch (e) {
        loi(res, e);
      }
    });
  }

  r.delete('/trang/:slug', yeuCauQuyen('cau-truc.sua'), (req, res) => {
    try {
      xoaTrang(d.db, String(req.params.slug));
      xong(req, 'xoa-trang', { slug: String(req.params.slug) });
      res.json({ ok: true });
    } catch (e) {
      loi(res, e);
    }
  });

  r.get('/trang/:slug/phien-ban', (req, res) => {
    if (!docTrang(d.db, String(req.params.slug))) return void res.status(404).json({ loi: 'Không tìm thấy trang' });
    const ds = d.db.prepare("SELECT id, luc, nguoi_dung_id FROM phien_ban WHERE trang_slug = ? ORDER BY luc DESC, id DESC").all(String(req.params.slug)) as { id: number; luc: number; nguoi_dung_id: number | null }[];
    res.json(ds.map((p) => ({ id: p.id, luc: p.luc, nguoiSua: tenNguoi(p.nguoi_dung_id) })));
  });

  return r;
}
