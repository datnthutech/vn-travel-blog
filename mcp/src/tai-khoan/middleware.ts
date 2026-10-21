// Middleware cho /api/admin: yêu cầu đăng nhập (gắn req.nguoiDung) và kiểm tra CSRF cho request ghi.
import type { Request, RequestHandler } from 'express';
import type { Db } from '../db/ket-noi';
import { kiemCsrf } from './csrf';
import type { NguoiDung } from './nguoi-dung';
import { docPhien, TEN_COOKIE_PHIEN, TTL_GHI_NHO } from './phien';

declare module 'express-serve-static-core' {
  interface Request {
    nguoiDung?: NguoiDung;
    phienId?: number;
    choTotp?: boolean;
  }
}

export interface DepsMiddleware {
  db: Db;
  now: () => number;
  khoaBiMat: string;
  /** Cookie có thuộc tính Secure khi site chạy https. */
  secure: boolean;
}

export const tokenTuCookie = (req: Request): string | undefined => {
  const v = (req.cookies as Record<string, unknown> | undefined)?.[TEN_COOKIE_PHIEN];
  return typeof v === 'string' && v ? v : undefined;
};

export function yeuCauDangNhap(d: DepsMiddleware): RequestHandler {
  return (req, res, next) => {
    const token = tokenTuCookie(req);
    const p = token ? docPhien(d.db, token, d.now) : null;
    if (!token || !p) {
      res.status(401).json({ loi: 'Chưa đăng nhập hoặc phiên đã hết hạn' });
      return;
    }
    req.nguoiDung = p.nguoiDung;
    req.phienId = p.phienId;
    req.choTotp = p.choTotp;
    // "Ghi nhớ": gia hạn cả cookie, để trượt cùng phiên phía máy chủ.
    if (p.ghiNho) res.cookie(TEN_COOKIE_PHIEN, token, { httpOnly: true, sameSite: 'lax', path: '/', secure: d.secure, maxAge: TTL_GHI_NHO });
    next();
  };
}

const GHI = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Đặt SAU yeuCauDangNhap: request ghi phải có X-CSRF-Token khớp phiên, nếu không → 403. */
export function kiemCsrfGhi(khoaBiMat: string): RequestHandler {
  return (req, res, next) => {
    if (GHI.has(req.method) && !(req.phienId !== undefined && kiemCsrf(khoaBiMat, req.phienId, req.get('x-csrf-token')))) {
      res.status(403).json({ loi: 'Thiếu hoặc sai mã bảo vệ (CSRF). Hãy tải lại trang.' });
      return;
    }
    next();
  };
}

const CHO_TOTP_DUOC_GOI = new Set(['/toi', '/dang-nhap/totp', '/dang-xuat']);

/**
 * Cổng theo trạng thái phiên, đặt SAU yeuCauDangNhap và TRƯỚC mọi router nghiệp vụ:
 *  - phiên đang chờ mã TOTP: chỉ gọi được /toi, /dang-nhap/totp, /dang-xuat (còn lại 401);
 *  - quản trị chưa bật 2FA: chỉ gọi được /toi, /2fa/*, /dang-xuat (còn lại 403).
 */
export function canTheoTrangThaiPhien(): RequestHandler {
  return (req, res, next) => {
    if (req.choTotp) {
      if (CHO_TOTP_DUOC_GOI.has(req.path)) return next();
      res.status(401).json({ loi: 'Cần nhập mã xác thực 2 lớp để hoàn tất đăng nhập' });
      return;
    }
    const u = req.nguoiDung!;
    if (u.vaiTro === 'quan-tri' && !u.coTotp && !(req.path === '/toi' || req.path === '/dang-xuat' || req.path.startsWith('/2fa/'))) {
      res.status(403).json({ loi: 'Cần bật xác thực 2 lớp' });
      return;
    }
    next();
  };
}
