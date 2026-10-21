// Chuyên mục (trang /chu-de/<slug>/): thêm, sửa, đổi slug, xoá (chuyển bài sang chuyên mục khác), đổi thứ tự.
import { SLUG_HE_THONG, slugHopLe, taoSlug, urlChuyenMuc } from '@vntraveltips/schema';
import type { Db } from '../db/ket-noi';
import { bienDoiDuLieuBai, themRedirectKhiDoiUrl } from './bai';
import { danhDauNoiDungDoi } from './phien-noi-dung';

export interface ChuyenMuc {
  slug: string;
  ten: string;
  moTa: string;
  anhBia?: { ma: string; alt: string };
  thuTu: number;
}

/** Lỗi nghiệp vụ có mã HTTP gợi ý (API chuyển thành phản hồi). */
export class LoiNghiepVu extends Error {
  constructor(
    message: string,
    public status = 400,
    public du: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

interface Dong { slug: string; ten: string; mo_ta: string; anh_bia: string | null; thu_tu: number }
const toCm = (r: Dong): ChuyenMuc => ({ slug: r.slug, ten: r.ten, moTa: r.mo_ta, ...(r.anh_bia ? { anhBia: JSON.parse(r.anh_bia) } : {}), thuTu: r.thu_tu });

export const lietKeChuyenMuc = (db: Db): ChuyenMuc[] =>
  (db.prepare('SELECT * FROM chuyen_muc ORDER BY thu_tu, slug').all() as Dong[]).map(toCm);
export const docChuyenMuc = (db: Db, slug: string): ChuyenMuc | null => {
  const r = db.prepare('SELECT * FROM chuyen_muc WHERE slug = ?').get(slug) as Dong | undefined;
  return r ? toCm(r) : null;
};

/** Số bài (mọi trạng thái, kể cả thùng rác) đang dùng một chuyên mục. */
export function demBaiTheoChuyenMuc(db: Db): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of db.prepare("SELECT du_lieu FROM ban_dich WHERE ngon_ngu = 'vi'").all() as { du_lieu: string }[]) {
    for (const c of ((JSON.parse(r.du_lieu) as { chuyenMuc?: string[] }).chuyenMuc ?? [])) m.set(c, (m.get(c) ?? 0) + 1);
  }
  return m;
}

/** Slug dùng cho trang hub: hợp lệ, không trùng đường dẫn hệ thống. */
function kiemTraSlug(slug: string): void {
  if (!slugHopLe(slug)) throw new LoiNghiepVu('Slug chỉ gồm a-z, 0-9 và dấu gạch ngang');
}
const kiemTraAnh = (a: unknown): string | null => {
  if (a === undefined || a === null) return null;
  const x = a as { ma?: unknown; alt?: unknown };
  if (typeof x.ma !== 'string' || !x.ma || typeof x.alt !== 'string' || !x.alt.trim()) throw new LoiNghiepVu('Ảnh bìa cần có mã ảnh và mô tả (alt)');
  return JSON.stringify({ ma: x.ma, alt: x.alt });
};
const kiemTraTen = (ten: unknown): string => {
  if (typeof ten !== 'string' || !ten.trim() || ten.length > 80) throw new LoiNghiepVu('Tên chuyên mục bắt buộc (tối đa 80 ký tự)');
  return ten.trim();
};

export function themChuyenMuc(db: Db, input: { ten: unknown; slug?: unknown; moTa?: unknown; anhBia?: unknown }): ChuyenMuc {
  const ten = kiemTraTen(input.ten);
  const slug = typeof input.slug === 'string' && input.slug ? input.slug : taoSlug(ten);
  kiemTraSlug(slug);
  if (SLUG_HE_THONG.includes(slug) || slug === 'trang') throw new LoiNghiepVu(`Slug "${slug}" trùng đường dẫn hệ thống`);
  if (docChuyenMuc(db, slug)) throw new LoiNghiepVu(`Chuyên mục "${slug}" đã có`, 409);
  const thuTu = ((db.prepare('SELECT coalesce(max(thu_tu), -1) AS m FROM chuyen_muc').get() as { m: number }).m) + 1;
  db.transaction(() => {
    db.prepare('INSERT INTO chuyen_muc (slug, ten, mo_ta, anh_bia, thu_tu) VALUES (?,?,?,?,?)').run(slug, ten, String(input.moTa ?? ''), kiemTraAnh(input.anhBia), thuTu);
    danhDauNoiDungDoi(db);
  })();
  return docChuyenMuc(db, slug)!;
}

export function suaChuyenMuc(db: Db, slug: string, input: { ten?: unknown; slug?: unknown; moTa?: unknown; anhBia?: unknown }): ChuyenMuc {
  const cu = docChuyenMuc(db, slug);
  if (!cu) throw new LoiNghiepVu('Không tìm thấy chuyên mục', 404);
  const moiSlug = typeof input.slug === 'string' && input.slug ? input.slug : slug;
  kiemTraSlug(moiSlug);
  if (moiSlug !== slug) {
    if (SLUG_HE_THONG.includes(moiSlug) || moiSlug === 'trang') throw new LoiNghiepVu(`Slug "${moiSlug}" trùng đường dẫn hệ thống`);
    if (docChuyenMuc(db, moiSlug)) throw new LoiNghiepVu(`Chuyên mục "${moiSlug}" đã có`, 409);
  }
  const ten = input.ten === undefined ? cu.ten : kiemTraTen(input.ten);
  const anh = input.anhBia === undefined ? (cu.anhBia ? JSON.stringify(cu.anhBia) : null) : kiemTraAnh(input.anhBia);
  db.transaction(() => {
    db.prepare('UPDATE chuyen_muc SET slug = ?, ten = ?, mo_ta = ?, anh_bia = ? WHERE slug = ?').run(moiSlug, ten, input.moTa === undefined ? cu.moTa : String(input.moTa), anh, slug);
    if (moiSlug !== slug) {
      // Đổi slug: mọi bài đổi sang slug mới và trang hub cũ chuyển hướng 301 sang trang mới.
      bienDoiDuLieuBai(db, (du) => {
        const ds = du.chuyenMuc as string[] | undefined;
        if (!ds?.includes(slug)) return false;
        du.chuyenMuc = [...new Set(ds.map((c) => (c === slug ? moiSlug : c)))];
        return true;
      });
      themRedirectKhiDoiUrl(db, urlChuyenMuc(slug), urlChuyenMuc(moiSlug));
    }
    danhDauNoiDungDoi(db);
  })();
  return docChuyenMuc(db, moiSlug)!;
}

export function xoaChuyenMuc(db: Db, slug: string, chuyenSang?: string): { daChuyen: number } {
  if (!docChuyenMuc(db, slug)) throw new LoiNghiepVu('Không tìm thấy chuyên mục', 404);
  const soBai = demBaiTheoChuyenMuc(db).get(slug) ?? 0;
  if (soBai > 0 && !chuyenSang) throw new LoiNghiepVu(`Còn ${soBai} bài đang dùng chuyên mục này. Hãy chọn chuyên mục để chuyển các bài sang.`, 409, { soBai });
  if (chuyenSang && (chuyenSang === slug || !docChuyenMuc(db, chuyenSang))) throw new LoiNghiepVu('Chuyên mục chuyển sang không hợp lệ');
  return db.transaction(() => {
    const daChuyen = bienDoiDuLieuBai(db, (du) => {
      const ds = du.chuyenMuc as string[] | undefined;
      if (!ds?.includes(slug)) return false;
      du.chuyenMuc = [...new Set(ds.flatMap((c) => (c === slug ? (chuyenSang ? [chuyenSang] : []) : [c])))];
      return true;
    });
    db.prepare('DELETE FROM chuyen_muc WHERE slug = ?').run(slug);
    // Trang hub cũ không còn: redirect nhắm vào nó (nếu có) không còn ý nghĩa.
    db.prepare('DELETE FROM redirect WHERE den = ?').run(urlChuyenMuc(slug));
    if (chuyenSang) themRedirectKhiDoiUrl(db, urlChuyenMuc(slug), urlChuyenMuc(chuyenSang));
    danhDauNoiDungDoi(db);
    return { daChuyen };
  })();
}

export function doiThuTuChuyenMuc(db: Db, slugs: string[]): void {
  const co = lietKeChuyenMuc(db).map((c) => c.slug).sort();
  if (slugs.length !== co.length || [...slugs].sort().some((s, i) => s !== co[i])) throw new LoiNghiepVu('Danh sách thứ tự phải gồm đúng và đủ các chuyên mục hiện có');
  db.transaction(() => {
    slugs.forEach((s, i) => db.prepare('UPDATE chuyen_muc SET thu_tu = ? WHERE slug = ?').run(i, s));
    danhDauNoiDungDoi(db);
  })();
}
