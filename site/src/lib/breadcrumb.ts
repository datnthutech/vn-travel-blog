// Đường dẫn "Trang chủ › Tỉnh › Loại bài". Bài không thuộc tỉnh nào → "Trang chủ › Kinh nghiệm".
import type { BaiViet, Tinh } from '@vntraveltips/schema';

export const TEN_LOAI: Record<BaiViet['loai'], string> = {
  'nhat-ky': 'Nhật ký chuyến đi',
  review: 'Review',
  'top-list': 'Top list',
  'cam-nang': 'Cẩm nang',
};

export interface MucBreadcrumb {
  ten: string;
  url: string;
}

export function breadcrumb(b: Pick<BaiViet, 'loai' | 'tinh'>, tinh?: Pick<Tinh, 'ten' | 'slug'>): MucBreadcrumb[] {
  const trangChu = { ten: 'Trang chủ', url: '/' };
  if (!b.tinh || !tinh) return [trangChu, { ten: 'Kinh nghiệm', url: '/kinh-nghiem/' }];
  return [trangChu, { ten: tinh.ten, url: `/${tinh.slug}/` }, { ten: TEN_LOAI[b.loai], url: `/loai/${b.loai}/` }];
}
