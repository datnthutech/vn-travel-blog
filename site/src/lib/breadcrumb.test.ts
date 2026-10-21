import { describe, expect, it } from 'vitest';
import { breadcrumb, TEN_LOAI } from './breadcrumb';
import type { BaiViet, Tinh } from '@vntraveltips/schema';

const tinh = { ten: 'Vũng Tàu', slug: 'vung-tau' } as Tinh;

describe('breadcrumb', () => {
  it('bài có tỉnh → Trang chủ › Tỉnh › Loại bài', () => {
    const r = breadcrumb({ loai: 'nhat-ky', tinh: 'vung-tau' } as BaiViet, tinh);
    expect(r).toEqual([
      { ten: 'Trang chủ', url: '/' },
      { ten: 'Vũng Tàu', url: '/vung-tau/' },
      { ten: TEN_LOAI['nhat-ky'], url: '/loai/nhat-ky/' },
    ]);
  });

  it('bài không có tỉnh → Trang chủ › Kinh nghiệm', () => {
    const r = breadcrumb({ loai: 'top-list' } as BaiViet);
    expect(r).toEqual([
      { ten: 'Trang chủ', url: '/' },
      { ten: 'Kinh nghiệm', url: '/kinh-nghiem/' },
    ]);
  });
});
