import { describe, expect, it } from 'vitest';
import type { Tinh } from '@vntraveltips/schema';
import { kiemTraBai } from './checklist';

const tinh = [{ ten: 'Vũng Tàu', slug: 'vung-tau' }] as Tinh[];
const tu = (n: number) => Array.from({ length: n }, (_, i) => `từ${i}`).join(' ');
const THAN_DU = `## Chuẩn bị\n\n${tu(320)} xem thêm [bài khác](/vung-tau/bai-khac/).\n`;

const hopLe = () => ({
  tieuDe: 'Vũng Tàu 2 ngày 1 đêm cùng bé',
  slug: 'vung-tau-2n1d',
  moTa: 'a'.repeat(130),
  loai: 'nhat-ky',
  tinh: 'vung-tau',
  anhBia: { ma: 'abc', alt: 'Biển' },
  ngayDi: '2026-10-10',
  ngayDang: '2026-10-19',
  traNhanh: {
    hopVoi: 'x', thoiGian: 'y', tongChiPhi: 1, soNguoi: 1, diemThanThienVoiBe: 3, diChuyen: 'z', thoiDiemNenDi: 't',
  },
});
const khac = [{ slug: 'bai-khac' }];

describe('kiemTraBai', () => {
  it('bài hợp lệ → đạt, không lỗi, không gợi ý', () => {
    const r = kiemTraBai(hopLe(), tinh, khac, THAN_DU);
    expect(r).toEqual({ dat: true, loi: [], goiY: [] });
  });

  it('không phải object → không đạt', () => {
    expect(kiemTraBai(null, tinh, khac, '').dat).toBe(false);
    expect(kiemTraBai('xin chào', tinh, khac, '').dat).toBe(false);
  });

  it('thiếu alt ảnh bìa → lỗi nêu đường dẫn trường anhBia.alt', () => {
    const r = kiemTraBai({ ...hopLe(), anhBia: { ma: 'abc' } }, tinh, khac, THAN_DU);
    expect(r.dat).toBe(false);
    expect(r.loi.join('\n')).toContain('anhBia.alt');
  });

  it('moTa 119 ký tự → lỗi nêu moTa', () => {
    const r = kiemTraBai({ ...hopLe(), moTa: 'a'.repeat(119) }, tinh, khac, THAN_DU);
    expect(r.loi.join('\n')).toContain('moTa');
  });

  it('nhật ký thiếu traNhanh → lỗi; top-list không traNhanh → đạt', () => {
    const { traNhanh: _t, ...khong } = hopLe();
    expect(kiemTraBai(khong, tinh, khac, THAN_DU).loi.join('\n')).toContain('traNhanh');
    const top = kiemTraBai({ ...khong, loai: 'top-list' }, tinh, khac, THAN_DU);
    expect(top.loi).toEqual([]);
    expect(top.dat).toBe(true);
  });

  it('slug trùng bài khác → lỗi', () => {
    const r = kiemTraBai(hopLe(), tinh, [{ slug: 'vung-tau-2n1d' }], THAN_DU);
    expect(r.loi.join('\n')).toMatch(/trùng/);
  });

  it('tỉnh không tồn tại → lỗi', () => {
    const r = kiemTraBai({ ...hopLe(), tinh: 'khong-co' }, tinh, khac, THAN_DU);
    expect(r.loi.join('\n')).toContain('khong-co');
  });

  it('ảnh trong thân bài thiếu alt hoặc dùng URL ngoài → lỗi', () => {
    const r1 = kiemTraBai(hopLe(), tinh, khac, THAN_DU + '\n![](anh:abc123)\n');
    expect(r1.loi.join('\n')).toMatch(/alt/);
    const r2 = kiemTraBai(hopLe(), tinh, khac, THAN_DU + '\n![Biển](https://x.test/a.jpg)\n');
    expect(r2.loi.join('\n')).toMatch(/anh:/);
    const ok = kiemTraBai(hopLe(), tinh, khac, THAN_DU + '\n![Biển sáng](anh:abc123)\n');
    expect(ok.loi).toEqual([]);
  });

  it('mã ảnh không có trên đĩa → lỗi nêu mã (ảnh bìa, ảnh địa điểm, ảnh trong thân)', () => {
    const co = new Set(['abc']);
    const bai = { ...hopLe(), diaDiem: [{ ten: 'A', kieu: 'quan-an', anh: [{ ma: 'thieu1', alt: 'x' }] }] };
    const r = kiemTraBai(bai, tinh, khac, THAN_DU + '\n![Biển](anh:thieu2)\n', (ma) => co.has(ma));
    const loi = r.loi.join('\n');
    expect(loi).toContain('thieu1');
    expect(loi).toContain('thieu2');
    expect(loi).not.toContain('"abc"');
  });

  it('gợi ý (không chặn đăng): tiêu đề dài, thân ngắn, thiếu link nội bộ, nhật ký thiếu ngayDi', () => {
    const { ngayDi: _n, ...khongNgayDi } = hopLe();
    const r = kiemTraBai({ ...khongNgayDi, tieuDe: 'T'.repeat(75) }, tinh, khac, 'Thân bài rất ngắn.');
    expect(r.dat).toBe(true);
    const g = r.goiY.join('\n');
    expect(g).toMatch(/tiêu đề/i);
    expect(g).toMatch(/300 từ/);
    expect(g).toMatch(/link nội bộ/i);
    expect(g).toMatch(/ngayDi/);
  });

  it('không gợi ý link nội bộ khi chưa có bài nào khác', () => {
    const r = kiemTraBai(hopLe(), tinh, [], tu(320));
    expect(r.goiY.join('\n')).not.toMatch(/link nội bộ/i);
  });
});
