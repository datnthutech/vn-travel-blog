// Lấy bài viết/tỉnh từ content collections của Astro (chỉ chạy được trong Astro, không chạy trong vitest).
import { getCollection, type CollectionEntry } from 'astro:content';
import type { BaiViet, Tinh } from '@vntraveltips/schema';
import { buildTarget } from './build-target';
import { locBaiViet } from './loc-bai';

export async function layTinh(): Promise<Tinh[]> {
  return (await getCollection('tinh')).map((e) => e.data);
}

export async function layBaiViet(): Promise<BaiViet[]> {
  return (await layBaiVietDayDu()).map((x) => x.bai);
}

// Kèm entry gốc của Astro để trang gọi render() lấy phần nội dung Markdown.
export async function layBaiVietDayDu(): Promise<{ bai: BaiViet; entry: CollectionEntry<'bai-viet'> }[]> {
  const [entries, tinh] = await Promise.all([getCollection('bai-viet'), layTinh()]);
  const conLai = new Set(locBaiViet(entries.map((e) => e.data), tinh, buildTarget()).map((b) => b.slug));
  return entries.filter((e) => conLai.has(e.data.slug)).map((e) => ({ bai: e.data, entry: e }));
}
