// Lấy bài viết/tỉnh từ content collections của Astro (chỉ chạy được trong Astro, không chạy trong vitest).
// `ngonNgu` mặc định 'vi'; ngôn ngữ khác lấy từ collection bai-viet-dich (file bai-viet/<mã>/<slug>.md).
import { getCollection, type CollectionEntry } from 'astro:content';
import type { BaiViet, Tinh } from '@vntraveltips/schema';
import { buildTarget } from './build-target';
import { layChuyenMuc } from './chuyen-muc';
import { locBaiViet } from './loc-bai';

export async function layTinh(): Promise<Tinh[]> {
  return (await getCollection('tinh')).map((e) => e.data);
}

export async function layBaiViet(ngonNgu = 'vi'): Promise<BaiViet[]> {
  return (await layBaiVietDayDu(ngonNgu)).map((x) => x.bai);
}

// Kèm entry gốc của Astro để trang gọi render() lấy phần nội dung Markdown.
export async function layBaiVietDayDu(ngonNgu = 'vi'): Promise<{ bai: BaiViet; entry: CollectionEntry<'bai-viet'> }[]> {
  const [entries, tinh] = await Promise.all([
    ngonNgu === 'vi' ? getCollection('bai-viet') : getCollection('bai-viet-dich', (e) => e.data.ngonNgu === ngonNgu),
    layTinh(),
  ]);
  const conLai = new Set(locBaiViet(entries.map((e) => e.data), tinh, buildTarget(), layChuyenMuc()).map((b) => b.slug));
  return entries.filter((e) => conLai.has(e.data.slug)).map((e) => ({ bai: e.data, entry: e as CollectionEntry<'bai-viet'> }));
}
