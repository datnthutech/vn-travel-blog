// API cài đặt site (GĐ3). Cài đặt mail đã có ở /mail, AI/bình luận/newsletter thêm ở các giai đoạn sau.
import { caiDatSiteSchema } from '@vntraveltips/schema';
import { Router } from 'express';
import type { HangDoiBuild } from '../build/hang-doi';
import type { Db } from '../db/ket-noi';
import { ghiCaiDat } from '../noi-dung/cai-dat';
import { docCaiDatSite } from '../noi-dung/cai-dat-site';
import { ghiNhatKy } from '../tai-khoan/nhat-ky';

export function caiDatRouter(d: { db: Db; hangDoi: HangDoiBuild; now: () => number }): Router {
  const r = Router();
  r.get('/cai-dat/site', (_req, res) => {
    res.json(docCaiDatSite(d.db));
  });
  r.put('/cai-dat/site', (req, res) => {
    const kq = caiDatSiteSchema.safeParse(req.body);
    if (!kq.success) {
      return void res.status(400).json({ loi: 'Cài đặt không hợp lệ', chiTiet: kq.error.issues.map((i) => `${i.path.join('.') || '(gốc)'}: ${i.message}`) });
    }
    const truoc = docCaiDatSite(d.db);
    ghiCaiDat(d.db, 'site', kq.data);
    ghiNhatKy(d.db, { nguoiDungId: req.nguoiDung!.id, loai: 'sua-cai-dat-site', ip: req.ip, chiTiet: { doiLapChiMuc: truoc.choPhepLapChiMuc !== kq.data.choPhepLapChiMuc } }, d.now);
    d.hangDoi.yeuCau();
    res.json(kq.data);
  });
  return r;
}
