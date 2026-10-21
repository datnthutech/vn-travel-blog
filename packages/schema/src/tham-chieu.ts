// Những luật mà một mình schema zod không kiểm được vì cần nhìn nhiều bài cùng lúc.
import type { BaiViet } from './bai-viet';
import type { Tinh } from './tinh';

// Đường dẫn cấp 1 do hệ thống dùng; slug tỉnh trùng sẽ đè lên các trang này (vì /[tinh]/ là route động).
export const SLUG_HE_THONG = [
  'kinh-nghiem', 'chu-de', 'loai', 'admin', 'quan-tri', 'api', 'anh', 'mcp', 'tai-anh', 'oauth',
  'tim-kiem', 'gioi-thieu', 'chinh-sach-lien-ket', 'rss.xml', 'sitemap-index.xml', 'robots.txt', '404',
];

/** `chuyenMuc`: danh sách chuyên mục hiện có; nếu truyền thì mỗi bài chỉ được dùng chuyên mục nằm trong đó. */
export function kiemTraThamChieu(
  bai: (Pick<BaiViet, 'slug' | 'tinh'> & { chuyenMuc?: string[] })[],
  tinh: Pick<Tinh, 'slug'>[],
  chuyenMuc?: { slug: string }[],
  maNgonNgu: string[] = [],
): string[] {
  const loi: string[] = [];
  for (const t of tinh) {
    if (SLUG_HE_THONG.includes(t.slug)) loi.push(`Slug tỉnh "${t.slug}" trùng đường dẫn hệ thống`);
    if (maNgonNgu.includes(t.slug)) loi.push(`Slug tỉnh "${t.slug}" trùng mã một ngôn ngữ`);
  }
  const cacTinh = new Set(tinh.map((t) => t.slug));
  const daThay = new Set<string>();
  for (const b of bai) {
    if (b.tinh && !cacTinh.has(b.tinh)) loi.push(`Bài "${b.slug}": tỉnh "${b.tinh}" không tồn tại`);
    if (chuyenMuc) {
      const co = new Set(chuyenMuc.map((c) => c.slug));
      for (const m of b.chuyenMuc ?? []) if (!co.has(m)) loi.push(`Bài "${b.slug}": chuyên mục "${m}" không tồn tại`);
    }
    if (daThay.has(b.slug)) loi.push(`Slug "${b.slug}" bị trùng`);
    daThay.add(b.slug);
  }
  return loi;
}
