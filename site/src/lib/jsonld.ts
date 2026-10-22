// Dữ liệu có cấu trúc schema.org (JSON-LD) để Google hiểu bài viết và hiện kết quả phong phú.
// Hàm thuần: nhận bài → trả mảng object; <SeoHead> chỉ việc nhúng vào <script type="application/ld+json">.
import { urlBai, type BaiViet, type DiaDiem, type Tinh } from '@vntraveltips/schema';
import { SITE } from '../config/site';
import { t } from '../i18n/giao-dien';

interface Ctx {
  site: string;
  tinh?: Pick<Tinh, 'ten' | 'slug'>;
  /** Ngôn ngữ của trang (mặc định vi): địa chỉ có tiền tố /<mã>/ và tên breadcrumb theo ngôn ngữ. */
  ngonNgu?: string;
}

const KIEU: Record<DiaDiem['kieu'], string> = {
  'cho-o': 'LodgingBusiness',
  'quan-an': 'Restaurant',
  cho: 'TouristAttraction',
  'khu-sinh-thai': 'TouristAttraction',
  'diem-choi': 'TouristAttraction',
};

const abs = (site: string, path: string) => new URL(path, site).toString();

function diaDiemLd(d: DiaDiem) {
  const o: Record<string, unknown> = { '@context': 'https://schema.org', '@type': KIEU[d.kieu], name: d.ten };
  if (d.diaChi) o.address = d.diaChi;
  if (d.toaDo) o.geo = { '@type': 'GeoCoordinates', latitude: d.toaDo.lat, longitude: d.toaDo.lng };
  if (d.diem) {
    o.review = {
      '@type': 'Review',
      reviewRating: { '@type': 'Rating', ratingValue: d.diem, bestRating: 5 },
      author: { '@type': 'Person', name: SITE.tacGia.ten },
    };
  }
  return o;
}

export function jsonLd(b: BaiViet, ctx: Ctx): object[] {
  const tien = !ctx.ngonNgu || ctx.ngonNgu === 'vi' ? '' : `/${ctx.ngonNgu}`;
  const ngonNgu = ctx.ngonNgu ?? 'vi';
  const url = abs(ctx.site, tien + urlBai(b));
  const out: object[] = [];

  out.push({
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    inLanguage: ngonNgu,
    headline: b.tieuDe,
    description: b.moTa,
    image: [abs(ctx.site, `/anh/${b.anhBia.ma}/1600.webp`)],
    datePublished: b.ngayDang.toISOString(),
    dateModified: (b.ngayCapNhat ?? b.ngayDang).toISOString(),
    mainEntityOfPage: url,
    author: { '@type': 'Person', name: SITE.tacGia.ten },
  });

  const dau = ctx.tinh
    ? { name: ctx.tinh.ten, item: abs(ctx.site, `${tien}/${ctx.tinh.slug}/`) }
    : { name: t(ngonNgu, 'kinh-nghiem'), item: abs(ctx.site, `${tien}/kinh-nghiem/`) };
  out.push({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { name: t(ngonNgu, 'trang-chu'), item: abs(ctx.site, `${tien}/`) },
      dau,
      { name: b.tieuDe, item: url },
    ].map((m, i) => ({ '@type': 'ListItem', position: i + 1, ...m })),
  });

  out.push({ '@context': 'https://schema.org', '@type': 'Person', name: SITE.tacGia.ten, url: abs(ctx.site, '/gioi-thieu/') });

  for (const d of b.diaDiem) out.push(diaDiemLd(d));

  if (b.loai === 'top-list' && b.diaDiem.length > 0) {
    out.push({
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: b.tieuDe,
      itemListElement: b.diaDiem.map((d, i) => ({ '@type': 'ListItem', position: i + 1, name: d.ten })),
    });
  }

  if (b.faq.length > 0) {
    out.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: b.faq.map((f) => ({
        '@type': 'Question',
        name: f.hoi,
        acceptedAnswer: { '@type': 'Answer', text: f.dap },
      })),
    });
  }

  return out;
}

// Viết JSON-LD vào <script type="application/ld+json"> an toàn: JSON.stringify không thoát "<", nên tiêu đề chứa
// "</script>" sẽ đóng thẻ sớm và chèn được mã. Đổi < > & và U+2028/2029 thành \uXXXX — vẫn là JSON hợp lệ, cùng dữ liệu.
export function jsonLdChoScript(o: unknown): string {
  return JSON.stringify(o)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

