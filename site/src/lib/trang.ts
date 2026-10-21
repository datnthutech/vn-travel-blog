// Trang tĩnh lấy từ content collection `trang` (file trang/<slug>.md do MCP xuất; chưa có thì dùng 3 trang mẫu trong src/content/trang).
import { getCollection, type CollectionEntry } from 'astro:content';
import { TRANG_CO_DINH, urlTrang } from '@vntraveltips/schema';

export interface TrangTinh { slug: string; tieuDe: string; moTa: string; entry: CollectionEntry<'trang'> }

export async function layTrang(): Promise<TrangTinh[]> {
  return (await getCollection('trang')).map((e) => ({ slug: e.id, tieuDe: e.data.tieuDe, moTa: e.data.moTa, entry: e }));
}

export async function layTrangTheoSlug(slug: string): Promise<TrangTinh | undefined> {
  return (await layTrang()).find((t) => t.slug === slug);
}

/** Trang không cố định nằm ở /trang/<slug>/ (3 trang cố định có URL riêng). */
export const trangTuDo = async (): Promise<TrangTinh[]> => (await layTrang()).filter((t) => !(TRANG_CO_DINH as readonly string[]).includes(t.slug));
export { urlTrang };
