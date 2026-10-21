// API menu đầu trang / chân trang: GET trả menu hiện tại (hoặc rỗng), PUT kiểm tra schema rồi lưu.
import { loiMenu, menuSchema } from '@vntraveltips/schema';
import { yeuCauQuyen } from '../tai-khoan/quyen';
import { Router } from 'express';
import type { HangDoiBuild } from '../build/hang-doi';
import type { Db } from '../db/ket-noi';
import { ghiNhatKy } from '../tai-khoan/nhat-ky';
import { docCaiDat, ghiCaiDat } from '../noi-dung/cai-dat';

export function menuRouter(d: { db: Db; hangDoi: HangDoiBuild; now: () => number }): Router {
  const r = Router();
  r.get('/menu', (_req, res) => {
    res.json(docCaiDat(d.db, 'menu') ?? { dauTrang: [], chanTrang: [] });
  });
  r.put('/menu', yeuCauQuyen('cau-truc.sua'), (req, res) => {
    const kq = menuSchema.safeParse(req.body);
    if (!kq.success) return void res.status(400).json({ loi: 'Menu không hợp lệ', chiTiet: loiMenu(kq.error) });
    ghiCaiDat(d.db, 'menu', kq.data);
    ghiNhatKy(d.db, { nguoiDungId: req.nguoiDung!.id, loai: 'sua-menu', ip: req.ip }, d.now);
    d.hangDoi.yeuCau();
    res.json(kq.data);
  });
  return r;
}
