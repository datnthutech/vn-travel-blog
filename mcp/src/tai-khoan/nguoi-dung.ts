// Người dùng admin: tạo, tìm, đổi mật khẩu. Mật khẩu chỉ nằm ở DB dưới dạng băm argon2id, không bao giờ trả ra ngoài.
import type { Db } from '../db/ket-noi';
import { bamMatKhau, matKhauHopLe } from './mat-khau';
import type { VaiTro } from './quyen';

export interface NguoiDung {
  id: number;
  email: string;
  ten: string;
  vaiTro: VaiTro;
  biKhoa: boolean;
  coTotp: boolean;
}

interface Dong {
  id: number;
  email: string;
  ten: string;
  vai_tro: VaiTro;
  bi_khoa: number;
  totp_bi_mat: string | null;
}

const toNguoiDung = (r: Dong): NguoiDung => ({
  id: r.id, email: r.email, ten: r.ten, vaiTro: r.vai_tro, biKhoa: r.bi_khoa === 1, coTotp: r.totp_bi_mat !== null,
});

const COT = 'id, email, ten, vai_tro, bi_khoa, totp_bi_mat';

export async function taoNguoiDung(
  db: Db,
  input: { email: string; ten: string; vaiTro: VaiTro; matKhau: string },
  now: () => number = Date.now,
): Promise<NguoiDung> {
  const loi = matKhauHopLe(input.matKhau);
  if (loi) throw new Error(loi);
  const email = input.email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Email không hợp lệ.');
  if (timTheoEmail(db, email)) throw new Error('Email này đã có tài khoản.');
  const bam = await bamMatKhau(input.matKhau);
  const id = Number(
    db.prepare('INSERT INTO nguoi_dung (email, ten, vai_tro, mat_khau_bam, tao_luc) VALUES (?,?,?,?,?)').run(email, input.ten.trim(), input.vaiTro, bam, now()).lastInsertRowid,
  );
  return timTheoId(db, id)!;
}

export function timTheoEmail(db: Db, email: string): NguoiDung | null {
  const r = db.prepare(`SELECT ${COT} FROM nguoi_dung WHERE email = ?`).get(email.trim()) as Dong | undefined; // cột COLLATE NOCASE
  return r ? toNguoiDung(r) : null;
}

export function timTheoId(db: Db, id: number): NguoiDung | null {
  const r = db.prepare(`SELECT ${COT} FROM nguoi_dung WHERE id = ?`).get(id) as Dong | undefined;
  return r ? toNguoiDung(r) : null;
}

/** Chuỗi băm mật khẩu — chỉ dùng nội bộ để kiểm tra đăng nhập, không đưa vào phản hồi API. */
export function docMatKhauBam(db: Db, id: number): string | null {
  const r = db.prepare('SELECT mat_khau_bam FROM nguoi_dung WHERE id = ?').get(id) as { mat_khau_bam: string } | undefined;
  return r?.mat_khau_bam ?? null;
}

/** Đổi mật khẩu và đăng xuất mọi phiên của người đó. */
export async function doiMatKhau(db: Db, id: number, mkMoi: string): Promise<void> {
  const loi = matKhauHopLe(mkMoi);
  if (loi) throw new Error(loi);
  const bam = await bamMatKhau(mkMoi);
  db.transaction(() => {
    db.prepare('UPDATE nguoi_dung SET mat_khau_bam = ? WHERE id = ?').run(bam, id);
    db.prepare('DELETE FROM phien WHERE nguoi_dung_id = ?').run(id);
  })();
}

/** Bất biến: luôn phải còn ≥ 1 quản trị không bị khoá (GĐ4 kiểm tra khi khoá/đổi vai trò). */
export function demQuanTriHoatDong(db: Db): number {
  return (db.prepare("SELECT count(*) AS n FROM nguoi_dung WHERE vai_tro = 'quan-tri' AND bi_khoa = 0").get() as { n: number }).n;
}
