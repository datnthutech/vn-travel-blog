// Những thứ mọi tool cần dùng chung. Đưa vào qua tham số (thay vì import trực tiếp) để test được bằng đồ giả.
import type { Config } from '../config';
import type { HangDoiBuild } from '../build/hang-doi';
import type { Db } from '../db/ket-noi';
import type { GithubClient } from '../github/client';

export interface ToolCtx {
  config: Config;
  /** SQLite: nguồn sự thật của nội dung bài, tỉnh, redirect. */
  db: Db;
  github: GithubClient;
  now: () => number;
  /** Hàng đợi build nội bộ: tool gọi yeuCau() sau khi commit để bản xem trước được build lại. */
  hangDoi: HangDoiBuild;
  /** Kiểm tra ổ đĩa còn chỗ; test truyền bản giả. */
  conDungLuong?: (anhDir: string) => Promise<boolean>;
}

export const REDIRECTS_PATH = 'site/redirects.json';

// Vị trí bài và tỉnh trong repo GitHub. Tên file bài LUÔN là <slug>.md.
export const BAI_DIR = 'site/src/content/bai-viet';
export const TINH_DIR = 'site/src/content/tinh';
export const duongDanBai = (slug: string) => `${BAI_DIR}/${slug}.md`;

// slug an toàn để ghép vào đường dẫn file (chặn ../ và ký tự lạ).
export const SLUG_HOP_LE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
