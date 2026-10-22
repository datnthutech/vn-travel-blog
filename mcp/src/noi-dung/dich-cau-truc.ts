// Bản dịch cấu trúc (chuyên mục, tỉnh, trang tĩnh, menu, cài đặt site, chuỗi giao diện): bảng `dich_cau_truc(loai, khoa, ngon_ngu, du_lieu)`.
// `khoa` = định danh của đối tượng TIẾNG VIỆT (slug chuyên mục/tỉnh/trang; `dauTrang.<i>[.<j>]` cho mục menu; 'site'; 'giao-dien').
import { CHUOI_GIAO_DIEN_VI, SLUG_HE_THONG, slugHopLe } from '@vntraveltips/schema';
import type { Db } from '../db/ket-noi';
import { LoiNghiepVu } from './chuyen-muc';
import { docCaiDat } from './cai-dat';
import { maNgonNguDaCo } from './ngon-ngu';
import { danhDauNoiDungDoi } from './phien-noi-dung';

export const LOAI_DICH = ['chuyen-muc', 'tinh', 'trang', 'menu', 'site', 'giao-dien'] as const;
export type LoaiDich = (typeof LOAI_DICH)[number];
/** Loại thuộc quyền `cai-dat.sua` (còn lại là `cau-truc.sua`). */
export const LOAI_CAI_DAT: readonly LoaiDich[] = ['site', 'giao-dien'];

const chuoi = (v: unknown, ten: string, toiDa: number, batBuoc = false): string => {
  if (v !== undefined && typeof v !== 'string') throw new LoiNghiepVu(`${ten} phải là chuỗi`);
  const s = (v ?? '').toString().trim();
  if (batBuoc && !s) throw new LoiNghiepVu(`${ten} không được để trống`);
  if (s.length > toiDa) throw new LoiNghiepVu(`${ten} tối đa ${toiDa} ký tự`);
  return s;
};

export interface MucMenuGoc { nhan: string }
/** Mục menu (tiếng Việt) theo khoá `dauTrang.<i>` / `dauTrang.<i>.<j>` / `chanTrang...`; null nếu không có. */
export function mucMenuTheoKhoa(db: Db, khoa: string): MucMenuGoc | null {
  const m = /^(dauTrang|chanTrang)\.(\d+)(?:\.(\d+))?$/.exec(khoa);
  if (!m) return null;
  const menu = docCaiDat<Record<string, { nhan: string; con?: { nhan: string }[] }[]>>(db, 'menu');
  const muc = menu?.[m[1]!]?.[Number(m[2])];
  const dich = m[3] === undefined ? muc : muc?.con?.[Number(m[3])];
  return dich ? { nhan: dich.nhan } : null;
}

/** Dữ liệu tiếng Việt để người dịch đối chiếu; null nếu đối tượng không tồn tại. */
export function banGocDich(db: Db, loai: LoaiDich, khoa: string): Record<string, unknown> | null {
  switch (loai) {
    case 'chuyen-muc': {
      const r = db.prepare('SELECT ten, mo_ta FROM chuyen_muc WHERE slug = ?').get(khoa) as { ten: string; mo_ta: string } | undefined;
      return r ? { ten: r.ten, moTa: r.mo_ta } : null;
    }
    case 'tinh': {
      const r = db.prepare('SELECT du_lieu FROM tinh WHERE slug = ?').get(khoa) as { du_lieu: string } | undefined;
      if (!r) return null;
      const t = JSON.parse(r.du_lieu) as { ten: string; gioiThieu: string; moTa: string; anhBia?: { alt: string } };
      return { ten: t.ten, gioiThieu: t.gioiThieu, moTa: t.moTa, anhBiaAlt: t.anhBia?.alt ?? '' };
    }
    case 'trang': {
      const r = db.prepare('SELECT slug, tieu_de, mo_ta, noi_dung FROM trang WHERE slug = ?').get(khoa) as { slug: string; tieu_de: string; mo_ta: string; noi_dung: string } | undefined;
      return r ? { tieuDe: r.tieu_de, moTa: r.mo_ta, noiDung: r.noi_dung, slug: r.slug } : null;
    }
    case 'menu': {
      const m = mucMenuTheoKhoa(db, khoa);
      return m ? { nhan: m.nhan } : null;
    }
    case 'site': {
      if (khoa !== 'site') return null;
      const s = docCaiDat<{ tenSite: string; moTaMacDinh: string }>(db, 'site');
      return { tenSite: s?.tenSite ?? '', moTaMacDinh: s?.moTaMacDinh ?? '' };
    }
    case 'giao-dien':
      return khoa === 'giao-dien' ? { ...CHUOI_GIAO_DIEN_VI } : null;
  }
}

/** Kiểm tra + chuẩn hoá dữ liệu bản dịch theo loại; ném LoiNghiepVu (tiếng Việt) nếu sai. */
export function kiemDuLieuDich(db: Db, loai: LoaiDich, khoa: string, ngonNgu: string, du: unknown): Record<string, unknown> {
  const d = du as Record<string, unknown> | null;
  if (!d || typeof d !== 'object' || Array.isArray(d)) throw new LoiNghiepVu('Dữ liệu bản dịch phải là một đối tượng');
  switch (loai) {
    case 'chuyen-muc':
      return { ten: chuoi(d.ten, 'Tên', 60, true), moTa: chuoi(d.moTa, 'Mô tả', 300) };
    case 'tinh':
      return { ten: chuoi(d.ten, 'Tên', 60, true), gioiThieu: chuoi(d.gioiThieu, 'Giới thiệu', 2000), moTa: chuoi(d.moTa, 'Mô tả', 300), anhBiaAlt: chuoi(d.anhBiaAlt, 'Mô tả ảnh bìa', 200) };
    case 'menu':
      return { nhan: chuoi(d.nhan, 'Nhãn', 40, true) };
    case 'site':
      return { tenSite: chuoi(d.tenSite, 'Tên site', 60, true), moTaMacDinh: chuoi(d.moTaMacDinh, 'Mô tả mặc định', 300, true) };
    case 'giao-dien': {
      const ra: Record<string, string> = {};
      for (const [k, v] of Object.entries(d)) {
        if (!Object.hasOwn(CHUOI_GIAO_DIEN_VI, k)) throw new LoiNghiepVu(`Khoá giao diện "${k}" không có trong bản tiếng Việt`);
        if (typeof v !== 'string') throw new LoiNghiepVu(`Khoá "${k}": bản dịch phải là chuỗi`);
        if (v.length > 1000) throw new LoiNghiepVu(`Khoá "${k}": tối đa 1000 ký tự`);
        // Giữ nguyên các chỗ giữ chỗ {n}, {ten}… của bản gốc (mất là hiển thị sai).
        const can = [...CHUOI_GIAO_DIEN_VI[k]!.matchAll(/\{\w+\}/g)].map((m) => m[0]);
        const thieu = can.filter((p) => v.trim() !== '' && !v.includes(p));
        if (thieu.length) throw new LoiNghiepVu(`Khoá "${k}": bản dịch phải giữ ${thieu.join(', ')}`);
        if (v.trim() !== '') ra[k] = v.trim();
      }
      return ra;
    }
    case 'trang': {
      const slug = chuoi(d.slug, 'Slug', 100, true);
      if (!slugHopLe(slug)) throw new LoiNghiepVu('Slug chỉ gồm a-z, 0-9 và dấu gạch ngang');
      if (SLUG_HE_THONG.includes(slug) || slug === 'trang' || slug === 'chu-de' || slug === 'kinh-nghiem') throw new LoiNghiepVu(`Slug "${slug}" trùng đường dẫn hệ thống`);
      if (db.prepare('SELECT 1 FROM tinh WHERE slug = ?').get(slug)) throw new LoiNghiepVu(`Slug "${slug}" trùng một tỉnh (trang /${ngonNgu}/${slug}/ sẽ đè hub tỉnh)`);
      for (const r of db.prepare("SELECT khoa, du_lieu FROM dich_cau_truc WHERE loai = 'trang' AND ngon_ngu = ? AND khoa <> ?").all(ngonNgu, khoa) as { khoa: string; du_lieu: string }[]) {
        if ((JSON.parse(r.du_lieu) as { slug?: string }).slug === slug) throw new LoiNghiepVu(`Slug "${slug}" đã dùng cho bản dịch trang "${r.khoa}"`, 409);
      }
      const noiDung = chuoi(d.noiDung, 'Nội dung', 200_000);
      const trangThai = d.trangThai === undefined ? 'nhap' : d.trangThai;
      if (trangThai !== 'nhap' && trangThai !== 'da-dang') throw new LoiNghiepVu('trangThai phải là nhap hoặc da-dang');
      return { tieuDe: chuoi(d.tieuDe, 'Tiêu đề', 150, true), moTa: chuoi(d.moTa, 'Mô tả', 300), noiDung, slug, trangThai };
    }
  }
}

export function docDich(db: Db, loai: LoaiDich, khoa: string, ngonNgu: string): { duLieu: Record<string, unknown>; suaLuc: number } | null {
  const r = db.prepare('SELECT du_lieu, sua_luc FROM dich_cau_truc WHERE loai = ? AND khoa = ? AND ngon_ngu = ?').get(loai, khoa, ngonNgu) as { du_lieu: string; sua_luc: number } | undefined;
  return r ? { duLieu: JSON.parse(r.du_lieu), suaLuc: r.sua_luc } : null;
}

export function luuDich(db: Db, loai: LoaiDich, khoa: string, ngonNgu: string, du: unknown, now: () => number): Record<string, unknown> {
  if (!maNgonNguDaCo(db).includes(ngonNgu) || ngonNgu === 'vi') throw new LoiNghiepVu('Không có ngôn ngữ này', 404);
  if (banGocDich(db, loai, khoa) === null) throw new LoiNghiepVu('Không tìm thấy đối tượng cần dịch', 404);
  const sach = kiemDuLieuDich(db, loai, khoa, ngonNgu, du);
  db.transaction(() => {
    db.prepare('INSERT OR REPLACE INTO dich_cau_truc (loai, khoa, ngon_ngu, du_lieu, sua_luc) VALUES (?,?,?,?,?)').run(loai, khoa, ngonNgu, JSON.stringify(sach), now());
    danhDauNoiDungDoi(db);
  })();
  return sach;
}
