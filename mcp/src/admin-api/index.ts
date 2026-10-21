// Router của /api/admin/*: route công khai (đăng nhập) → bắt buộc đăng nhập + CSRF → route cần đăng nhập.
// Giai đoạn sau thêm router con (bài, ảnh, cấu trúc site…) vào nhóm "cần đăng nhập".
import { Router } from 'express';
import type { Config } from '../config';
import type { Db } from '../db/ket-noi';
import type { DichVuMail } from '../mail/dich-vu';
import { canTheoTrangThaiPhien, kiemCsrfGhi, yeuCauDangNhap } from '../tai-khoan/middleware';
import type { HangDoiBuild } from '../build/hang-doi';
import { baiRouter } from './bai';
import { haiLopRouter } from './hai-lop';
import { heThongRouter } from './he-thong';
import { mailRouter } from './mail';
import { laHttps, xacThucCongKhai, xacThucDaDangNhap, type DepsXacThuc } from './xac-thuc';

export interface DepsAdminApi {
  config: Config;
  db: Db;
  now?: () => number;
  cho?: (ms: number) => Promise<void>;
  mail: DichVuMail;
  hangDoi: HangDoiBuild;
}

export function adminApiRouter(deps: DepsAdminApi): Router {
  const d: DepsXacThuc = {
    config: deps.config,
    db: deps.db,
    now: deps.now ?? Date.now,
    cho: deps.cho ?? ((ms) => new Promise((xong) => setTimeout(xong, ms))),
    mail: deps.mail,
  };
  const r = Router();
  r.use(xacThucCongKhai(d));
  r.use(yeuCauDangNhap({ db: d.db, now: d.now, khoaBiMat: d.config.khoaBiMat, secure: laHttps(d.config) }));
  r.use(kiemCsrfGhi(d.config.khoaBiMat));
  r.use(canTheoTrangThaiPhien());
  r.use(xacThucDaDangNhap(d));
  r.use(haiLopRouter(d));
  r.use(baiRouter({ config: d.config, db: d.db, now: d.now, hangDoi: deps.hangDoi }));
  r.use(heThongRouter({ db: d.db, hangDoi: deps.hangDoi }));
  r.use(mailRouter({ db: d.db, khoaBiMat: d.config.khoaBiMat, mail: deps.mail, now: d.now }));
  r.use((_req, res) => {
    res.status(404).json({ loi: 'Không tìm thấy' });
  });
  return r;
}
