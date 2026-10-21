// Những thứ mọi tool cần dùng chung. Đưa vào qua tham số (thay vì import trực tiếp) để test được bằng đồ giả.
// Tool MCP làm việc trên CÙNG lớp nội dung (SQLite) với trang quản trị và THEO QUYỀN của tài khoản đã đăng nhập OAuth.
import type { Config } from '../config';
import type { HangDoiBuild } from '../build/hang-doi';
import type { Db } from '../db/ket-noi';
import type { DichVuAi } from '../ai/dich-vu';
import type { DichVuMail } from '../mail/dich-vu';
import type { NguoiDung } from '../tai-khoan/nguoi-dung';

export interface ToolCtx {
  config: Config;
  /** SQLite: nguồn sự thật của nội dung bài, tỉnh, redirect. */
  db: Db;
  /** Người dùng admin của token MCP (đã kiểm tra chưa bị khoá). Mọi tool ghi kiểm `coQuyen` trên người này. */
  nguoiDung: NguoiDung;
  now: () => number;
  /** Hàng đợi build nội bộ: tool gọi yeuCau() sau khi ghi để bản xem trước được build lại. */
  hangDoi: HangDoiBuild;
  mail?: DichVuMail;
  /** Dịch vụ AI dịch bài (tool dich_ai_ban_dich chỉ có khi đã cấu hình API key). */
  dichVuAi?: DichVuAi;
  /** Kiểm tra ổ đĩa còn chỗ; test truyền bản giả. */
  conDungLuong?: (anhDir: string) => Promise<boolean>;
}

// slug an toàn (chặn ký tự lạ).
export const SLUG_HOP_LE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
