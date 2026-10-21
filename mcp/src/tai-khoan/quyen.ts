// Phân quyền ở máy chủ. Bảng quyền nằm ở packages/schema/src/quyen.ts (dùng chung với giao diện); file này chỉ có middleware.
import { coQuyen, type HanhDong } from '@vntraveltips/schema';
import type { RequestHandler, Request } from 'express';

export { CAC_VAI_TRO, coQuyen, type HanhDong, type VaiTro } from '@vntraveltips/schema';

/** Ngữ cảnh sở hữu của request (vd tác giả bài lấy từ DB theo :id). */
export type NguCanh = { tacGiaId?: number | null } | 'khong-ton-tai';

/**
 * Middleware: chỉ cho qua khi người đăng nhập có quyền `hd` (với ngữ cảnh `layNguCanh(req)`), nếu không → 403.
 * Phải đặt SAU yeuCauDangNhap (cần req.nguoiDung).
 */
export function yeuCauQuyen(hd: HanhDong, layNguCanh?: (req: Request) => NguCanh): RequestHandler {
  return (req, res, next) => {
    const u = req.nguoiDung;
    const nc = layNguCanh ? layNguCanh(req) : {};
    // Đối tượng không tồn tại: để route trả 404 (mọi vai trò nhận cùng một mã; route KHÔNG được làm gì khi không có đối tượng).
    if (u && nc === 'khong-ton-tai') return next();
    if (!u || nc === 'khong-ton-tai' || !coQuyen(u, hd, nc)) {
      res.status(403).json({ loi: 'Bạn không có quyền làm việc này' });
      return;
    }
    next();
  };
}
