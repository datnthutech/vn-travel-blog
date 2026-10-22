// Trang tĩnh đã dịch (trang-dich/<mã>/<slug>.md): `slugGoc` = slug trang tiếng Việt (tên file là slug đã dịch).
import { getCollection, type CollectionEntry } from 'astro:content';

export interface TrangDich { slugGoc: string; slug: string; tieuDe: string; moTa: string; entry: CollectionEntry<'trang-dich'> }

export async function layTrangDich(ngonNgu: string): Promise<TrangDich[]> {
  return (await getCollection('trang-dich', (e) => e.id.startsWith(`${ngonNgu}/`))).map((e) => ({
    slugGoc: e.data.slugGoc,
    slug: e.id.slice(ngonNgu.length + 1).replace(/\.md$/, ''),
    tieuDe: e.data.tieuDe,
    moTa: e.data.moTa,
    entry: e,
  }));
}
