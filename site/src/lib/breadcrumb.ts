// Đường dẫn "Trang chủ › Tỉnh › Loại bài". Bài không thuộc tỉnh nào → "Trang chủ › Kinh nghiệm".
// Bản dịch: địa chỉ có tiền tố /<mã>/ và chữ lấy từ chuỗi giao diện của ngôn ngữ đó.
import type { BaiViet, Tinh } from '@vntraveltips/schema';
import { t } from '../i18n/giao-dien';

export const TEN_LOAI: Record<BaiViet['loai'], string> = {
  'nhat-ky': 'Nhật ký chuyến đi',
  review: 'Review',
  'top-list': 'Top list',
  'cam-nang': 'Cẩm nang',
};
export const tenLoai = (loai: BaiViet['loai'], ngonNgu = 'vi'): string => t(ngonNgu, `loai.${loai}`);

export interface MucBreadcrumb {
  ten: string;
  url: string;
}

export function breadcrumb(b: Pick<BaiViet, 'loai' | 'tinh'>, tinh?: Pick<Tinh, 'ten' | 'slug'>, ngonNgu = 'vi'): MucBreadcrumb[] {
  const p = ngonNgu === 'vi' ? '' : `/${ngonNgu}`;
  const trangChu = { ten: t(ngonNgu, 'trang-chu'), url: `${p}/` };
  if (!b.tinh || !tinh) return [trangChu, { ten: t(ngonNgu, 'kinh-nghiem'), url: `${p}/kinh-nghiem/` }];
  // Trang loại bài (/loai/…) chỉ có bản tiếng Việt: bản dịch trỏ về hub tỉnh của ngôn ngữ đó.
  return [trangChu, { ten: tinh.ten, url: `${p}/${tinh.slug}/` }, { ten: tenLoai(b.loai, ngonNgu), url: ngonNgu === 'vi' ? `/loai/${b.loai}/` : `${p}/${tinh.slug}/` }];
}
