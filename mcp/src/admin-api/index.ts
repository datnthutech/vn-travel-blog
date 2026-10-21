// Router của /api/admin/*: route công khai (đăng nhập) → bắt buộc đăng nhập + CSRF → route cần đăng nhập.
// Giai đoạn sau thêm router con (bài, ảnh, cấu trúc site…) vào nhóm "cần đăng nhập".
import { Router } from 'express';
import type { Config } from '../config';
import type { Db } from '../db/ket-noi';
import { kiemCsrfGhi, yeuCauDangNhap } from '../tai-khoan/middleware';
import { laHttps, xacThucCongKhai, xacThucDaDangNhap, type DepsXacThuc } from './xac-thuc';

export interface DepsAdminApi {
  config: Config;
  db: Db;
  now?: () => number;
  cho?: (ms: number) => Promise<void>;
}

export function adminApiRouter(deps: DepsAdminApi): Router {
  const d: DepsXacThuc = {
    config: deps.config,
    db: deps.db,
    now: deps.now ?? Date.now,
    cho: deps.cho ?? ((ms) => new Promise((xong) => setTimeout(xong, ms))),
  };
  const r = Router();
  r.use(xacThucCongKhai(d));
  r.use(yeuCauDangNhap({ db: d.db, now: d.now, khoaBiMat: d.config.khoaBiMat, secure: laHttps(d.config) }));
  r.use(kiemCsrfGhi(d.config.khoaBiMat));
  r.use(xacThucDaDangNhap(d));
  r.use((_req, res) => {
    res.status(404).json({ loi: 'Không tìm thấy' });
  });
  return r;
}
