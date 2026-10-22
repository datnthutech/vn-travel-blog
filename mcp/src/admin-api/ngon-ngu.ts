// Quản lý ngôn ngữ (GĐ7): mọi người dùng đọc được (cần cho trình soạn bài), chỉ quyền `cai-dat.sua` thêm/sửa/tắt.
import { Router } from 'express';
import type { HangDoiBuild } from '../build/hang-doi';
import type { Db } from '../db/ket-noi';
import { ghiNhatKy } from '../tai-khoan/nhat-ky';
import { yeuCauQuyen } from '../tai-khoan/quyen';
import { traLoiNghiepVu } from './chuyen-muc';
import { lietKeNgonNgu, suaNgonNgu, themNgonNgu } from '../noi-dung/ngon-ngu';

export function ngonNguRouter(d: { db: Db; hangDoi: HangDoiBuild; now: () => number }): Router {
  const r = Router();
  r.get('/ngon-ngu', (_req, res) => void res.json({ ngonNgu: lietKeNgonNgu(d.db) }));
  r.post('/ngon-ngu', yeuCauQuyen('cai-dat.sua'), (req, res) => {
    try {
      const n = themNgonNgu(d.db, (req.body ?? {}) as Record<string, unknown>);
      ghiNhatKy(d.db, { nguoiDungId: req.nguoiDung!.id, loai: 'them-ngon-ngu', ip: req.ip, chiTiet: { ma: n.ma } }, d.now);
      d.hangDoi.yeuCau();
      res.status(201).json(n);
    } catch (e) {
      traLoiNghiepVu(res, e);
    }
  });
  r.put('/ngon-ngu/:ma', yeuCauQuyen('cai-dat.sua'), (req, res) => {
    try {
      const n = suaNgonNgu(d.db, String(req.params.ma), (req.body ?? {}) as Record<string, unknown>);
      ghiNhatKy(d.db, { nguoiDungId: req.nguoiDung!.id, loai: 'sua-ngon-ngu', ip: req.ip, chiTiet: { ma: n.ma, bat: n.bat } }, d.now);
      d.hangDoi.yeuCau();
      res.json(n);
    } catch (e) {
      traLoiNghiepVu(res, e);
    }
  });
  return r;
}
