// Chuỗi giao diện gốc (tiếng Việt) của site. Đặt ở package dùng chung để cả site (hiển thị) lẫn máy chủ (kiểm tra khoá khi lưu bản dịch,
// bảng "khoá còn thiếu") đọc cùng một nguồn. File JSON này cũng được `site/scripts/write-build-json.mjs` đọc trực tiếp.
import vi from './giao-dien-vi.json';

export type KhoaGiaoDien = keyof typeof vi;
export const CHUOI_GIAO_DIEN_VI: Record<string, string> = vi;
