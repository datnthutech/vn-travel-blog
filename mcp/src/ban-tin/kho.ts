// Kho người đăng ký bản tin. Xác nhận 2 bước: đăng ký → mail có link (hết hạn 7 ngày) → bấm link mới tính là đã xác nhận.
// Token xác nhận chỉ lưu BẢN BĂM (lộ DB cũng không xác nhận hộ được); token huỷ lưu nguyên vì phải dựng lại link huỷ cho mỗi bản tin.
import { createHash, randomBytes } from 'node:crypto';
import type { Db } from '../db/ket-noi';

const PHUT = 60_000;
export const GIAN_CACH_MAIL_XAC_NHAN_MS = 10 * PHUT;
export const HAN_TOKEN_XAC_NHAN_MS = 7 * 24 * 60 * PHUT;

export type TrangThaiDangKy = 'cho-xac-nhan' | 'da-xac-nhan' | 'da-huy';

const bam = (t: string) => createHash('sha256').update(t).digest('hex');
const taoToken = () => randomBytes(32).toString('hex');
const TOKEN = /^[0-9a-f]{64}$/;

export function dangKy(db: Db, emailTho: string, ngonNgu: string, now: number): { canGuiXacNhan: boolean; token?: string } {
  const email = emailTho.trim().toLowerCase();
  const cu = db.prepare('SELECT id, trang_thai, gui_xac_nhan_cuoi_luc FROM nguoi_dang_ky WHERE email = ?').get(email) as
    | { id: number; trang_thai: TrangThaiDangKy; gui_xac_nhan_cuoi_luc: number }
    | undefined;
  if (!cu) {
    const token = taoToken();
    db.prepare('INSERT INTO nguoi_dang_ky (email, ngon_ngu, trang_thai, token_xac_nhan_bam, token_huy, tao_luc, gui_xac_nhan_cuoi_luc) VALUES (?,?,?,?,?,?,?)').run(
      email, ngonNgu, 'cho-xac-nhan', bam(token), taoToken(), now, now,
    );
    return { canGuiXacNhan: true, token };
  }
  if (cu.trang_thai === 'da-xac-nhan') return { canGuiXacNhan: false };
  if (now - cu.gui_xac_nhan_cuoi_luc < GIAN_CACH_MAIL_XAC_NHAN_MS) return { canGuiXacNhan: false }; // bấm liên tục → tối đa 1 mail / 10 phút
  const token = taoToken();
  db.prepare("UPDATE nguoi_dang_ky SET trang_thai = 'cho-xac-nhan', ngon_ngu = ?, token_xac_nhan_bam = ?, gui_xac_nhan_cuoi_luc = ?, xac_nhan_luc = NULL, huy_luc = NULL WHERE id = ?").run(ngonNgu, bam(token), now, cu.id);
  return { canGuiXacNhan: true, token };
}

export function xacNhan(db: Db, token: string, now = Date.now()): boolean {
  if (!TOKEN.test(token)) return false;
  const r = db.prepare('SELECT id, trang_thai, gui_xac_nhan_cuoi_luc FROM nguoi_dang_ky WHERE token_xac_nhan_bam = ?').get(bam(token)) as
    | { id: number; trang_thai: TrangThaiDangKy; gui_xac_nhan_cuoi_luc: number }
    | undefined;
  if (!r || r.trang_thai === 'da-huy') return false; // người đã huỷ không tự đăng ký lại bằng link cũ
  if (r.trang_thai === 'da-xac-nhan') return true; // bấm lần 2 vẫn báo "đã xác nhận"
  if (now - r.gui_xac_nhan_cuoi_luc > HAN_TOKEN_XAC_NHAN_MS) return false;
  db.prepare("UPDATE nguoi_dang_ky SET trang_thai = 'da-xac-nhan', xac_nhan_luc = ? WHERE id = ?").run(now, r.id);
  return true;
}

/** Idempotent: huỷ rồi huỷ nữa vẫn true. Token lạ → false. */
export function huy(db: Db, tokenHuy: string, now = Date.now()): boolean {
  if (!TOKEN.test(tokenHuy)) return false;
  const r = db.prepare('SELECT id, trang_thai FROM nguoi_dang_ky WHERE token_huy = ?').get(tokenHuy) as { id: number; trang_thai: TrangThaiDangKy } | undefined;
  if (!r) return false;
  if (r.trang_thai !== 'da-huy') db.prepare("UPDATE nguoi_dang_ky SET trang_thai = 'da-huy', huy_luc = ? WHERE id = ?").run(now, r.id);
  return true;
}

export interface NguoiDangKy { id: number; email: string; ngonNgu: string; trangThai: TrangThaiDangKy; taoLuc: number; xacNhanLuc: number | null; huyLuc: number | null }
interface Loc { trangThai?: string; ngonNgu?: string; q?: string; trang?: number; moiTrang?: number }

const sangNguoi = (r: any): NguoiDangKy => ({ id: r.id, email: r.email, ngonNgu: r.ngon_ngu, trangThai: r.trang_thai, taoLuc: r.tao_luc, xacNhanLuc: r.xac_nhan_luc, huyLuc: r.huy_luc });

/** Danh sách cho quản trị — KHÔNG trả token. */
export function lietKe(db: Db, loc: Loc): { tong: number; nguoi: NguoiDangKy[] } {
  const dk: string[] = [];
  const tham: unknown[] = [];
  if (loc.trangThai) (dk.push('trang_thai = ?'), tham.push(loc.trangThai));
  if (loc.ngonNgu) (dk.push('ngon_ngu = ?'), tham.push(loc.ngonNgu));
  if (loc.q) (dk.push("email LIKE ? ESCAPE '\\'"), tham.push(`%${loc.q.replace(/[\\%_]/g, '\\$&')}%`));
  const where = dk.length ? `WHERE ${dk.join(' AND ')}` : '';
  const moi = loc.moiTrang ?? 50;
  const trang = Math.max(1, loc.trang ?? 1);
  const tong = (db.prepare(`SELECT count(*) AS n FROM nguoi_dang_ky ${where}`).get(...tham) as { n: number }).n;
  const nguoi = db
    .prepare(`SELECT id, email, ngon_ngu, trang_thai, tao_luc, xac_nhan_luc, huy_luc FROM nguoi_dang_ky ${where} ORDER BY id DESC LIMIT ? OFFSET ?`)
    .all(...tham, moi, (trang - 1) * moi)
    .map(sangNguoi);
  return { tong, nguoi };
}

export const demDaXacNhan = (db: Db): number => (db.prepare("SELECT count(*) AS n FROM nguoi_dang_ky WHERE trang_thai = 'da-xac-nhan'").get() as { n: number }).n;

export const xoaNguoiDangKy = (db: Db, id: number): boolean => db.prepare('DELETE FROM nguoi_dang_ky WHERE id = ?').run(id).changes > 0;
