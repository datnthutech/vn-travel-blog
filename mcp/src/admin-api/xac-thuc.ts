// API đăng nhập/đăng xuất/phiên/đổi mật khẩu của trang quản trị. Hai nhóm route:
//  - công khai (chưa đăng nhập): POST /dang-nhap
//  - cần đăng nhập + CSRF: /dang-xuat, /toi, /phien, /dang-xuat-moi-noi, /doi-mat-khau
import { Router } from 'express';
import type { Config } from '../config';
import type { Db } from '../db/ket-noi';
import { taoChongDo } from '../tai-khoan/chong-do';
import { taoCsrf } from '../tai-khoan/csrf';
import { bamMatKhau, kiemMatKhau, matKhauHopLe } from '../tai-khoan/mat-khau';
import { tokenTuCookie } from '../tai-khoan/middleware';
import { docMatKhauBam, doiMatKhau, timTheoEmail } from '../tai-khoan/nguoi-dung';
import { ghiNhatKy } from '../tai-khoan/nhat-ky';
import { lietKePhien, taoPhien, TEN_COOKIE_PHIEN, TTL_GHI_NHO, xoaMoiPhien, xoaPhien } from '../tai-khoan/phien';

export interface DepsXacThuc {
  config: Config;
  db: Db;
  now: () => number;
  /** Chờ `ms` mili giây (làm chậm tài khoản bị dò); test truyền bản giả để không ngủ thật. */
  cho: (ms: number) => Promise<void>;
}

export const SAI_DANG_NHAP = 'Sai email hoặc mật khẩu';
// Băm giả để tốn cùng thời gian kiểm tra khi email không tồn tại (không lộ email nào có tài khoản).
let bamGia: Promise<string> | undefined;

export const laHttps = (config: Config) => config.publicBaseUrl.startsWith('https:');

export function datCookiePhien(res: import('express').Response, config: Config, token: string, ghiNho: boolean): void {
  res.cookie(TEN_COOKIE_PHIEN, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: laHttps(config),
    ...(ghiNho ? { maxAge: TTL_GHI_NHO } : {}),
  });
}

export function xacThucCongKhai(d: DepsXacThuc): Router {
  const r = Router();
  const chongDo = taoChongDo(d.db, d.now);

  r.post('/dang-nhap', async (req, res) => {
    const { email, matKhau, ghiNho } = (req.body ?? {}) as Record<string, unknown>;
    if (typeof email !== 'string' || typeof matKhau !== 'string' || !email || !matKhau) {
      res.status(400).json({ loi: 'Cần nhập email và mật khẩu' });
      return;
    }
    const ip = req.ip ?? 'khong-ro';
    const kt = chongDo.kiemTra(ip, email);
    if (!kt.choPhep) {
      res.status(429).json({ loi: 'Đăng nhập sai quá nhiều lần. Hãy thử lại sau.', conLaiGiay: kt.conLaiGiay });
      return;
    }
    if (kt.treMs > 0) await d.cho(kt.treMs);

    const u = timTheoEmail(d.db, email);
    let dung = false;
    if (u && !u.biKhoa) dung = await kiemMatKhau(docMatKhauBam(d.db, u.id)!, matKhau);
    else await kiemMatKhau(await (bamGia ??= bamMatKhau('khong-ai-dung-mat-khau-nay')), matKhau);

    if (!u || !dung) {
      chongDo.ghiThatBai(ip, email);
      ghiNhatKy(d.db, { nguoiDungId: u?.id, loai: 'dang-nhap-that-bai', ip }, d.now);
      res.status(401).json({ loi: SAI_DANG_NHAP });
      return;
    }
    // Có 2FA: chưa xoá bộ đếm lần sai (mới đúng một nửa); phiên ở trạng thái "chờ TOTP" tới khi nhập đúng mã.
    if (!u.coTotp) chongDo.ghiThanhCong(ip, email);
    const token = taoPhien(d.db, u.id, { ghiNho: ghiNho === true, ip, thietBi: req.get('user-agent') ?? '', choTotp: u.coTotp }, d.now);
    datCookiePhien(res, d.config, token, ghiNho === true);
    ghiNhatKy(d.db, { nguoiDungId: u.id, loai: 'dang-nhap', ip }, d.now);
    res.json({ canTotp: u.coTotp });
  });

  return r;
}

export function xacThucDaDangNhap(d: DepsXacThuc): Router {
  const r = Router();

  r.get('/toi', (req, res) => {
    const csrf = taoCsrf(d.config.khoaBiMat, req.phienId!);
    // Phiên chờ TOTP chưa được biết người dùng là ai.
    if (req.choTotp) res.json({ choTotp: true, csrf });
    else res.json({ nguoiDung: req.nguoiDung, csrf });
  });

  r.post('/dang-xuat', (req, res) => {
    xoaPhien(d.db, req.phienId!);
    ghiNhatKy(d.db, { nguoiDungId: req.nguoiDung!.id, loai: 'dang-xuat', ip: req.ip }, d.now);
    res.clearCookie(TEN_COOKIE_PHIEN, { path: '/' });
    res.json({ ok: true });
  });

  r.get('/phien', (req, res) => {
    res.json({ phien: lietKePhien(d.db, req.nguoiDung!.id).map((p) => ({ ...p, hienTai: p.id === req.phienId })) });
  });

  r.delete('/phien/:id', (req, res) => {
    const id = Number(req.params.id);
    const cuaToi = Number.isInteger(id) && lietKePhien(d.db, req.nguoiDung!.id).some((p) => p.id === id);
    if (!cuaToi) {
      res.status(404).json({ loi: 'Không tìm thấy thiết bị này' });
      return;
    }
    xoaPhien(d.db, id);
    res.json({ ok: true });
  });

  r.post('/dang-xuat-moi-noi', (req, res) => {
    xoaMoiPhien(d.db, req.nguoiDung!.id, req.phienId);
    ghiNhatKy(d.db, { nguoiDungId: req.nguoiDung!.id, loai: 'dang-xuat-moi-noi', ip: req.ip }, d.now);
    res.json({ ok: true });
  });

  r.post('/doi-mat-khau', async (req, res) => {
    const { matKhauCu, matKhauMoi } = (req.body ?? {}) as Record<string, unknown>;
    if (typeof matKhauCu !== 'string' || typeof matKhauMoi !== 'string') {
      res.status(400).json({ loi: 'Cần nhập mật khẩu cũ và mật khẩu mới' });
      return;
    }
    const u = req.nguoiDung!;
    if (!(await kiemMatKhau(docMatKhauBam(d.db, u.id)!, matKhauCu))) {
      res.status(400).json({ loi: 'Mật khẩu cũ không đúng' });
      return;
    }
    const loi = matKhauHopLe(matKhauMoi);
    if (loi) {
      res.status(400).json({ loi });
      return;
    }
    await doiMatKhau(d.db, u.id, matKhauMoi); // đăng xuất mọi nơi, kể cả máy này...
    const cu = tokenTuCookie(req) !== undefined;
    if (cu) datCookiePhien(res, d.config, taoPhien(d.db, u.id, { ghiNho: false, ip: req.ip, thietBi: req.get('user-agent') ?? '' }, d.now), false); // ...rồi cấp phiên mới cho máy này
    ghiNhatKy(d.db, { nguoiDungId: u.id, loai: 'doi-mat-khau', ip: req.ip }, d.now);
    res.json({ ok: true });
  });

  return r;
}
