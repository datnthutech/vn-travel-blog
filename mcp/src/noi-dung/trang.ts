// Trang tĩnh (giới thiệu, chính sách liên kết, liên hệ + trang chủ blog tự tạo ở /trang/<slug>/).
// 3 trang cố định giữ URL cũ, không xoá/đổi slug/gỡ được. Có tự lưu + lịch sử phiên bản như bài.
import { SLUG_HE_THONG, slugHopLe, taoSlug, urlTrang } from '@vntraveltips/schema';
import type { Db } from '../db/ket-noi';
import { themRedirectKhiDoiUrl, XungDotPhienBan } from './bai';
import { LoiNghiepVu } from './chuyen-muc';
import { danhDauNoiDungDoi } from './phien-noi-dung';

export type TrangThaiTrang = 'nhap' | 'da-dang';
export interface Trang {
  slug: string;
  tieuDe: string;
  moTa: string;
  noiDung: string;
  trangThai: TrangThaiTrang;
  coDinh: boolean;
  suaLuc: number;
  nguoiSuaCuoiId: number | null;
  phienSo: number;
  nhapTuLuu: { tieuDe: string; moTa: string; noiDung: string; luc: number } | null;
}

interface Dong {
  slug: string; tieu_de: string; mo_ta: string; noi_dung: string; trang_thai: TrangThaiTrang; co_dinh: number;
  sua_luc: number; nguoi_sua_cuoi_id: number | null; phien_so: number; nhap_tu_luu: string | null;
}
const toTrang = (r: Dong): Trang => ({
  slug: r.slug, tieuDe: r.tieu_de, moTa: r.mo_ta, noiDung: r.noi_dung, trangThai: r.trang_thai, coDinh: r.co_dinh === 1,
  suaLuc: r.sua_luc, nguoiSuaCuoiId: r.nguoi_sua_cuoi_id, phienSo: r.phien_so, nhapTuLuu: r.nhap_tu_luu ? JSON.parse(r.nhap_tu_luu) : null,
});

export const lietKeTrang = (db: Db): Trang[] =>
  (db.prepare('SELECT * FROM trang ORDER BY co_dinh DESC, tieu_de').all() as Dong[]).map(toTrang);
export const docTrang = (db: Db, slug: string): Trang | null => {
  const r = db.prepare('SELECT * FROM trang WHERE slug = ?').get(slug) as Dong | undefined;
  return r ? toTrang(r) : null;
};

/** Lý do slug trang mới không dùng được: hệ thống, trùng trang khác hoặc trùng slug tỉnh. */
function kiemTraSlug(db: Db, slug: string): void {
  if (!slugHopLe(slug)) throw new LoiNghiepVu('Slug chỉ gồm a-z, 0-9 và dấu gạch ngang');
  if (SLUG_HE_THONG.includes(slug) || slug === 'trang') throw new LoiNghiepVu(`Slug "${slug}" trùng đường dẫn hệ thống`);
  if (docTrang(db, slug)) throw new LoiNghiepVu(`Trang "${slug}" đã có`, 409);
  if (db.prepare('SELECT 1 FROM tinh WHERE slug = ?').get(slug)) throw new LoiNghiepVu(`Slug "${slug}" trùng một tỉnh`);
}

const chuoi = (v: unknown, ten: string, toiDa: number, batBuoc = false): string => {
  const s = typeof v === 'string' ? v.trim() : '';
  if (batBuoc && !s) throw new LoiNghiepVu(`${ten} không được để trống`);
  if (s.length > toiDa) throw new LoiNghiepVu(`${ten} tối đa ${toiDa} ký tự`);
  return s;
};

export function themTrang(db: Db, input: { slug?: unknown; tieuDe?: unknown; moTa?: unknown; noiDung?: unknown }, nguoiId: number, now: () => number = Date.now): Trang {
  const tieuDe = chuoi(input.tieuDe, 'Tiêu đề', 150, true);
  const slug = typeof input.slug === 'string' && input.slug ? input.slug : taoSlug(tieuDe);
  kiemTraSlug(db, slug);
  const noiDung = typeof input.noiDung === 'string' ? input.noiDung : '';
  if (noiDung.length > 200_000) throw new LoiNghiepVu('Nội dung quá dài');
  db.transaction(() => {
    db.prepare("INSERT INTO trang (slug, tieu_de, mo_ta, noi_dung, trang_thai, co_dinh, sua_luc, nguoi_sua_cuoi_id) VALUES (?,?,?,?, 'nhap', 0, ?, ?)").run(
      slug, tieuDe, chuoi(input.moTa, 'Mô tả', 300), noiDung, now(), nguoiId,
    );
    ghiPhienBan(db, slug, nguoiId, now());
    danhDauNoiDungDoi(db);
  })();
  return docTrang(db, slug)!;
}

function ghiPhienBan(db: Db, slug: string, nguoiId: number | null, luc: number): void {
  const t = db.prepare('SELECT tieu_de, mo_ta, noi_dung FROM trang WHERE slug = ?').get(slug) as { tieu_de: string; mo_ta: string; noi_dung: string };
  db.prepare("INSERT INTO phien_ban (trang_slug, ngon_ngu, nguoi_dung_id, luc, du_lieu, noi_dung) VALUES (?, 'vi', ?, ?, ?, ?)").run(
    slug, nguoiId, luc, JSON.stringify({ tieuDe: t.tieu_de, moTa: t.mo_ta }), t.noi_dung,
  );
}

/** Sửa nội dung; `phienSo` (nếu có) phải khớp, nếu không ném XungDotPhienBan. Đổi slug chỉ cho trang không cố định (có 301 nếu đã đăng). */
export function suaTrang(
  db: Db,
  slug: string,
  input: { slug?: unknown; tieuDe?: unknown; moTa?: unknown; noiDung?: unknown; phienSo?: number },
  nguoiId: number,
  now: () => number = Date.now,
): Trang {
  const cu = docTrang(db, slug);
  if (!cu) throw new LoiNghiepVu('Không tìm thấy trang', 404);
  if (input.phienSo !== undefined && input.phienSo !== cu.phienSo) {
    const ten = cu.nguoiSuaCuoiId === null ? null : ((db.prepare('SELECT ten FROM nguoi_dung WHERE id = ?').get(cu.nguoiSuaCuoiId) as { ten: string } | undefined)?.ten ?? null);
    throw new XungDotPhienBan(ten, cu.suaLuc);
  }
  const moiSlug = typeof input.slug === 'string' && input.slug ? input.slug : slug;
  if (moiSlug !== slug) {
    if (cu.coDinh) throw new LoiNghiepVu('Trang cố định không đổi được slug', 409);
    kiemTraSlug(db, moiSlug);
  }
  const tieuDe = input.tieuDe === undefined ? cu.tieuDe : chuoi(input.tieuDe, 'Tiêu đề', 150, true);
  const moTa = input.moTa === undefined ? cu.moTa : chuoi(input.moTa, 'Mô tả', 300);
  const noiDung = input.noiDung === undefined ? cu.noiDung : typeof input.noiDung === 'string' && input.noiDung.length <= 200_000 ? input.noiDung : (() => { throw new LoiNghiepVu('Nội dung không hợp lệ hoặc quá dài'); })();
  const t = now();
  db.transaction(() => {
    db.prepare('UPDATE trang SET slug = ?, tieu_de = ?, mo_ta = ?, noi_dung = ?, sua_luc = ?, nguoi_sua_cuoi_id = ?, phien_so = phien_so + 1, nhap_tu_luu = NULL WHERE slug = ?').run(
      moiSlug, tieuDe, moTa, noiDung, t, nguoiId, slug,
    );
    if (moiSlug !== slug) {
      db.prepare('UPDATE phien_ban SET trang_slug = ? WHERE trang_slug = ?').run(moiSlug, slug);
      if (cu.trangThai === 'da-dang') themRedirectKhiDoiUrl(db, urlTrang(slug), urlTrang(moiSlug));
    }
    ghiPhienBan(db, moiSlug, nguoiId, t);
    danhDauNoiDungDoi(db);
  })();
  return docTrang(db, moiSlug)!;
}

/** Tự lưu: chỉ ghi `nhap_tu_luu`, không tạo phiên bản, không build. */
export function tuLuuTrang(db: Db, slug: string, input: { tieuDe?: unknown; moTa?: unknown; noiDung?: unknown; phienSo?: number }, now: () => number = Date.now): void {
  const cu = docTrang(db, slug);
  if (!cu) throw new LoiNghiepVu('Không tìm thấy trang', 404);
  if (input.phienSo !== undefined && input.phienSo !== cu.phienSo) throw new XungDotPhienBan(null, cu.suaLuc);
  db.prepare('UPDATE trang SET nhap_tu_luu = ? WHERE slug = ?').run(
    JSON.stringify({ tieuDe: String(input.tieuDe ?? ''), moTa: String(input.moTa ?? ''), noiDung: String(input.noiDung ?? ''), luc: now() }), slug,
  );
}

export function datTrangThaiTrang(db: Db, slug: string, trangThai: TrangThaiTrang): void {
  const t = docTrang(db, slug);
  if (!t) throw new LoiNghiepVu('Không tìm thấy trang', 404);
  if (trangThai === 'da-dang' && (!t.tieuDe.trim() || !t.noiDung.trim())) throw new LoiNghiepVu('Trang cần có tiêu đề và nội dung trước khi đăng');
  if (trangThai === 'nhap' && t.coDinh) throw new LoiNghiepVu('Trang cố định không gỡ được (đường dẫn này đang được các trang khác trỏ tới)', 409);
  if (t.trangThai === trangThai) throw new LoiNghiepVu(trangThai === 'da-dang' ? 'Trang đã đăng rồi' : 'Trang đang là bản nháp', 409);
  db.transaction(() => {
    db.prepare('UPDATE trang SET trang_thai = ? WHERE slug = ?').run(trangThai, slug);
    danhDauNoiDungDoi(db);
  })();
}

export function xoaTrang(db: Db, slug: string): void {
  const t = docTrang(db, slug);
  if (!t) throw new LoiNghiepVu('Không tìm thấy trang', 404);
  if (t.coDinh) throw new LoiNghiepVu('Trang cố định không xoá được', 409);
  db.transaction(() => {
    db.prepare('DELETE FROM trang WHERE slug = ?').run(slug);
    db.prepare('DELETE FROM phien_ban WHERE trang_slug = ?').run(slug);
    db.prepare('DELETE FROM redirect WHERE den = ?').run(urlTrang(slug));
    danhDauNoiDungDoi(db);
  })();
}
