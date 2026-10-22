// Xác thực 2 lớp: TOTP 6 số, bước 30 giây (tương thích Google Authenticator) + 10 mã dự phòng dùng một lần.
import { createHash, randomInt } from 'node:crypto';
import * as OTPAuth from 'otpauth';

const PERIOD = 30;
const tao = (secret: OTPAuth.Secret, email = 'tai-khoan') =>
  new OTPAuth.TOTP({ issuer: 'VNTravelTips', label: email, algorithm: 'SHA1', digits: 6, period: PERIOD, secret });

export function taoBiMatTotp(email: string): { biMat: string; otpauthUrl: string } {
  const secret = new OTPAuth.Secret({ size: 20 });
  return { biMat: secret.base32, otpauthUrl: tao(secret, email).toString() };
}

/** Kiểm tra mã; cho lệch ±1 bước. Trả số bước (epoch/30s) của mã đúng, hoặc null nếu sai. */
export function buocTotpDung(biMat: string, ma: string, now: number): number | null {
  if (!/^\d{6}$/.test(ma)) return null;
  const delta = tao(OTPAuth.Secret.fromBase32(biMat)).validate({ token: ma, timestamp: now, window: 1 });
  return delta === null ? null : Math.floor(now / 1000 / PERIOD) + delta;
}

export const kiemMaTotp = (biMat: string, ma: string, now: number): boolean => buocTotpDung(biMat, ma, now) !== null;

/** Mã TOTP đúng tại thời điểm `now` (dùng cho test). */
export const maTotpHienTai = (biMat: string, now: number): string => tao(OTPAuth.Secret.fromBase32(biMat)).generate({ timestamp: now });

const KY_TU = 'abcdefghjkmnpqrstuvwxyz23456789'; // bỏ các ký tự dễ nhầm (i, l, o, 0, 1)

/** 10 mã dự phòng, mỗi mã 10 ký tự. Chỉ trả bản rõ MỘT lần; DB lưu băm. */
export function taoMaDuPhong(): string[] {
  return Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => KY_TU[randomInt(KY_TU.length)]).join(''));
}

/** Mã dự phòng đủ dài, ngẫu nhiên nên băm SHA-256 là đủ (không cần băm chậm như mật khẩu). */
export const bamMaDuPhong = (ma: string): string => createHash('sha256').update(chuanMaDuPhong(ma)).digest('hex');
export const chuanMaDuPhong = (ma: string): string => ma.toLowerCase().replace(/[\s-]/g, '');
export const giongMaDuPhong = (ma: string): boolean => /^[a-z0-9]{10}$/.test(chuanMaDuPhong(ma));
