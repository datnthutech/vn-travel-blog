// Mã hoá bí mật (mật khẩu SMTP, API key AI) trước khi lưu vào SQLite: AES-256-GCM, IV ngẫu nhiên 12 byte mỗi lần.
// Khoá là KHOA_BI_MAT (64 ký tự hex) trong deploy/.env. Bí mật không bao giờ được trả ra API, log hay thông báo lỗi.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { Db } from './db/ket-noi';

const khoaBuffer = (khoaHex: string): Buffer => {
  if (!/^[0-9a-fA-F]{64}$/.test(khoaHex)) throw new Error('Khoá bí mật phải gồm 64 ký tự hex');
  return Buffer.from(khoaHex, 'hex');
};

/** Kết quả: base64url(iv ‖ tag ‖ bản mã). */
export function maHoa(khoaHex: string, chuoi: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', khoaBuffer(khoaHex), iv);
  const ma = Buffer.concat([c.update(chuoi, 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ma]).toString('base64url');
}

/** Sai khoá hoặc dữ liệu bị sửa → ném lỗi (GCM tự xác thực). */
export function giaiMa(khoaHex: string, chuoiMaHoa: string): string {
  const b = Buffer.from(chuoiMaHoa, 'base64url');
  if (b.length < 28) throw new Error('Dữ liệu mã hoá không hợp lệ');
  const d = createDecipheriv('aes-256-gcm', khoaBuffer(khoaHex), b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  try {
    return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
  } catch {
    throw new Error('Không giải mã được bí mật (sai KHOA_BI_MAT hoặc dữ liệu hỏng)');
  }
}

// Ghi chú về chữ ký: thiết kế ghi `luuBiMat(db, khoa, giaTri)`, nhưng cần thêm khoá mã hoá nên tham số đầu sau db là `khoaBiMat`.
export function luuBiMat(db: Db, khoaBiMat: string, ten: string, giaTri: string): void {
  db.prepare('INSERT OR REPLACE INTO bi_mat (khoa, gia_tri_ma_hoa) VALUES (?, ?)').run(ten, maHoa(khoaBiMat, giaTri));
}

export function docBiMat(db: Db, khoaBiMat: string, ten: string): string | null {
  const r = db.prepare('SELECT gia_tri_ma_hoa FROM bi_mat WHERE khoa = ?').get(ten) as { gia_tri_ma_hoa: string } | undefined;
  return r ? giaiMa(khoaBiMat, r.gia_tri_ma_hoa) : null;
}

export function xoaBiMat(db: Db, ten: string): void {
  db.prepare('DELETE FROM bi_mat WHERE khoa = ?').run(ten);
}

export const coBiMat = (db: Db, ten: string): boolean => db.prepare('SELECT 1 FROM bi_mat WHERE khoa = ?').get(ten) !== undefined;
