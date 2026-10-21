import { describe, expect, it } from 'vitest';
import { baiVietSchema, urlBai } from './index';

const moTa = (n: number) => 'a'.repeat(n);

const traNhanh = {
  hopVoi: 'Gia đình có bé 1–5 tuổi',
  thoiGian: '2 ngày 1 đêm',
  choO: 'Căn hộ view biển, 800k/đêm',
  tongChiPhi: 3000000,
  soNguoi: 3,
  diemThanThienVoiBe: 4,
  diChuyen: 'Xe riêng, 2 giờ từ TP.HCM',
  thoiDiemNenDi: 'Tháng 11 – tháng 3',
  luuYVoiBe: ['Mang áo phao cho bé'],
};

const base = {
  tieuDe: 'Vũng Tàu 2 ngày 1 đêm cùng bé',
  slug: 'vung-tau-2n1d',
  moTa: moTa(130),
  loai: 'nhat-ky',
  tinh: 'vung-tau',
  chuyenMuc: ['an-uong'],
  tags: [],
  anhBia: { ma: 'abc123', alt: 'Bãi biển Vũng Tàu buổi sáng' },
  ngayDi: '2026-10-10',
  ngayDang: '2026-10-19',
  traNhanh,
  diaDiem: [],
  doMangChoBe: [],
  faq: [],
  hopTac: false,
  draft: true,
};

describe('baiVietSchema', () => {
  it('chấp nhận bài hợp lệ', () => {
    expect(baiVietSchema.safeParse(base).success).toBe(true);
  });

  it.each([
    [119, false],
    [120, true],
    [160, true],
    [161, false],
  ])('moTa %i ký tự → hợp lệ=%s', (n, ok) => {
    expect(baiVietSchema.safeParse({ ...base, moTa: moTa(n) }).success).toBe(ok);
  });

  it('review thiếu traNhanh → lỗi', () => {
    const { traNhanh: _t, ...khong } = base;
    expect(baiVietSchema.safeParse({ ...khong, loai: 'review' }).success).toBe(false);
  });

  it('nhat-ky thiếu traNhanh → lỗi', () => {
    const { traNhanh: _t, ...khong } = base;
    expect(baiVietSchema.safeParse(khong).success).toBe(false);
  });

  it('top-list không có traNhanh → hợp lệ', () => {
    const { traNhanh: _t, ...khong } = base;
    expect(baiVietSchema.safeParse({ ...khong, loai: 'top-list' }).success).toBe(true);
  });

  it('anhBia thiếu alt → lỗi', () => {
    expect(baiVietSchema.safeParse({ ...base, anhBia: { ma: 'abc123' } }).success).toBe(false);
  });

  it('diemThanThienVoiBe = 6 → lỗi', () => {
    const r = baiVietSchema.safeParse({ ...base, traNhanh: { ...traNhanh, diemThanThienVoiBe: 6 } });
    expect(r.success).toBe(false);
  });

  it('bài không có tinh → hợp lệ', () => {
    const { tinh: _t, ...khong } = base;
    expect(baiVietSchema.safeParse({ ...khong, loai: 'cam-nang' }).success).toBe(true);
  });

  it('slug có dấu/khoảng trắng → lỗi', () => {
    expect(baiVietSchema.safeParse({ ...base, slug: 'Vũng Tàu' }).success).toBe(false);
  });
});

describe('urlBai', () => {
  it('có tinh → /tinh/slug/', () => {
    expect(urlBai({ slug: 'x', tinh: 'vung-tau' })).toBe('/vung-tau/x/');
  });
  it('không tinh → /kinh-nghiem/slug/', () => {
    expect(urlBai({ slug: 'x' })).toBe('/kinh-nghiem/x/');
  });
});
