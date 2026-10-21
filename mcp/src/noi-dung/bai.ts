// Lưu và đọc bài trong SQLite. Một bài (bảng `bai`) có nhiều bản dịch (`ban_dich`, hiện chỉ 'vi') và lịch sử (`phien_ban`).
// Dữ liệu frontmatter lưu JSON trong `ban_dich.du_lieu` (không có `draft`: trạng thái nằm ở cột `trang_thai`).
// Bản nháp được phép thiếu trường (kiểm tra cơ bản); bài đã đăng phải đạt `baiVietSchema` đầy đủ.
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
  /** Có → chỉ lưu nếu khớp phiên hiện tại, nếu không ném XungDotPhienBan (người lưu sau không ghi đè im lặng). */
  phienSo?: number;
  /** 'co-ban' cho bản nháp (thiếu trường cũng được). Mặc định 'day-du'. */
  kiemTra?: 'day-du' | 'co-ban';
}

export interface BaiDoc {
  id: number;
  ngonNgu: string;
  bai: BaiViet;
  /** false: bản nháp còn thiếu trường nên chưa qua `baiVietSchema` (không xuất ra site được). */
  hopLe: boolean;
  noiDung: string;
  trangThai: TrangThaiBan;
  henGio: number | null;
  dangLuc: number | null;
  suaLuc: number;
  xoaLuc: number | null;
  phienSo: number;
  tacGiaId: number | null;
  nguoiSuaCuoiId: number | null;
  nguoiDangId: number | null;
  taoLuc: number;
  nhapTuLuu: { bai: unknown; noiDung: string; luc: number } | null;
}

export class XungDotPhienBan extends Error {
  constructor(
    public nguoiSua: string | null,
    public luc: number,
  ) {
    super('Bài đã được người khác sửa');
  }
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

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
/** Kiểm tra cơ bản cho bản nháp: là object, có tiêu đề (chuỗi) và slug đúng dạng. */
export function kiemTraCoBan(bai: unknown): BaiViet {
  const b = bai as Record<string, unknown> | null;
  if (!b || typeof b !== 'object' || Array.isArray(b)) throw new Error('Bài không hợp lệ: dữ liệu bài phải là một đối tượng');
  if (typeof b.tieuDe !== 'string') throw new Error('Bài không hợp lệ: tieuDe: cần là chuỗi');
  if (typeof b.slug !== 'string' || !SLUG.test(b.slug)) throw new Error('Bài không hợp lệ: slug: chỉ gồm a-z, 0-9 và dấu gạch ngang');
  if (b.tinh !== undefined && b.tinh !== null && (typeof b.tinh !== 'string' || !SLUG.test(b.tinh))) throw new Error('Bài không hợp lệ: tinh: sai dạng');
  const { draft: _d, ...con } = b;
  return { ...con, draft: false } as unknown as BaiViet;
}

function duLieuJson(bai: BaiViet): string {
  const { draft: _draft, ...con } = bai;
  return JSON.stringify(con);
}

export function luuBai(db: Db, input: LuuBaiInput, now: () => number = Date.now): { id: number; phienSo: number } {
  const bai = input.kiemTra === 'co-ban' ? kiemTraCoBan(input.bai) : kiemTraBai(input.bai);
  const t = now();
  return db.transaction(() => {
    let id = input.id;
    let phienSo = 1;
    const dangLuc = input.trangThai === 'da-dang' ? t : null;
    if (id === undefined) {
      id = Number(
        db
          .prepare('INSERT INTO bai (tinh, loai, tac_gia_id, nguoi_sua_cuoi_id, nguoi_dang_id, tao_luc, sua_luc) VALUES (?,?,?,?,?,?,?)')
          .run(bai.tinh ?? null, bai.loai ?? '', input.nguoiId ?? null, input.nguoiId ?? null, input.trangThai === 'da-dang' ? (input.nguoiId ?? null) : null, t, t)
          .lastInsertRowid,
      );
      db.prepare('INSERT INTO ban_dich (bai_id, ngon_ngu, slug, trang_thai, hen_gio, du_lieu, noi_dung, dang_luc, sua_luc, phien_so, phien_ban_cuoi_luc) VALUES (?,?,?,?,?,?,?,?,?,1,?)').run(
        id, input.ngonNgu, bai.slug, input.trangThai, input.henGio ?? null, duLieuJson(bai), input.noiDung, dangLuc, t, t,
      );
    } else {
      const cu = db
        .prepare(
          `SELECT d.dang_luc, d.phien_so, d.sua_luc, u.ten AS nguoi_sua FROM ban_dich d JOIN bai b ON b.id = d.bai_id
           LEFT JOIN nguoi_dung u ON u.id = b.nguoi_sua_cuoi_id WHERE d.bai_id = ? AND d.ngon_ngu = ?`,
        )
        .get(id, input.ngonNgu) as { dang_luc: number | null; phien_so: number; sua_luc: number; nguoi_sua: string | null } | undefined;
      if (!cu) throw new Error(`Không có bài id ${id}`);
      if (input.phienSo !== undefined && input.phienSo !== cu.phien_so) throw new XungDotPhienBan(cu.nguoi_sua, cu.sua_luc);
      phienSo = cu.phien_so + 1;
      db.prepare('UPDATE bai SET tinh = ?, loai = ?, nguoi_sua_cuoi_id = ?, sua_luc = ? WHERE id = ?').run(bai.tinh ?? null, bai.loai ?? '', input.nguoiId ?? null, t, id);
      db.prepare(
        'UPDATE ban_dich SET slug = ?, trang_thai = ?, hen_gio = ?, du_lieu = ?, noi_dung = ?, dang_luc = ?, sua_luc = ?, phien_so = ?, nhap_tu_luu = NULL, phien_ban_cuoi_luc = ? WHERE bai_id = ? AND ngon_ngu = ?',
      ).run(bai.slug, input.trangThai, input.henGio ?? null, duLieuJson(bai), input.noiDung, input.trangThai === 'da-dang' ? (cu.dang_luc ?? t) : cu.dang_luc, t, phienSo, t, id, input.ngonNgu);
    }
    db.prepare('INSERT INTO phien_ban (bai_id, ngon_ngu, nguoi_dung_id, luc, du_lieu, noi_dung) VALUES (?,?,?,?,?,?)').run(
      id, input.ngonNgu, input.nguoiId ?? null, t, duLieuJson(bai), input.noiDung,
    );
    danhDauNoiDungDoi(db);
    return { id, phienSo };
  })();
}

interface Dong {
  id: number; ngon_ngu: string; du_lieu: string; noi_dung: string; trang_thai: TrangThaiBan;
  hen_gio: number | null; dang_luc: number | null; sua_luc: number; xoa_luc: number | null;
  phien_so: number; tac_gia_id: number | null; nguoi_sua_cuoi_id: number | null; nguoi_dang_id: number | null;
  tao_luc: number; nhap_tu_luu: string | null;
}

const CHON = `SELECT b.id, d.ngon_ngu, d.du_lieu, d.noi_dung, d.trang_thai, d.hen_gio, d.dang_luc, d.sua_luc, b.xoa_luc,
  d.phien_so, b.tac_gia_id, b.nguoi_sua_cuoi_id, b.nguoi_dang_id, b.tao_luc, d.nhap_tu_luu
  FROM bai b JOIN ban_dich d ON d.bai_id = b.id`;

function toDoc(r: Dong): BaiDoc {
  const tho = JSON.parse(r.du_lieu) as Record<string, unknown>;
  const kq = baiVietSchema.safeParse({ ...tho, draft: false });
  const draft = r.trang_thai !== 'da-dang';
  return {
    id: r.id, ngonNgu: r.ngon_ngu,
    bai: kq.success ? { ...kq.data, draft } : ({ ...tho, draft } as unknown as BaiViet),
    hopLe: kq.success,
    noiDung: r.noi_dung, trangThai: r.trang_thai, henGio: r.hen_gio, dangLuc: r.dang_luc, suaLuc: r.sua_luc, xoaLuc: r.xoa_luc,
    phienSo: r.phien_so, tacGiaId: r.tac_gia_id, nguoiSuaCuoiId: r.nguoi_sua_cuoi_id, nguoiDangId: r.nguoi_dang_id, taoLuc: r.tao_luc,
    nhapTuLuu: r.nhap_tu_luu ? JSON.parse(r.nhap_tu_luu) : null,
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
