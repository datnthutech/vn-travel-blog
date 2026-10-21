import { describe, expect, it } from 'vitest';
import { baiVietSchema } from '@vntraveltips/schema';
import { parseBai, serializeBai } from './serialize';

const bai = baiVietSchema.parse({
  tieuDe: 'Vũng Tàu: căn hộ, “bánh canh” & bề bề — cùng bé',
  slug: 'vung-tau-can-ho',
  moTa: 'Đây là mô tả có dấu tiếng Việt: ăn, ở, đi lại cùng bé nhỏ. '.repeat(3).slice(0, 150),
  loai: 'nhat-ky',
  tinh: 'vung-tau',
  chuyenMuc: ['an-uong'],
  anhBia: { ma: 'abc123', alt: 'Bãi biển buổi sáng' },
  ngayDi: '2026-10-10',
  ngayDang: '2026-10-19',
  traNhanh: {
    hopVoi: 'Gia đình có bé 1–5 tuổi', thoiGian: '2 ngày 1 đêm', tongChiPhi: 3000000, soNguoi: 3,
    diemThanThienVoiBe: 4, diChuyen: 'Xe riêng', thoiDiemNenDi: 'Tháng 11', luuYVoiBe: ['Áo phao: nhớ mang', '# không phải tiêu đề'],
  },
  diaDiem: [{ ten: 'Quán “A”: bánh canh', kieu: 'quan-an', diem: 5, uuDiem: ['Ngon', 'Rẻ: 60k'] }],
  faq: [{ hoi: 'Có tiện không?', dap: 'Có — rất tiện.\nDòng hai.' }],
  draft: true,
});
const THAN = '## Chuẩn bị\n\nNội dung có `code`, dấu --- ở giữa:\n\n---\n\nvà tiếng Việt: đường, ơn, ữ.\n';

describe('serializeBai / parseBai', () => {
  it('vòng tròn không mất dữ liệu (kể cả tiếng Việt, dấu : # --- trong chuỗi)', () => {
    const text = serializeBai(bai, THAN);
    const lai = parseBai(text);
    expect(lai.bai).toEqual(bai);
    expect(lai.noiDung).toBe(THAN);
  });

  it('frontmatter mở đầu bằng --- và ngày ghi dạng YYYY-MM-DD', () => {
    const text = serializeBai(bai, THAN);
    expect(text.startsWith('---\n')).toBe(true);
    expect(text).toMatch(/ngayDang: 2026-10-19\n/);
    expect(text).toMatch(/ngayDi: 2026-10-10\n/);
  });

  it('thân bài rỗng vẫn parse được', () => {
    expect(parseBai(serializeBai(bai, '')).noiDung).toBe('');
  });

  it('thiếu frontmatter → ném lỗi rõ ràng', () => {
    expect(() => parseBai('chỉ có nội dung')).toThrow(/frontmatter/);
  });

  it('frontmatter sai schema → ném lỗi nêu trường', () => {
    const hong = serializeBai(bai, THAN).replace('slug: vung-tau-can-ho', 'slug: Vũng Tàu');
    expect(() => parseBai(hong)).toThrow(/slug/);
  });
});
