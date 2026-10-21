// Router của /api/admin/*: route công khai (đăng nhập) → bắt buộc đăng nhập + CSRF → route cần đăng nhập.
// Giai đoạn sau thêm router con (bài, ảnh, cấu trúc site…) vào nhóm "cần đăng nhập".
import { Router } from 'express';
import type { Config } from '../config';
import type { Db } from '../db/ket-noi';
import type { DichVuMail } from '../mail/dich-vu';
import { canTheoTrangThaiPhien, kiemCsrfGhi, yeuCauDangNhap } from '../tai-khoan/middleware';
import type { HangDoiBuild } from '../build/hang-doi';
import { anhRouter } from './anh';
import { baiRouter } from './bai';
import { chuyenMucRouter } from './chuyen-muc';
import { tinhRouter } from './tinh-tag';
import { menuRouter } from './menu';
import { caiDatRouter } from './cai-dat';
import { trangRouter } from './trang';
import { redirectRouter } from './redirect';
import { tongQuanRouter } from './tong-quan';
import { binhLuanRouter } from './binh-luan';
import { banTinRouter } from './ban-tin';
import { nhatKyRouter } from './nhat-ky';
import { loiMoiCongKhaiRouter, taiKhoanRouter } from './tai-khoan';
import { haiLopRouter } from './hai-lop';
import { buildRouter } from './build';
import { mailRouter } from './mail';
import { laHttps, xacThucCongKhai, xacThucDaDangNhap, type DepsXacThuc } from './xac-thuc';

export interface DepsAdminApi {
  config: Config;
  db: Db;
  now?: () => number;
  cho?: (ms: number) => Promise<void>;
  mail: DichVuMail;
  hangDoi: HangDoiBuild;
  conDungLuong?: (anhDir: string) => Promise<boolean>;
  toiDaByte?: number;
  toiDaFile?: number;
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
  r.use(loiMoiCongKhaiRouter({ config: d.config, db: d.db, mail: deps.mail, now: d.now }));
  r.use(yeuCauDangNhap({ db: d.db, now: d.now, khoaBiMat: d.config.khoaBiMat, secure: laHttps(d.config) }));
  r.use(kiemCsrfGhi(d.config.khoaBiMat));
  r.use(canTheoTrangThaiPhien());
  r.use(xacThucDaDangNhap(d));
  r.use(haiLopRouter(d));
  r.use(baiRouter({ config: d.config, db: d.db, now: d.now, hangDoi: deps.hangDoi }));
  r.use(taiKhoanRouter({ config: d.config, db: d.db, mail: deps.mail, now: d.now }));
  r.use(binhLuanRouter({ config: d.config, db: d.db, mail: deps.mail, hangDoi: deps.hangDoi, now: d.now }));
  r.use(banTinRouter({ config: d.config, db: d.db, mail: deps.mail, now: d.now }));
  r.use(nhatKyRouter({ db: d.db }));
  r.use(redirectRouter({ db: d.db, hangDoi: deps.hangDoi, now: d.now }));
  r.use(tongQuanRouter({ config: d.config, db: d.db, hangDoi: deps.hangDoi, mail: deps.mail, now: d.now }));
  r.use(trangRouter({ db: d.db, hangDoi: deps.hangDoi, now: d.now }));
  r.use(caiDatRouter({ config: d.config, db: d.db, hangDoi: deps.hangDoi, now: d.now }));
  r.use(menuRouter({ db: d.db, hangDoi: deps.hangDoi, now: d.now }));
  r.use(tinhRouter({ db: d.db, hangDoi: deps.hangDoi, now: d.now }));
  r.use(chuyenMucRouter({ db: d.db, hangDoi: deps.hangDoi, now: d.now }));
  r.use(anhRouter({ config: d.config, db: d.db, now: d.now, conDungLuong: deps.conDungLuong, toiDaByte: deps.toiDaByte, toiDaFile: deps.toiDaFile }));
  r.use(buildRouter({ config: d.config, db: d.db, hangDoi: deps.hangDoi }));
  r.use(mailRouter({ db: d.db, khoaBiMat: d.config.khoaBiMat, mail: deps.mail, now: d.now }));
  r.use((_req, res) => {
    res.status(404).json({ loi: 'Không tìm thấy' });
  });
  return r;
}
