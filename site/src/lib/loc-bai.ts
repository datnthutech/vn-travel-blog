// Phần "thuần" (không phụ thuộc Astro) của việc lấy bài viết, tách riêng để test được bằng vitest.
// Hai việc: (1) bỏ nháp khi build production, (2) kiểm tra tham chiếu (tỉnh có thật, slug không trùng).
// Sai thì throw để build dừng và site giữ bản cũ.
import { kiemTraThamChieu, type BaiViet, type Tinh } from '@vntraveltips/schema';
import type { BuildTarget } from './build-target';

export function locBaiViet(bai: BaiViet[], tinh: Tinh[], target: BuildTarget): BaiViet[] {
  const loi = kiemTraThamChieu(bai, tinh);
  if (loi.length) throw new Error(`Dữ liệu bài viết không hợp lệ:\n- ${loi.join('\n- ')}`);
  return target === 'production' ? bai.filter((b) => !b.draft) : bai;
}
