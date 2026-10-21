// Lưu và đọc bài trong SQLite. Một bài (bảng `bai`) có nhiều bản dịch (`ban_dich`, hiện chỉ 'vi') và lịch sử (`phien_ban`).
// Dữ liệu frontmatter lưu JSON trong `ban_dich.du_lieu` (không có `draft`: trạng thái nằm ở cột `trang_thai`).
import { baiVietSchema, type BaiViet } from '@vntraveltips/schema';
import type { Db } from '../db/ket-noi';
import { danhDauNoiDungDoi } from './phien-noi-dung';

export type TrangThaiBan = 'nhap' | 'da-dang' | 'hen-gio';

export interface LuuBaiInput {
  id?: number;
  ngonNgu: 'vi';
  bai: BaiViet;
  noiDung: string;
  trangThai: TrangThaiBan;
  henGio?: number;
  nguoiId?: number;
}

export interface BaiDoc {
  id: number;
  ngonNgu: string;
  bai: BaiViet;
  noiDung: string;
  trangThai: TrangThaiBan;
  henGio: number | null;
  dangLuc: number | null;
  suaLuc: number;
  xoaLuc: number | null;
}

/** Kiểm tra theo `baiVietSchema` (bỏ qua `draft`), ném lỗi tiếng Việt nêu tên trường sai. */
export function kiemTraBai(bai: BaiViet): BaiViet {
  const kq = baiVietSchema.safeParse({ ...bai, draft: false });
  if (!kq.success) {
    const loi = kq.error.issues.map((i) => `${i.path.join('.') || '(gốc)'}: ${i.message}`).join('; ');
    throw new Error(`Bài không hợp lệ: ${loi}`);
  }
  return kq.data;
}

function duLieuJson(bai: BaiViet): string {
  const { draft: _draft, ...con } = bai;
  return JSON.stringify(con);
}

export function luuBai(db: Db, input: LuuBaiInput, now: () => number = Date.now): { id: number } {
  const bai = kiemTraBai(input.bai);
  const t = now();
  return db.transaction(() => {
    let id = input.id;
    const dangLuc = input.trangThai === 'da-dang' ? t : null;
    if (id === undefined) {
      id = Number(
        db
          .prepare('INSERT INTO bai (tinh, loai, tac_gia_id, nguoi_sua_cuoi_id, nguoi_dang_id, tao_luc, sua_luc) VALUES (?,?,?,?,?,?,?)')
          .run(bai.tinh ?? null, bai.loai, input.nguoiId ?? null, input.nguoiId ?? null, input.trangThai === 'da-dang' ? (input.nguoiId ?? null) : null, t, t)
          .lastInsertRowid,
      );
      db.prepare('INSERT INTO ban_dich (bai_id, ngon_ngu, slug, trang_thai, hen_gio, du_lieu, noi_dung, dang_luc, sua_luc) VALUES (?,?,?,?,?,?,?,?,?)').run(
        id, input.ngonNgu, bai.slug, input.trangThai, input.henGio ?? null, duLieuJson(bai), input.noiDung, dangLuc, t,
      );
    } else {
      const cu = db.prepare('SELECT dang_luc FROM ban_dich WHERE bai_id = ? AND ngon_ngu = ?').get(id, input.ngonNgu) as { dang_luc: number | null } | undefined;
      if (!cu) throw new Error(`Không có bài id ${id}`);
      db.prepare('UPDATE bai SET tinh = ?, loai = ?, nguoi_sua_cuoi_id = ?, sua_luc = ? WHERE id = ?').run(bai.tinh ?? null, bai.loai, input.nguoiId ?? null, t, id);
      db.prepare('UPDATE ban_dich SET slug = ?, trang_thai = ?, hen_gio = ?, du_lieu = ?, noi_dung = ?, dang_luc = ?, sua_luc = ? WHERE bai_id = ? AND ngon_ngu = ?').run(
        bai.slug, input.trangThai, input.henGio ?? null, duLieuJson(bai), input.noiDung, input.trangThai === 'da-dang' ? (cu.dang_luc ?? t) : cu.dang_luc, t, id, input.ngonNgu,
      );
    }
    db.prepare('INSERT INTO phien_ban (bai_id, ngon_ngu, nguoi_dung_id, luc, du_lieu, noi_dung) VALUES (?,?,?,?,?,?)').run(
      id, input.ngonNgu, input.nguoiId ?? null, t, duLieuJson(bai), input.noiDung,
    );
    danhDauNoiDungDoi(db);
    return { id };
  })();
}

interface Dong {
  id: number; ngon_ngu: string; du_lieu: string; noi_dung: string; trang_thai: TrangThaiBan;
  hen_gio: number | null; dang_luc: number | null; sua_luc: number; xoa_luc: number | null;
}

const CHON = `SELECT b.id, d.ngon_ngu, d.du_lieu, d.noi_dung, d.trang_thai, d.hen_gio, d.dang_luc, d.sua_luc, b.xoa_luc
  FROM bai b JOIN ban_dich d ON d.bai_id = b.id`;

function toDoc(r: Dong): BaiDoc {
  const kq = baiVietSchema.parse({ ...JSON.parse(r.du_lieu), draft: false });
  return {
    id: r.id, ngonNgu: r.ngon_ngu, bai: { ...kq, draft: r.trang_thai !== 'da-dang' }, noiDung: r.noi_dung,
    trangThai: r.trang_thai, henGio: r.hen_gio, dangLuc: r.dang_luc, suaLuc: r.sua_luc, xoaLuc: r.xoa_luc,
  };
}

export function docBai(db: Db, id: number, ngonNgu = 'vi'): BaiDoc | null {
  const r = db.prepare(`${CHON} WHERE b.id = ? AND d.ngon_ngu = ?`).get(id, ngonNgu) as Dong | undefined;
  return r ? toDoc(r) : null;
}

/** Mọi bài (kể cả nháp, không kể thùng rác) của một ngôn ngữ — dùng cho xuất preview. */
export function lietKeBai(db: Db, ngonNgu: string): BaiDoc[] {
  return (db.prepare(`${CHON} WHERE d.ngon_ngu = ? AND b.xoa_luc IS NULL ORDER BY b.id`).all(ngonNgu) as Dong[]).map(toDoc);
}

export function lietKeBaiDaDang(db: Db, ngonNgu: string): BaiDoc[] {
  return lietKeBai(db, ngonNgu).filter((b) => b.trangThai === 'da-dang');
}

export function timIdTheoSlug(db: Db, ngonNgu: string, slug: string): number | null {
  const r = db.prepare('SELECT bai_id FROM ban_dich WHERE ngon_ngu = ? AND slug = ?').get(ngonNgu, slug) as { bai_id: number } | undefined;
  return r?.bai_id ?? null;
}
