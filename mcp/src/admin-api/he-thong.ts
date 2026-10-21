// API trạng thái hệ thống cho bảng tổng quan: build gần nhất/đang chờ, lần sao lưu gần nhất.
import { Router } from 'express';
import type { HangDoiBuild } from '../build/hang-doi';
import type { Db } from '../db/ket-noi';

export function heThongRouter(d: { db: Db; hangDoi: HangDoiBuild }): Router {
  const r = Router();
  r.get('/build', (_req, res) => {
    const s = d.db.prepare("SELECT gia_tri FROM he_thong WHERE khoa = 'sao_luu_cuoi_luc'").get() as { gia_tri: string } | undefined;
    res.json({ ...d.hangDoi.trangThai(), saoLuuCuoiLuc: s ? Number(s.gia_tri) : null });
  });
  return r;
}
