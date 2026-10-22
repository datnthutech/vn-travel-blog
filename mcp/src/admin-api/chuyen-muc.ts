// API chuyên mục: danh sách (kèm số bài), thêm, sửa/đổi slug, xoá (chuyển bài sang chuyên mục khác), đổi thứ tự.
import { yeuCauQuyen } from '../tai-khoan/quyen';
import { Router, type Response } from 'express';
import type { HangDoiBuild } from '../build/hang-doi';
import type { Db } from '../db/ket-noi';
import { demBaiTheoChuyenMuc, doiThuTuChuyenMuc, lietKeChuyenMuc, LoiNghiepVu, suaChuyenMuc, themChuyenMuc, xoaChuyenMuc } from '../noi-dung/chuyen-muc';
import { ghiNhatKy } from '../tai-khoan/nhat-ky';

export function traLoiNghiepVu(res: Response, e: unknown): void {
  if (e instanceof LoiNghiepVu) res.status(e.status).json({ loi: e.message, ...e.du });
  else throw e;
}

export function chuyenMucRouter(d: { db: Db; hangDoi: HangDoiBuild; now: () => number }): Router {
  const r = Router();
  const xong = (req: import('express').Request, loai: string, chiTiet: object) => {
    ghiNhatKy(d.db, { nguoiDungId: req.nguoiDung!.id, loai, ip: req.ip, chiTiet }, d.now);
    d.hangDoi.yeuCau();
  };

  r.get('/chuyen-muc', (_req, res) => {
    const dem = demBaiTheoChuyenMuc(d.db);
    res.json({ chuyenMuc: lietKeChuyenMuc(d.db).map((c) => ({ ...c, soBai: dem.get(c.slug) ?? 0 })) });
  });

  r.post('/chuyen-muc', yeuCauQuyen('cau-truc.sua'), (req, res) => {
    try {
      const c = themChuyenMuc(d.db, req.body ?? {});
      xong(req, 'them-chuyen-muc', { slug: c.slug });
      res.status(201).json(c);
    } catch (e) {
      traLoiNghiepVu(res, e);
    }
  });

  // Đặt TRƯỚC '/:slug' để "thu-tu" không bị coi là một slug.
  r.put('/chuyen-muc/thu-tu', yeuCauQuyen('cau-truc.sua'), (req, res) => {
    const slugs = (req.body as { slugs?: unknown } | undefined)?.slugs;
    if (!Array.isArray(slugs) || slugs.some((s) => typeof s !== 'string')) return void res.status(400).json({ loi: 'Cần gửi slugs: mảng chuỗi' });
    try {
      doiThuTuChuyenMuc(d.db, slugs as string[]);
      xong(req, 'doi-thu-tu-chuyen-muc', {});
      res.json({ ok: true });
    } catch (e) {
      traLoiNghiepVu(res, e);
    }
  });

  r.put('/chuyen-muc/:slug', yeuCauQuyen('cau-truc.sua'), (req, res) => {
    try {
      const c = suaChuyenMuc(d.db, String(req.params.slug), req.body ?? {});
      xong(req, 'sua-chuyen-muc', { tu: String(req.params.slug), den: c.slug });
      res.json(c);
    } catch (e) {
      traLoiNghiepVu(res, e);
    }
  });

  r.delete('/chuyen-muc/:slug', yeuCauQuyen('cau-truc.sua'), (req, res) => {
    try {
      const kq = xoaChuyenMuc(d.db, String(req.params.slug), typeof req.query.chuyenSang === 'string' && req.query.chuyenSang ? req.query.chuyenSang : undefined);
      xong(req, 'xoa-chuyen-muc', { slug: String(req.params.slug), ...kq });
      res.json({ ok: true, ...kq });
    } catch (e) {
      traLoiNghiepVu(res, e);
    }
  });

  return r;
}
