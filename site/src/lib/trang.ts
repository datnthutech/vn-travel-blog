// Trang tĩnh: 3 trang cố định luôn có; trang do chủ blog tạo nằm ở trang/<slug>.md trong thư mục xuất (Task 5 bổ sung).
import { TRANG_CO_DINH } from '@vntraveltips/schema';

export interface TrangTinh { slug: string; tieuDe: string }

export async function layTrang(): Promise<TrangTinh[]> {
  return TRANG_CO_DINH.map((slug) => ({ slug, tieuDe: slug }));
}
