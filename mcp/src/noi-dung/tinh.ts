// Tỉnh (trang hub /<slug>/): thêm, sửa, đổi slug (301 cho hub và MỌI bài đã đăng), xoá (chuyển bài sang tỉnh khác hoặc bỏ tỉnh).
import { slugHopLe, taoSlug, tinhSchema, urlBai, urlTinh, type Tinh } from '@vntraveltips/schema';
import type { Db } from '../db/ket-noi';
import { bienDoiDuLieuBai, themRedirectKhiDoiUrl } from './bai';
import { LoiNghiepVu } from './chuyen-muc';
import { danhDauNoiDungDoi } from './phien-noi-dung';
import { lyDoSlugTinhKhongDung } from './slug-cap-1';

export const lietKeTinh = (db: Db): Tinh[] =>
  (db.prepare('SELECT du_lieu FROM tinh ORDER BY slug').all() as { du_lieu: string }[]).map((r) => JSON.parse(r.du_lieu) as Tinh);
export const docTinh = (db: Db, slug: string): Tinh | null => {
  const r = db.prepare('SELECT du_lieu FROM tinh WHERE slug = ?').get(slug) as { du_lieu: string } | undefined;
  return r ? (JSON.parse(r.du_lieu) as Tinh) : null;
};

/** Số bài (mọi trạng thái, kể cả thùng rác) theo tỉnh. */
export function demBaiTheoTinh(db: Db): Map<string, number> {
  return new Map((db.prepare('SELECT tinh, count(*) AS n FROM bai WHERE tinh IS NOT NULL GROUP BY tinh').all() as { tinh: string; n: number }[]).map((r) => [r.tinh, r.n]));
}

function kiemTra(input: unknown): Tinh {
  const kq = tinhSchema.safeParse(input);
  if (!kq.success) throw new LoiNghiepVu('Dữ liệu tỉnh không hợp lệ', 400, { chiTiet: kq.error.issues.map((i) => `${i.path.join('.') || '(gốc)'}: ${i.message}`) });
  return kq.data;
}

export function themTinh(db: Db, input: Record<string, unknown>): Tinh {
  const slug = typeof input.slug === 'string' && input.slug ? input.slug : typeof input.ten === 'string' ? taoSlug(input.ten) : '';
  if (!slugHopLe(slug)) throw new LoiNghiepVu('Slug chỉ gồm a-z, 0-9 và dấu gạch ngang');
  const ly = lyDoSlugTinhKhongDung(db, slug);
  if (ly) throw new LoiNghiepVu(ly, ly.endsWith('đã có') ? 409 : 400);
  const t = kiemTra({ ...input, slug });
  db.transaction(() => {
    db.prepare('INSERT INTO tinh (slug, du_lieu) VALUES (?, ?)').run(slug, JSON.stringify(t));
    danhDauNoiDungDoi(db);
  })();
  return t;
}

/** Id các bài ĐÃ ĐĂNG (chưa vào thùng rác) của một tỉnh, kèm slug bài. */
function baiDaDangCuaTinh(db: Db, tinh: string): { id: number; slug: string }[] {
  return db
    .prepare("SELECT b.id, d.slug FROM bai b JOIN ban_dich d ON d.bai_id = b.id WHERE b.tinh = ? AND d.ngon_ngu = 'vi' AND d.trang_thai = 'da-dang' AND b.xoa_luc IS NULL")
    .all(tinh) as { id: number; slug: string }[];
}

export function suaTinh(db: Db, slug: string, input: Record<string, unknown>): Tinh {
  const cu = docTinh(db, slug);
  if (!cu) throw new LoiNghiepVu('Không tìm thấy tỉnh', 404);
  const moiSlug = typeof input.slug === 'string' && input.slug ? input.slug : slug;
  if (!slugHopLe(moiSlug)) throw new LoiNghiepVu('Slug chỉ gồm a-z, 0-9 và dấu gạch ngang');
  if (moiSlug !== slug) {
    const ly = lyDoSlugTinhKhongDung(db, moiSlug, slug);
    if (ly) throw new LoiNghiepVu(ly, ly.endsWith('đã có') ? 409 : 400);
  }
  const t = kiemTra({ ...cu, ...input, slug: moiSlug });
  db.transaction(() => {
    const dangDang = moiSlug !== slug ? baiDaDangCuaTinh(db, slug) : [];
    if (moiSlug !== slug) {
      db.prepare('DELETE FROM tinh WHERE slug = ?').run(slug);
      bienDoiDuLieuBai(db, (du) => {
        if (du.tinh !== slug) return false;
        du.tinh = moiSlug;
        return true;
      });
      // Hub cũ và MỌI bài đã đăng của tỉnh: 301 sang địa chỉ mới.
      themRedirectKhiDoiUrl(db, urlTinh(slug), urlTinh(moiSlug));
      for (const b of dangDang) themRedirectKhiDoiUrl(db, urlBai({ slug: b.slug, tinh: slug }), urlBai({ slug: b.slug, tinh: moiSlug }));
    }
    db.prepare('INSERT OR REPLACE INTO tinh (slug, du_lieu) VALUES (?, ?)').run(moiSlug, JSON.stringify(t));
    danhDauNoiDungDoi(db);
  })();
  return t;
}

/** `chuyenSang`: slug tỉnh nhận bài, hoặc '' = bỏ tỉnh (URL bài thành /kinh-nghiem/…). undefined = chưa chọn. */
export function xoaTinh(db: Db, slug: string, chuyenSang?: string): { daChuyen: number } {
  if (!docTinh(db, slug)) throw new LoiNghiepVu('Không tìm thấy tỉnh', 404);
  const soBai = demBaiTheoTinh(db).get(slug) ?? 0;
  if (soBai > 0 && chuyenSang === undefined) throw new LoiNghiepVu(`Còn ${soBai} bài thuộc tỉnh này. Hãy chọn tỉnh để chuyển bài sang (hoặc bỏ tỉnh để bài thành "kinh nghiệm chung").`, 409, { soBai });
  if (chuyenSang && (chuyenSang === slug || !docTinh(db, chuyenSang))) throw new LoiNghiepVu('Tỉnh chuyển sang không hợp lệ');
  return db.transaction(() => {
    const dangDang = baiDaDangCuaTinh(db, slug);
    const daChuyen = bienDoiDuLieuBai(db, (du) => {
      if (du.tinh !== slug) return false;
      if (chuyenSang) du.tinh = chuyenSang;
      else delete du.tinh;
      return true;
    });
    db.prepare('DELETE FROM tinh WHERE slug = ?').run(slug);
    for (const b of dangDang) themRedirectKhiDoiUrl(db, urlBai({ slug: b.slug, tinh: slug }), urlBai({ slug: b.slug, tinh: chuyenSang || undefined }));
    // Trỏ lại redirect cũ sang hub mới TRƯỚC khi bỏ những redirect nhắm vào hub đã mất (không có tỉnh nhận).
    if (chuyenSang) themRedirectKhiDoiUrl(db, urlTinh(slug), urlTinh(chuyenSang));
    else db.prepare('DELETE FROM redirect WHERE den = ?').run(urlTinh(slug));
    danhDauNoiDungDoi(db);
    return { daChuyen };
  })();
}
