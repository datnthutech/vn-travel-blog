import { describe, expect, it } from 'vitest';
import { related } from './related';
import type { BaiViet } from '@vntraveltips/schema';

const bai = (slug: string, tinh?: string, chuyenMuc: string[] = []) => ({ slug, tinh, chuyenMuc }) as BaiViet;

describe('related', () => {
  const tatCa = [
    bai('goc', 'vung-tau', ['an-uong']),
    bai('cung-tinh', 'vung-tau', ['vui-choi']),
    bai('cung-muc', 'da-lat', ['an-uong']),
    bai('khong-lien-quan', 'da-lat', ['di-chuyen']),
  ];

  it('cùng tỉnh đứng trước, rồi cùng chuyên mục, không trả chính nó', () => {
    expect(related(tatCa[0], tatCa).map((b) => b.slug)).toEqual(['cung-tinh', 'cung-muc']);
  });

  it('bài không có tỉnh chỉ khớp theo chuyên mục, không lỗi', () => {
    const goc = bai('top', undefined, ['an-uong']);
    expect(related(goc, [goc, ...tatCa]).map((b) => b.slug)).toEqual(['goc', 'cung-muc']);
  });

  it('giới hạn số bài trả về', () => {
    const nhieu = [bai('g', 't', []), ...Array.from({ length: 6 }, (_, i) => bai(`b${i}`, 't', []))];
    expect(related(nhieu[0], nhieu, 3)).toHaveLength(3);
  });

  it('không có gì liên quan → mảng rỗng', () => {
    expect(related(tatCa[3], [tatCa[3]])).toEqual([]);
  });
});
