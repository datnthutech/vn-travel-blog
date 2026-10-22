import { describe, expect, it } from 'vitest';
import type { BanDichChu } from '@vntraveltips/schema';
import { kiemTraBanDich } from './kiem-tra-ban-dich';

const goc: BanDichChu = {
  tieuDe: 'Tiêu đề', slug: 'tieu-de', moTa: 'a'.repeat(130), anhBiaAlt: 'Biển',
  noiDung: 'Mở đầu ![biển](anh:demobien) và ![quán](anh:quan1) xem [bài khác](/da-nang/bai-b/) và [Agoda](https://agoda.com/x).',
  traNhanh: { hopVoi: 'a', thoiGian: 'b', diChuyen: 'c', thoiDiemNenDi: 'd', luuYVoiBe: ['x', 'y'] },
  diaDiem: [{ ten: 'A', uuDiem: ['u1'], nhuocDiem: [], anhAlt: ['alt1', 'alt2'] }],
  doMangChoBe: [{ ten: 'Áo phao' }],
  faq: [{ hoi: 'h', dap: 'd' }],
};
const tot = { ...goc, tieuDe: 'Title', noiDung: goc.noiDung.replace('Mở đầu', 'Intro').replace('biển', 'sea').replace('quán', 'shop') };

describe('kiemTraBanDich', () => {
  it('bản dịch đúng cấu trúc → không cảnh báo', () => {
    expect(kiemTraBanDich(goc, tot)).toEqual([]);
  });

  it('mất ảnh anh:MÃ → cảnh báo nêu đúng mã ảnh (Review Focus); thêm ảnh lạ → cảnh báo', () => {
    const w = kiemTraBanDich(goc, { ...tot, noiDung: tot.noiDung.replace('![sea](anh:demobien)', 'a picture') });
    expect(w).toHaveLength(1);
    expect(w[0]).toMatch(/MẤT ảnh.*demobien/);
    expect(kiemTraBanDich(goc, { ...tot, noiDung: `${tot.noiDung} ![x](anh:la)` }).join(' ')).toMatch(/LẠ.*la/);
  });

  it('đổi mã ảnh (dịch luôn cả mã) hoặc đổi/mất link → cảnh báo', () => {
    expect(kiemTraBanDich(goc, { ...tot, noiDung: tot.noiDung.replace('anh:quan1', 'anh:shop1') }).join(' ')).toMatch(/quan1.*shop1|shop1.*quan1/s);
    const w = kiemTraBanDich(goc, { ...tot, noiDung: tot.noiDung.replace('https://agoda.com/x', 'https://agoda.com/y').replace('/da-nang/bai-b/', '/en/da-nang/bai-b/') });
    expect(w.join(' ')).toMatch(/MẤT hoặc đổi link.*agoda\.com\/x/);
    expect(w.join(' ')).toMatch(/link LẠ/);
  });

  it('số phần tử mảng khác gốc (địa điểm, đồ mang, FAQ, lưu ý, alt ảnh, ưu điểm) → cảnh báo nêu tên mảng', () => {
    const w = kiemTraBanDich(goc, { ...tot, faq: [], doMangChoBe: [], traNhanh: { ...goc.traNhanh!, luuYVoiBe: ['x'] }, diaDiem: [{ ...goc.diaDiem[0]!, anhAlt: ['chi 1'], uuDiem: [] }] });
    const s = w.join('\n');
    for (const t of ['faq', 'doMangChoBe', 'traNhanh.luuYVoiBe', 'diaDiem[0].anhAlt', 'diaDiem[0].uuDiem']) expect(s, t).toContain(t);
    expect(kiemTraBanDich(goc, { ...tot, diaDiem: [] }).join(' ')).toMatch(/"diaDiem".*gốc 1, bản dịch 0/);
  });

  it('moTa ngoài 120–160 ký tự và thiếu traNhanh → cảnh báo', () => {
    expect(kiemTraBanDich(goc, { ...tot, moTa: 'ngắn' }).join(' ')).toMatch(/moTa.*dài 4/);
    expect(kiemTraBanDich(goc, { ...tot, moTa: 'a'.repeat(161) }).join(' ')).toMatch(/161/);
    expect(kiemTraBanDich(goc, { ...tot, traNhanh: undefined }).join(' ')).toMatch(/Tra nhanh/);
  });
});
