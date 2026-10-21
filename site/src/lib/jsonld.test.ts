import { describe, expect, it } from 'vitest';
import { baiVietSchema, type BaiViet, type Tinh } from '@vntraveltips/schema';
import { jsonLd } from './jsonld';

const moTa = 'a'.repeat(130);
const tinh = { ten: 'Vũng Tàu', slug: 'vung-tau' } as Tinh;
const ctx = { site: 'https://vntraveltips.monai.click', tinh };

const bai = (over: Record<string, unknown> = {}): BaiViet =>
  baiVietSchema.parse({
    tieuDe: 'Vũng Tàu 2 ngày 1 đêm',
    slug: 'vung-tau-2n1d',
    moTa,
    loai: 'nhat-ky',
    tinh: 'vung-tau',
    anhBia: { ma: 'bien', alt: 'Biển' },
    ngayDang: '2026-10-19',
    traNhanh: {
      hopVoi: 'x', thoiGian: 'y', tongChiPhi: 1, soNguoi: 1, diemThanThienVoiBe: 3, diChuyen: 'z', thoiDiemNenDi: 't',
    },
    ...over,
  });

const loai = (arr: object[]) => arr.map((o) => (o as { '@type': string })['@type']);

describe('jsonLd', () => {
  it('mọi bài có BlogPosting + BreadcrumbList + Person', () => {
    const t = loai(jsonLd(bai(), ctx));
    expect(t).toContain('BlogPosting');
    expect(t).toContain('BreadcrumbList');
    expect(t).toContain('Person');
  });

  it('BlogPosting trỏ đúng URL canonical và ảnh bìa', () => {
    const bp = jsonLd(bai(), ctx).find((o) => (o as any)['@type'] === 'BlogPosting') as any;
    expect(bp.mainEntityOfPage).toBe('https://vntraveltips.monai.click/vung-tau/vung-tau-2n1d/');
    expect(bp.image[0]).toBe('https://vntraveltips.monai.click/anh/bien/1600.webp');
    expect(bp.headline).toBe('Vũng Tàu 2 ngày 1 đêm');
  });

  it('diaDiem có điểm → Review; không điểm → không Review', () => {
    const co = bai({ diaDiem: [{ ten: 'Căn hộ A', kieu: 'cho-o', diem: 4 }] });
    const khong = bai({ diaDiem: [{ ten: 'Căn hộ A', kieu: 'cho-o' }] });
    const jCo = JSON.stringify(jsonLd(co, ctx));
    const jKhong = JSON.stringify(jsonLd(khong, ctx));
    expect(jCo).toContain('"Review"');
    expect(jCo).toContain('LodgingBusiness');
    expect(jKhong).not.toContain('"Review"');
    expect(jKhong).toContain('LodgingBusiness');
  });

  it('kiểu địa điểm ánh xạ đúng loại schema.org', () => {
    const b = bai({
      diaDiem: [
        { ten: 'Quán', kieu: 'quan-an' },
        { ten: 'Khu sinh thái', kieu: 'khu-sinh-thai' },
        { ten: 'Chợ', kieu: 'cho' },
      ],
    });
    expect(loai(jsonLd(b, ctx))).toEqual(
      expect.arrayContaining(['Restaurant', 'TouristAttraction']),
    );
  });

  it('faq rỗng → không FAQPage; có faq → có FAQPage', () => {
    expect(loai(jsonLd(bai(), ctx))).not.toContain('FAQPage');
    const co = jsonLd(bai({ faq: [{ hoi: 'Q?', dap: 'A' }] }), ctx);
    expect(loai(co)).toContain('FAQPage');
  });

  it('bài không tỉnh → breadcrumb không có tỉnh, URL /kinh-nghiem/', () => {
    const b = bai({ tinh: undefined, loai: 'cam-nang', traNhanh: undefined });
    const out = jsonLd(b, { site: ctx.site });
    const bc = out.find((o) => (o as any)['@type'] === 'BreadcrumbList') as any;
    expect(bc.itemListElement.map((i: any) => i.name)).toEqual(['Trang chủ', 'Kinh nghiệm', b.tieuDe]);
    const bp = out.find((o) => (o as any)['@type'] === 'BlogPosting') as any;
    expect(bp.mainEntityOfPage).toBe('https://vntraveltips.monai.click/kinh-nghiem/vung-tau-2n1d/');
  });

  it('ItemList chỉ cho top-list có địa điểm', () => {
    const top = bai({ loai: 'top-list', diaDiem: [{ ten: 'A', kieu: 'diem-choi' }, { ten: 'B', kieu: 'diem-choi' }] });
    const il = jsonLd(top, ctx).find((o) => (o as any)['@type'] === 'ItemList') as any;
    expect(il.itemListElement).toHaveLength(2);
    expect(il.itemListElement[1].position).toBe(2);
    expect(loai(jsonLd(bai(), ctx))).not.toContain('ItemList');
    expect(loai(jsonLd(bai({ loai: 'top-list', diaDiem: [] }), ctx))).not.toContain('ItemList');
  });
});
