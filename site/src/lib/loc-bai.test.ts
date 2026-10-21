import { describe, expect, it } from 'vitest';
import { locBaiViet } from './loc-bai';
import { buildTarget } from './build-target';
import type { BaiViet, Tinh } from '@vntraveltips/schema';

const tinh: Tinh[] = [
  { ten: 'Vũng Tàu', slug: 'vung-tau', gioiThieu: '', anhBia: { ma: 'a', alt: 'a' }, moTa: '' },
];
const bai = (slug: string, draft: boolean, t?: string) => ({ slug, draft, tinh: t }) as BaiViet;

describe('locBaiViet', () => {
  const tatCa = [bai('a', false, 'vung-tau'), bai('b', true, 'vung-tau')];

  it('production bỏ bài nháp', () => {
    expect(locBaiViet(tatCa, tinh, 'production').map((b) => b.slug)).toEqual(['a']);
  });
  it('preview giữ cả bài nháp', () => {
    expect(locBaiViet(tatCa, tinh, 'preview').map((b) => b.slug)).toEqual(['a', 'b']);
  });
  it('tinh không tồn tại → throw (build lỗi, site giữ bản cũ)', () => {
    expect(() => locBaiViet([bai('x', false, 'khong-co')], tinh, 'production')).toThrow(/khong-co/);
  });
  it('slug trùng → throw', () => {
    expect(() => locBaiViet([bai('x', false), bai('x', false)], tinh, 'production')).toThrow(/trùng/);
  });
  it('kiểm tra tham chiếu cả với bài nháp (production vẫn báo lỗi)', () => {
    expect(() => locBaiViet([bai('x', true, 'khong-co')], tinh, 'production')).toThrow();
  });
});

describe('buildTarget', () => {
  it('đọc BUILD_TARGET, mặc định preview', () => {
    expect(buildTarget({ BUILD_TARGET: 'production' })).toBe('production');
    expect(buildTarget({})).toBe('preview');
    expect(buildTarget({ BUILD_TARGET: 'linh-tinh' })).toBe('preview');
  });
});
