// Token cho link tải ảnh. Một "phiên tải": mở link, chọn nhiều ảnh, gửi lần lượt, bấm xong → token đóng.
// Hết hạn mặc định sau 30 phút. Lưu trong bộ nhớ (một tiến trình duy nhất) — khởi động lại container thì token cũ mất, không sao.
// Ta chỉ giữ SHA-256 của token, nên dù ai đó đọc được bộ nhớ/log cũng không dựng lại được link.
import { createHash, randomBytes } from 'node:crypto';

export type TrangThaiToken = 'ok' | 'khong-co' | 'het-han' | 'da-dong';

interface Phien {
  hetHan: number;
  daDong: boolean;
}
const kho = new Map<string, Phien>();
const bam = (t: string) => createHash('sha256').update(t).digest('hex');

export const TTL_MAC_DINH = 30 * 60_000;

export function taoToken(ttlMs = TTL_MAC_DINH, now: () => number = Date.now): string {
  const t = randomBytes(32).toString('hex');
  kho.set(bam(t), { hetHan: now() + ttlMs, daDong: false });
  // dọn các phiên đã hết hạn để bộ nhớ không phình
  for (const [k, p] of kho) if (p.hetHan < now() - TTL_MAC_DINH) kho.delete(k);
  return t;
}

export function trangThaiToken(t: string, now: () => number = Date.now): TrangThaiToken {
  const p = kho.get(bam(t));
  if (!p) return 'khong-co';
  if (p.daDong) return 'da-dong';
  if (now() >= p.hetHan) return 'het-han';
  return 'ok';
}

export const dungToken = (t: string, now: () => number = Date.now): boolean => trangThaiToken(t, now) === 'ok';

export function dongToken(t: string): void {
  const p = kho.get(bam(t));
  if (p) p.daDong = true;
}
