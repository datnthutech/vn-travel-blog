// Lưu bình luận của người đọc. Chỉ 1 cấp trả lời (trả lời của trả lời được gộp về cha cấp 1). IP và email bị chặn chỉ lưu BĂM
// (SHA-256 có muối KHOA_BI_MAT), email người bình luận không bao giờ có trong dữ liệu công khai.
import { createHash } from 'node:crypto';
import type { Db } from '../db/ket-noi';

export type TrangThaiBinhLuan = 'hien' | 'an' | 'cho-xem';

export interface BinhLuanCongKhai {
  id: number;
  chaId: number | null;
  ten: string;
  noiDung: string;
  laTacGia: boolean;
  taoLuc: number;
}

export const bamGiaTri = (khoaBiMat: string, loai: 'email' | 'ip', giaTri: string): string =>
  createHash('sha256').update(`${khoaBiMat}:${loai}:${giaTri.trim().toLowerCase()}`).digest('hex');

export interface ThemInput {
  baiId: number;
  ngonNgu: string;
  chaId?: number | null;
  ten: string;
  email: string;
  noiDung: string;
  ipBam: string;
  trangThai: TrangThaiBinhLuan;
  lyDoChoXem?: string;
  nguoiDungId?: number | null;
  laTacGia?: boolean;
}

export function themBinhLuan(db: Db, i: ThemInput, now: () => number = Date.now): { id: number; trangThai: TrangThaiBinhLuan; chaId: number | null } {
  let cha: number | null = null;
  if (i.chaId) {
    const c = db.prepare('SELECT id, cha_id, bai_id, ngon_ngu, trang_thai FROM binh_luan WHERE id = ?').get(i.chaId) as { id: number; cha_id: number | null; bai_id: number; ngon_ngu: string; trang_thai: string } | undefined;
    // Chỉ trả lời được bình luận ĐANG HIỆN (trả lời bình luận ẩn/chờ xem sẽ không bao giờ hiện, và lộ ra id nào đang bị ẩn).
    if (!c || c.bai_id !== i.baiId || c.ngon_ngu !== i.ngonNgu || c.trang_thai !== 'hien') throw new Error('Bình luận được trả lời không tồn tại trong bài này');
    cha = c.cha_id ?? c.id; // trả lời của trả lời → gộp về cha cấp 1
  }
  const id = Number(
    db
      .prepare('INSERT INTO binh_luan (bai_id, ngon_ngu, cha_id, ten, email, noi_dung, ip_bam, trang_thai, ly_do_cho_xem, nguoi_dung_id, la_tac_gia, tao_luc) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(i.baiId, i.ngonNgu, cha, i.ten, i.email, i.noiDung, i.ipBam, i.trangThai, i.lyDoChoXem ?? null, i.nguoiDungId ?? null, i.laTacGia ? 1 : 0, now()).lastInsertRowid,
  );
  return { id, trangThai: i.trangThai, chaId: cha };
}

/** Bình luận đang HIỆN của một bài: cha trước, con ngay sau cha, cũ → mới. KHÔNG có email, KHÔNG có bình luận ẩn/chờ xem. */
export function lietKeHien(db: Db, baiId: number, ngonNgu: string): BinhLuanCongKhai[] {
  const dong = db
    .prepare("SELECT id, cha_id, ten, noi_dung, la_tac_gia, tao_luc FROM binh_luan WHERE bai_id = ? AND ngon_ngu = ? AND trang_thai = 'hien' ORDER BY tao_luc, id")
    .all(baiId, ngonNgu) as { id: number; cha_id: number | null; ten: string; noi_dung: string; la_tac_gia: number; tao_luc: number }[];
  const toCong = (r: (typeof dong)[number]): BinhLuanCongKhai => ({ id: r.id, chaId: r.cha_id, ten: r.ten, noiDung: r.noi_dung, laTacGia: r.la_tac_gia === 1, taoLuc: r.tao_luc });
  const conCua = new Map<number, typeof dong>();
  for (const r of dong) if (r.cha_id !== null) conCua.set(r.cha_id, [...(conCua.get(r.cha_id) ?? []), r]);
  const ra: BinhLuanCongKhai[] = [];
  for (const c of dong.filter((r) => r.cha_id === null)) {
    ra.push(toCong(c));
    for (const con of conCua.get(c.id) ?? []) ra.push(toCong(con)); // con của cha đang ẩn không hiện (cha không có trong danh sách)
  }
  return ra;
}

export function doiTrangThai(db: Db, id: number, trangThai: TrangThaiBinhLuan): boolean {
  return db.prepare('UPDATE binh_luan SET trang_thai = ?, ly_do_cho_xem = CASE WHEN ? = \'cho-xem\' THEN ly_do_cho_xem ELSE NULL END WHERE id = ?').run(trangThai, trangThai, id).changes > 0;
}

/** Xoá bình luận và mọi trả lời của nó (ON DELETE CASCADE). */
export const xoa = (db: Db, id: number): boolean => db.prepare('DELETE FROM binh_luan WHERE id = ?').run(id).changes > 0;

export function chan(db: Db, khoaBiMat: string, loai: 'email' | 'ip', giaTri: string): void {
  db.prepare('INSERT OR IGNORE INTO chan_binh_luan (loai, gia_tri_bam) VALUES (?, ?)').run(loai, bamGiaTri(khoaBiMat, loai, giaTri));
}
export const daBiChan = (db: Db, khoaBiMat: string, loai: 'email' | 'ip', giaTri: string): boolean =>
  db.prepare('SELECT 1 FROM chan_binh_luan WHERE loai = ? AND gia_tri_bam = ?').get(loai, bamGiaTri(khoaBiMat, loai, giaTri)) !== undefined;
