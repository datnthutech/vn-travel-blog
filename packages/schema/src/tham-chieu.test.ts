import { describe, expect, it } from 'vitest';
import { kiemTraThamChieu } from './index';
import type { BaiViet, Tinh } from './index';

const tinh: Tinh[] = [
  { ten: 'Vũng Tàu', slug: 'vung-tau', gioiThieu: 'Biển gần Sài Gòn', anhBia: { ma: 'x1', alt: 'Biển' }, moTa: 'Điểm đến cuối tuần' },
];
const bai = (slug: string, t?: string) => ({ slug, tinh: t }) as BaiViet;

describe('kiemTraThamChieu', () => {
  it('hợp lệ → không lỗi', () => {
    expect(kiemTraThamChieu([bai('a', 'vung-tau'), bai('b')], tinh)).toEqual([]);
  });
  it('slug tỉnh trùng mã ngôn ngữ đang có → báo lỗi', () => {
    expect(kiemTraThamChieu([], [{ slug: 'en' }, { slug: 'da-nang' }], undefined, ['vi', 'en'])).toEqual(['Slug tỉnh "en" trùng mã một ngôn ngữ']);
  });
  it('tinh không tồn tại → báo lỗi', () => {
    const loi = kiemTraThamChieu([bai('a', 'khong-co')], tinh);
    expect(loi).toHaveLength(1);
    expect(loi[0]).toContain('khong-co');
  });
  it.each(['kinh-nghiem', 'admin', 'anh', 'mcp', 'tai-anh', 'oauth', 'chu-de', 'loai'])(
    'slug tỉnh "%s" trùng đường dẫn hệ thống → báo lỗi',
    (slug) => {
      const loi = kiemTraThamChieu([], [{ slug }]);
      expect(loi).toHaveLength(1);
      expect(loi[0]).toContain(slug);
    },
  );
  it('trùng slug → báo lỗi', () => {
    const loi = kiemTraThamChieu([bai('a'), bai('a', 'vung-tau')], tinh);
    expect(loi.some((l) => l.includes('trùng'))).toBe(true);
  });
});

describe('kiemTraThamChieu — chuyên mục', () => {
  const bai = [{ slug: 'a', chuyenMuc: ['an-uong', 'khong-co'] }];
  it('bài dùng chuyên mục không tồn tại → báo lỗi nêu tên bài và chuyên mục', () => {
    const loi = kiemTraThamChieu(bai, [], [{ slug: 'an-uong' }]);
    expect(loi).toEqual(['Bài "a": chuyên mục "khong-co" không tồn tại']);
  });
  it('không truyền danh sách chuyên mục → không kiểm tra (tương thích cũ)', () => {
    expect(kiemTraThamChieu(bai, [])).toEqual([]);
  });
  it('đủ chuyên mục → hợp lệ', () => {
    expect(kiemTraThamChieu(bai, [], [{ slug: 'an-uong' }, { slug: 'khong-co' }])).toEqual([]);
  });
});
