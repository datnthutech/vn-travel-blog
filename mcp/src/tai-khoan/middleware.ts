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
