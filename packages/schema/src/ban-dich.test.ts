import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { banDichChuSchema, baiVietSchema, bamBanGoc, ghepBanDich, sha256Hex, tachTruongChu, type BaiViet } from './index';

const goc: BaiViet = baiVietSchema.parse({
  tieuDe: 'Vũng Tàu 2 ngày 1 đêm cùng bé',
  slug: 'vung-tau-2n1d',
  moTa: 'a'.repeat(130),
  loai: 'nhat-ky',
  tinh: 'vung-tau',
  chuyenMuc: ['an-uong'],
  tags: ['bien'],
  anhBia: { ma: 'abc123', alt: 'Bãi biển buổi sáng' },
  ngayDi: '2026-10-10',
  ngayDang: '2026-10-19',
  traNhanh: { hopVoi: 'Gia đình có bé', thoiGian: '2 ngày 1 đêm', choO: 'Căn hộ view biển', tongChiPhi: 3000000, soNguoi: 3, diemThanThienVoiBe: 4, diChuyen: 'Xe riêng', thoiDiemNenDi: 'Tháng 11', luuYVoiBe: ['Mang áo phao'] },
  diaDiem: [
    { ten: 'Quán A', kieu: 'quan-an', diaChi: '1 Hạ Long', toaDo: { lat: 10.3, lng: 107.1 }, khoangGia: '100–200k', gioMoCua: '7h–21h', thanThienVoiBe: 'Có ghế ăn dặm', diem: 4, uuDiem: ['Ngon'], nhuocDiem: ['Đông'], anh: [{ ma: 'a1', alt: 'Món A' }, { ma: 'a2', alt: 'Quán A' }], linkDat: { nhaCungCap: 'khac', url: 'https://x.vn' } },
    { ten: 'Chợ B', kieu: 'cho', uuDiem: [], nhuocDiem: [], anh: [] },
    { ten: 'Khách sạn C', kieu: 'cho-o', uuDiem: ['Gần biển'], nhuocDiem: [], anh: [{ ma: 'c1', alt: 'Phòng' }] },
  ],
  doMangChoBe: [{ ten: 'Áo phao', ghiChu: 'Size S', link: 'https://shop.vn/ao' }, { ten: 'Mũ' }],
  faq: [{ hoi: 'Đi mùa nào?', dap: 'Tháng 11' }],
  hopTac: true,
  draft: false,
});
const NOI_DUNG = 'Chào ![biển](anh:abc123) xem [link](https://x.vn)';

describe('tachTruongChu / ghepBanDich', () => {
  it('ghép(gốc, tách(gốc)) deep-equal gốc và hợp lệ qua baiVietSchema', () => {
    const t = tachTruongChu(goc, NOI_DUNG);
    expect(banDichChuSchema.safeParse(t).success).toBe(true);
    const g = ghepBanDich(goc, t);
    expect(g).toStrictEqual(goc);
    expect(baiVietSchema.safeParse(g).success).toBe(true);
  });

  it('tách chỉ lấy TRƯỜNG CHỮ; số, toạ độ, link, ảnh (mã), tỉnh… không có trong bản dịch', () => {
    const t = tachTruongChu(goc, NOI_DUNG);
    const json = JSON.stringify(t);
    for (const khongPhaiChu of ['tongChiPhi', 'toaDo', 'linkDat', 'shop.vn', '"ma"', 'a1', 'vung-tau"', 'tags', 'ngayDang']) expect(json, khongPhaiChu).not.toContain(khongPhaiChu);
    expect(t.diaDiem.map((d) => d.anhAlt.length)).toEqual([2, 0, 1]);
  });

  it('bản dịch: ghép giữ trường không phải chữ của gốc, thay trường chữ và slug', () => {
    const t = tachTruongChu(goc, NOI_DUNG);
    const dich = { ...t, tieuDe: 'Vung Tau trip', slug: 'vung-tau-trip', diaDiem: t.diaDiem.map((d) => ({ ...d, ten: `${d.ten} (en)`, anhAlt: d.anhAlt.map((a) => `${a} en`) })), anhBiaAlt: 'Morning beach' };
    const g = ghepBanDich(goc, dich);
    expect(g).toMatchObject({ tieuDe: 'Vung Tau trip', slug: 'vung-tau-trip', tinh: 'vung-tau', hopTac: true });
    expect(g.anhBia).toEqual({ ma: 'abc123', alt: 'Morning beach' });
    expect(g.diaDiem[0]).toMatchObject({ ten: 'Quán A (en)', toaDo: { lat: 10.3, lng: 107.1 }, diem: 4, linkDat: { nhaCungCap: 'khac', url: 'https://x.vn' } });
    expect(g.diaDiem[0]!.anh).toEqual([{ ma: 'a1', alt: 'Món A en' }, { ma: 'a2', alt: 'Quán A en' }]);
    expect(g.traNhanh).toMatchObject({ tongChiPhi: 3000000, soNguoi: 3, diemThanThienVoiBe: 4 });
    expect(g.doMangChoBe[0]).toEqual({ ten: 'Áo phao', ghiChu: 'Size S', link: 'https://shop.vn/ao' });
    expect(baiVietSchema.safeParse(g).success).toBe(true);
  });

  it('bản dịch có 2 địa điểm khi gốc có 3 → ném lỗi nêu `diaDiem`; số ảnh alt lệch → nêu `anhAlt`; đồ mang lệch → nêu `doMangChoBe`', () => {
    const t = tachTruongChu(goc, NOI_DUNG);
    expect(() => ghepBanDich(goc, { ...t, diaDiem: t.diaDiem.slice(0, 2) })).toThrow(/diaDiem/);
    expect(() => ghepBanDich(goc, { ...t, diaDiem: t.diaDiem.map((d, i) => (i === 0 ? { ...d, anhAlt: ['chỉ một'] } : d)) })).toThrow(/diaDiem\[0\]\.anhAlt/);
    expect(() => ghepBanDich(goc, { ...t, doMangChoBe: [] })).toThrow(/doMangChoBe/);
  });

  it('gốc có traNhanh mà bản dịch thiếu → lỗi nêu traNhanh', () => {
    const { traNhanh: _b, ...khongTn } = tachTruongChu(goc, NOI_DUNG);
    expect(() => ghepBanDich(goc, khongTn as never)).toThrow(/traNhanh/);
  });
});

describe('bamBanGoc — bản dịch cũ hơn bản gốc', () => {
  it('sửa khoangGia (chữ) → băm đổi; sửa toaDo, giá số, ảnh (không phải chữ) → băm KHÔNG đổi', () => {
    const b0 = bamBanGoc(goc, NOI_DUNG);
    const sua = (f: (b: BaiViet) => void) => {
      const c = structuredClone(goc);
      f(c);
      return bamBanGoc(c, NOI_DUNG);
    };
    expect(sua((b) => (b.diaDiem[0]!.khoangGia = '300k'))).not.toBe(b0);
    expect(sua((b) => (b.tieuDe = 'Khác'))).not.toBe(b0);
    expect(bamBanGoc(goc, `${NOI_DUNG} thêm`)).not.toBe(b0);
    expect(sua((b) => (b.diaDiem[0]!.toaDo = { lat: 1, lng: 2 }))).toBe(b0);
    expect(sua((b) => (b.traNhanh!.tongChiPhi = 1))).toBe(b0);
    expect(sua((b) => (b.diaDiem[0]!.anh[0]!.ma = 'khac'))).toBe(b0);
    expect(sua((b) => (b.tags = ['x']))).toBe(b0);
  });

  it('xuống dòng CRLF/LF và khoảng trắng đầu-cuối không làm đổi băm; băm là hex 64 ký tự', () => {
    expect(bamBanGoc(goc, 'a\r\nb ')).toBe(bamBanGoc(goc, 'a\nb'));
    expect(bamBanGoc(goc, NOI_DUNG)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('sha256Hex (bản thuần JS để chạy cả trong trình duyệt)', () => {
  it('khớp node:crypto với chuỗi rỗng, ngắn, dài, tiếng Việt, qua ranh giới khối 55/56/64 byte', () => {
    for (const s of ['', 'abc', 'Vũng Tàu cùng bé 🌊', 'x'.repeat(55), 'x'.repeat(56), 'x'.repeat(64), 'y'.repeat(1000)]) {
      expect(sha256Hex(s), s.slice(0, 10)).toBe(createHash('sha256').update(s).digest('hex'));
    }
  });
});
