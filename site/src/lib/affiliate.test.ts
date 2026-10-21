import { describe, expect, it } from 'vitest';
import { baiVietSchema } from '@vntraveltips/schema';
import { REL_AFFILIATE, coAffiliate } from './affiliate';
import { goatcounterScript } from './analytics';
import { ads } from '../config/ads';

const bai = (over: Record<string, unknown> = {}) =>
  baiVietSchema.parse({
    tieuDe: 'x', slug: 'x', moTa: 'a'.repeat(130), loai: 'top-list', anhBia: { ma: 'a', alt: 'a' }, ngayDang: '2026-10-19', ...over,
  });

describe('affiliate', () => {
  it('rel đúng theo thiết kế', () => {
    expect(REL_AFFILIATE).toBe('sponsored nofollow noopener');
  });

  it('coAffiliate: true khi có linkDat hoặc link đồ cho bé', () => {
    expect(coAffiliate(bai())).toBe(false);
    expect(coAffiliate(bai({ diaDiem: [{ ten: 'A', kieu: 'cho-o' }], doMangChoBe: [{ ten: 'B' }] }))).toBe(false);
    expect(coAffiliate(bai({ diaDiem: [{ ten: 'A', kieu: 'cho-o', linkDat: { nhaCungCap: 'agoda', url: 'https://agoda.com/x' } }] }))).toBe(true);
    expect(coAffiliate(bai({ doMangChoBe: [{ ten: 'B', link: 'https://shopee.vn/x' }] }))).toBe(true);
  });
});

describe('quảng cáo', () => {
  it('tắt mặc định (bật sau khi có AdSense)', () => {
    expect(ads.enabled).toBe(false);
  });
  it('mỗi vị trí giữ sẵn chiều cao để không nhảy bố cục khi bật', () => {
    for (const v of ['sauTraNhanh', 'giuaBai', 'cuoiBai'] as const) expect(ads.minHeight[v]).toBeGreaterThan(0);
  });
});

describe('goatcounterScript (analytics không cookie)', () => {
  it('chỉ có khi production và có mã site hợp lệ', () => {
    expect(goatcounterScript({ BUILD_TARGET: 'production', GOATCOUNTER_CODE: 'vntraveltips' })).toEqual({
      endpoint: 'https://vntraveltips.goatcounter.com/count',
      src: 'https://gc.zgo.at/count.js',
    });
    expect(goatcounterScript({ BUILD_TARGET: 'production' })).toBeNull();
    expect(goatcounterScript({ BUILD_TARGET: 'preview', GOATCOUNTER_CODE: 'vntraveltips' })).toBeNull();
    expect(goatcounterScript({ GOATCOUNTER_CODE: 'vntraveltips' })).toBeNull();
  });
  it('mã site có ký tự lạ (chống chèn HTML) → bỏ qua', () => {
    expect(goatcounterScript({ BUILD_TARGET: 'production', GOATCOUNTER_CODE: 'a"><script>' })).toBeNull();
  });
});
