// API cài đặt site (GĐ3). Cài đặt mail đã có ở /mail, AI/bình luận/newsletter thêm ở các giai đoạn sau.
import { caiDatSiteSchema } from '@vntraveltips/schema';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Router } from 'express';
import type { Config } from '../config';
import type { HangDoiBuild } from '../build/hang-doi';
import type { Db } from '../db/ket-noi';
import { ghiCaiDat } from '../noi-dung/cai-dat';
import { docCaiDatSite } from '../noi-dung/cai-dat-site';
import { ghiNhatKy } from '../tai-khoan/nhat-ky';

export function caiDatRouter(d: { config: Config; db: Db; hangDoi: HangDoiBuild; now: () => number }): Router {
  const r = Router();
  r.get('/cai-dat/site', (_req, res) => {
    res.json(docCaiDatSite(d.db));
  });
  r.put('/cai-dat/site', (req, res) => {
    const kq = caiDatSiteSchema.safeParse(req.body);
    if (!kq.success) {
      return void res.status(400).json({ loi: 'Cài đặt không hợp lệ', chiTiet: kq.error.issues.map((i) => `${i.path.join('.') || '(gốc)'}: ${i.message}`) });
    }
    // Ảnh logo/favicon/chia sẻ phải có thật trên máy chủ (giống ảnh bìa bài viết).
    for (const [ten, a] of [['logo', kq.data.logo], ['favicon', kq.data.favicon], ['anhChiaSeMacDinh', kq.data.anhChiaSeMacDinh]] as const) {
      if (a && !existsSync(join(d.config.anhDir, a.ma, 'meta.json'))) return void res.status(400).json({ loi: 'Cài đặt không hợp lệ', chiTiet: [`${ten}.ma: ảnh "${a.ma}" không có trên máy chủ`] });
    }
    const truoc = docCaiDatSite(d.db);
    ghiCaiDat(d.db, 'site', kq.data);
    ghiNhatKy(d.db, { nguoiDungId: req.nguoiDung!.id, loai: 'sua-cai-dat-site', ip: req.ip, chiTiet: { doiLapChiMuc: truoc.choPhepLapChiMuc !== kq.data.choPhepLapChiMuc } }, d.now);
    d.hangDoi.yeuCau();
    res.json(kq.data);
  });
  return r;
}
