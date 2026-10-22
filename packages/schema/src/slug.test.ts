import { describe, expect, it } from 'vitest';
import { slugHopLe, taoSlug } from './slug';
import { SLUG_HE_THONG } from './tham-chieu';

describe('taoSlug (Review Focus 2)', () => {
  it('bỏ dấu tiếng Việt, đ/Đ → d, chữ thường, bỏ dấu câu', () => {
    expect(taoSlug('Đà Lạt mùa hoa dã quỳ!')).toBe('da-lat-mua-hoa-da-quy');
    expect(taoSlug('ĐÔNG ĐÔ — Đường Đê')).toBe('dong-do-duong-de');
    expect(taoSlug('Quán  ăn   "ngon"   (rẻ) & sạch')).toBe('quan-an-ngon-re-sach');
  });

  it('toàn ký tự lạ / rỗng → bai-viet, không bao giờ rỗng', () => {
    for (const s of ['', '  ---  ', '!!!', '日本語', '😀']) expect(taoSlug(s)).toBe('bai-viet');
  });

  it('giữ chữ-số, gộp gạch ngang, bỏ gạch đầu/cuối', () => {
    expect(taoSlug('Top 10 bãi biển 2026')).toBe('top-10-bai-bien-2026');
    expect(taoSlug('--a---b--')).toBe('a-b');
  });

  it('dài tối đa 80 ký tự, cắt ở ranh giới "-", không kết thúc bằng "-"', () => {
    const s = taoSlug('một hai ba bốn năm sáu bảy tám chín mười '.repeat(5));
    expect(s.length).toBeLessThanOrEqual(80);
    expect(s.endsWith('-')).toBe(false);
    expect(s).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(s.endsWith('-muoi') || s.endsWith('-chin') || /-[a-z]+$/.test(s)).toBe(true);
    expect(taoSlug('a'.repeat(200))).toHaveLength(80); // một từ dài: cắt cứng
    expect(taoSlug('x'.repeat(200).replace(/(.{10})/g, '$1 '))).not.toMatch(/-$/);
  });

  it('kết quả luôn hợp lệ theo slugHopLe', () => {
    for (const s of ['Đà Nẵng', 'Phú Quốc 3N2Đ', '---', 'ÀÁẢÃẠ']) expect(slugHopLe(taoSlug(s))).toBe(true);
    expect(slugHopLe('Sai Dạng')).toBe(false);
  });

  it('có danh sách slug hệ thống (admin, tim-kiem…)', () => {
    expect(SLUG_HE_THONG).toEqual(expect.arrayContaining(['admin', 'quan-tri', 'tim-kiem', 'kinh-nghiem']));
  });
});
