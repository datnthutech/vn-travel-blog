// Slug cấp 1 (/<slug>/) dùng chung cho tỉnh và trang tĩnh: không được trùng đường dẫn hệ thống, không trùng nhau.
import { SLUG_HE_THONG, TRANG_CO_DINH } from '@vntraveltips/schema';
import type { Db } from '../db/ket-noi';
import { maNgonNguDaCo } from './ngon-ngu';

const coBang = (db: Db, ten: string) => db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(ten) !== undefined;

/** Slug của các trang tĩnh (cố định + do chủ blog tạo) — bảng `trang` có từ giai đoạn 3 task 5. */
export function slugTrang(db: Db): string[] {
  const them = coBang(db, 'trang') ? (db.prepare('SELECT slug FROM trang').all() as { slug: string }[]).map((r) => r.slug) : [];
  return [...new Set([...TRANG_CO_DINH, ...them])];
}

/** Lý do một slug TỈNH không dùng được (null = dùng được). `truSlug`: bỏ qua chính tỉnh đang sửa. */
export function lyDoSlugTinhKhongDung(db: Db, slug: string, truSlug?: string): string | null {
  if (SLUG_HE_THONG.includes(slug) || slug === 'trang') return `Slug "${slug}" trùng đường dẫn hệ thống`;
  if (maNgonNguDaCo(db).includes(slug)) return `Slug "${slug}" trùng mã một ngôn ngữ`;
  if (slugTrang(db).includes(slug)) return `Slug "${slug}" trùng một trang tĩnh`;
  if (slug !== truSlug && db.prepare('SELECT 1 FROM tinh WHERE slug = ?').get(slug)) return `Tỉnh "${slug}" đã có`;
  return null;
}
