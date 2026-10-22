// Phiên đăng nhập: cookie `vtt_phien` chứa token ngẫu nhiên 32 byte; DB chỉ lưu SHA-256 của token
// (lộ DB cũng không dùng lại được token). Hết hạn khi để yên 12 giờ, hoặc 30 ngày nếu "ghi nhớ" — gia hạn trượt mỗi lần dùng.
import { createHash, randomBytes } from 'node:crypto';
import type { Db } from '../db/ket-noi';
import type { NguoiDung } from './nguoi-dung';
import type { VaiTro } from './quyen';

export const TEN_COOKIE_PHIEN = 'vtt_phien';
const GIO = 3600_000;
export const TTL_PHIEN = 12 * GIO;
export const TTL_GHI_NHO = 30 * 24 * GIO;

export const bamToken = (token: string): string => createHash('sha256').update(token).digest('hex');
const ttl = (ghiNho: boolean) => (ghiNho ? TTL_GHI_NHO : TTL_PHIEN);

export function taoPhien(
  db: Db,
  nguoiId: number,
  opt: { ghiNho: boolean; ip?: string; thietBi?: string; choTotp?: boolean },
  now: () => number = Date.now,
): string {
  const t = now();
  db.prepare('DELETE FROM phien WHERE het_han_luc < ?').run(t); // dọn phiên hết hạn
  const token = randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO phien (token_bam, nguoi_dung_id, ghi_nho, ip, thiet_bi, tao_luc, dung_cuoi_luc, het_han_luc, cho_totp) VALUES (?,?,?,?,?,?,?,?,?)').run(
    bamToken(token), nguoiId, opt.ghiNho ? 1 : 0, opt.ip ?? null, (opt.thietBi ?? '').slice(0, 200), t, t, t + ttl(opt.ghiNho), opt.choTotp ? 1 : 0,
  );
  return token;
}

export interface PhienDoc {
  nguoiDung: NguoiDung;
  phienId: number;
  ghiNho: boolean;
  /** Đã nhập đúng mật khẩu nhưng chưa nhập mã TOTP: chỉ được dùng vài API hoàn tất đăng nhập. */
  choTotp: boolean;
}

export function docPhien(db: Db, token: string, now: number | (() => number) = Date.now): PhienDoc | null {
  const t = typeof now === 'function' ? now() : now;
  const r = db
    .prepare(
      `SELECT p.id, p.ghi_nho, p.het_han_luc, p.cho_totp, u.id AS uid, u.email, u.ten, u.vai_tro, u.bi_khoa, u.totp_bi_mat
       FROM phien p JOIN nguoi_dung u ON u.id = p.nguoi_dung_id WHERE p.token_bam = ?`,
    )
    .get(bamToken(token)) as
    | { id: number; ghi_nho: number; het_han_luc: number; cho_totp: number; uid: number; email: string; ten: string; vai_tro: VaiTro; bi_khoa: number; totp_bi_mat: string | null }
    | undefined;
  if (!r || r.het_han_luc < t || r.bi_khoa === 1) return null;
  const ghiNho = r.ghi_nho === 1;
  db.prepare('UPDATE phien SET dung_cuoi_luc = ?, het_han_luc = ? WHERE id = ?').run(t, t + ttl(ghiNho), r.id); // gia hạn trượt
  return {
    phienId: r.id,
    ghiNho,
    choTotp: r.cho_totp === 1,
    nguoiDung: { id: r.uid, email: r.email, ten: r.ten, vaiTro: r.vai_tro, biKhoa: false, coTotp: r.totp_bi_mat !== null },
  };
}

export function xoaPhien(db: Db, phienId: number): void {
  db.prepare('DELETE FROM phien WHERE id = ?').run(phienId);
}

export function hoanTatTotp(db: Db, phienId: number): void {
  db.prepare('UPDATE phien SET cho_totp = 0 WHERE id = ?').run(phienId);
}

/** Đăng xuất mọi thiết bị của người dùng (trừ `truPhienId` nếu có). */
export function xoaMoiPhien(db: Db, nguoiId: number, truPhienId?: number): void {
  db.prepare('DELETE FROM phien WHERE nguoi_dung_id = ? AND id IS NOT ?').run(nguoiId, truPhienId ?? null);
}

export interface PhienTomTat {
  id: number;
  ip: string | null;
  thietBi: string | null;
  taoLuc: number;
  dungCuoiLuc: number;
  ghiNho: boolean;
}

export function lietKePhien(db: Db, nguoiId: number): PhienTomTat[] {
  return (
    db.prepare('SELECT id, ip, thiet_bi, tao_luc, dung_cuoi_luc, ghi_nho FROM phien WHERE nguoi_dung_id = ? ORDER BY dung_cuoi_luc DESC').all(nguoiId) as
      { id: number; ip: string | null; thiet_bi: string | null; tao_luc: number; dung_cuoi_luc: number; ghi_nho: number }[]
  ).map((r) => ({ id: r.id, ip: r.ip, thietBi: r.thiet_bi, taoLuc: r.tao_luc, dungCuoiLuc: r.dung_cuoi_luc, ghiNho: r.ghi_nho === 1 }));
}
