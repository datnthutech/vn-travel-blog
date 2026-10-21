// Dữ liệu có cấu trúc schema.org (JSON-LD) để Google hiểu bài viết và hiện kết quả phong phú.
// Hàm thuần: nhận bài → trả mảng object; <SeoHead> chỉ việc nhúng vào <script type="application/ld+json">.
import { urlBai, type BaiViet, type DiaDiem, type Tinh } from '@vntraveltips/schema';
import { SITE } from '../config/site';

interface Ctx {
  site: string;
  tinh?: Pick<Tinh, 'ten' | 'slug'>;
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
  const url = abs(ctx.site, urlBai(b));
  const out: object[] = [];

  out.push({
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: b.tieuDe,
    description: b.moTa,
    image: [abs(ctx.site, `/anh/${b.anhBia.ma}/1600.webp`)],
    datePublished: b.ngayDang.toISOString(),
    dateModified: (b.ngayCapNhat ?? b.ngayDang).toISOString(),
    mainEntityOfPage: url,
    author: { '@type': 'Person', name: SITE.tacGia.ten },
  });

  const dau = ctx.tinh
    ? { name: ctx.tinh.ten, item: abs(ctx.site, `/${ctx.tinh.slug}/`) }
    : { name: 'Kinh nghiệm', item: abs(ctx.site, '/kinh-nghiem/') };
  out.push({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { name: 'Trang chủ', item: abs(ctx.site, '/') },
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
