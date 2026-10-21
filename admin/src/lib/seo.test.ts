import { describe, expect, it } from 'vitest';
import { danhGiaMoTa, danhGiaTieuDe, xemTruocGoogle } from './seo';

describe('danhGiaMoTa (120–160 ký tự theo schema)', () => {
  it('119 → ngắn; 120 và 160 → tốt; 161 → dài', () => {
    expect(danhGiaMoTa('a'.repeat(119))).toEqual({ doDai: 119, trangThai: 'ngan' });
    expect(danhGiaMoTa('a'.repeat(120)).trangThai).toBe('tot');
    expect(danhGiaMoTa('a'.repeat(160))).toEqual({ doDai: 160, trangThai: 'tot' });
    expect(danhGiaMoTa('a'.repeat(161)).trangThai).toBe('dai');
    expect(danhGiaMoTa('').trangThai).toBe('ngan');
  });
  it('đếm ký tự có dấu theo chữ người đọc thấy, không theo byte', () => {
    expect(danhGiaMoTa('ế'.repeat(130))).toEqual({ doDai: 130, trangThai: 'tot' });
  });
});

describe('danhGiaTieuDe (30–65 ký tự)', () => {
  it('29 → ngắn; 30 và 65 → tốt; 66 → dài', () => {
    expect(danhGiaTieuDe('a'.repeat(29)).trangThai).toBe('ngan');
    expect(danhGiaTieuDe('a'.repeat(30)).trangThai).toBe('tot');
    expect(danhGiaTieuDe('a'.repeat(65)).trangThai).toBe('tot');
    expect(danhGiaTieuDe('a'.repeat(66)).trangThai).toBe('dai');
  });
});

describe('xemTruocGoogle', () => {
  it('cắt tiêu đề >60 và mô tả >160 bằng …; hiện đường dẫn dạng miền › tỉnh › slug', () => {
    const r = xemTruocGoogle({ tieuDe: 'T'.repeat(80), url: 'https://vntraveltips.monai.click/vung-tau/bai-viet/', moTa: 'm'.repeat(200) });
    expect(r.tieuDe).toHaveLength(60);
    expect(r.tieuDe.endsWith('…')).toBe(true);
    expect(r.moTa).toHaveLength(160);
    expect(r.moTa.endsWith('…')).toBe(true);
    expect(r.duongDan).toBe('vntraveltips.monai.click › vung-tau › bai-viet');
  });
  it('ngắn thì giữ nguyên; thiếu tiêu đề/mô tả thì hiện chỗ trống rõ ràng', () => {
    expect(xemTruocGoogle({ tieuDe: 'Ngắn', url: 'https://x.vn/a/', moTa: 'Mô tả' })).toMatchObject({ tieuDe: 'Ngắn', moTa: 'Mô tả' });
    expect(xemTruocGoogle({ tieuDe: '', url: 'https://x.vn/', moTa: '' })).toMatchObject({ tieuDe: '(chưa có tiêu đề)', moTa: '(chưa có mô tả)' });
  });
});
