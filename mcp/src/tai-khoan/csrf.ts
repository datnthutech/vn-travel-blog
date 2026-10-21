// Token CSRF = HMAC-SHA256(KHOA_BI_MAT, id phiên). Gắn với phiên nên không dùng chéo được; không cần lưu DB.
import { createHmac, timingSafeEqual } from 'node:crypto';

export const taoCsrf = (khoaBiMat: string, phienId: number): string => createHmac('sha256', khoaBiMat).update(`csrf:${phienId}`).digest('hex');

export function kiemCsrf(khoaBiMat: string, phienId: number, token: unknown): boolean {
  if (typeof token !== 'string') return false;
  const dung = Buffer.from(taoCsrf(khoaBiMat, phienId));
  const co = Buffer.from(token);
  return co.length === dung.length && timingSafeEqual(co, dung);
}
