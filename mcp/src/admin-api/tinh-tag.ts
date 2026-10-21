// API tỉnh và tag.
import { Router } from 'express';
import type { HangDoiBuild } from '../build/hang-doi';
import type { Db } from '../db/ket-noi';
import { doiTenTag, lietKeTag, tagKhongDung } from '../noi-dung/tag';
import { demBaiTheoTinh, lietKeTinh, suaTinh, themTinh, xoaTinh } from '../noi-dung/tinh';
import { ghiNhatKy } from '../tai-khoan/nhat-ky';
import { traLoiNghiepVu } from './chuyen-muc';

export function tinhRouter(d: { db: Db; hangDoi: HangDoiBuild; now: () => number }): Router {
  const r = Router();
  const xong = (req: import('express').Request, loai: string, chiTiet: object) => {
    ghiNhatKy(d.db, { nguoiDungId: req.nguoiDung!.id, loai, ip: req.ip, chiTiet }, d.now);
    d.hangDoi.yeuCau();
  };

  r.get('/tinh', (_req, res) => {
    const dem = demBaiTheoTinh(d.db);
    res.json({ tinh: lietKeTinh(d.db).map((t) => ({ ...t, soBai: dem.get(t.slug) ?? 0 })) });
  });
  r.post('/tinh', (req, res) => {
    try {
      const t = themTinh(d.db, req.body ?? {});
      xong(req, 'them-tinh', { slug: t.slug });
      res.status(201).json(t);
    } catch (e) {
      traLoiNghiepVu(res, e);
    }
  });
  r.put('/tinh/:slug', (req, res) => {
    try {
      const t = suaTinh(d.db, req.params.slug, req.body ?? {});
      xong(req, 'sua-tinh', { tu: req.params.slug, den: t.slug });
      res.json(t);
    } catch (e) {
      traLoiNghiepVu(res, e);
    }
  });
  r.delete('/tinh/:slug', (req, res) => {
    try {
      const cs = typeof req.query.chuyenSang === 'string' ? req.query.chuyenSang : undefined; // '' = bỏ tỉnh
      const kq = xoaTinh(d.db, req.params.slug, cs);
      xong(req, 'xoa-tinh', { slug: req.params.slug, ...kq });
      res.json({ ok: true, ...kq });
    } catch (e) {
      traLoiNghiepVu(res, e);
    }
  });

  r.get('/tag', (_req, res) => {
    res.json({ tag: lietKeTag(d.db) });
  });
  r.get('/tag/khong-dung', (_req, res) => {
    res.json({ tag: tagKhongDung(d.db) });
  });
  r.post('/tag/doi-ten', (req, res) => {
    try {
      const b = (req.body ?? {}) as { tu?: unknown; den?: unknown };
      const kq = doiTenTag(d.db, b.tu, b.den);
      if (kq.daDoi > 0) xong(req, 'doi-ten-tag', { tu: b.tu, den: b.den, ...kq });
      res.json({ ok: true, ...kq });
    } catch (e) {
      traLoiNghiepVu(res, e);
    }
  });

  return r;
}
