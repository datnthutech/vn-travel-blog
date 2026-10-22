// Băm và kiểm tra mật khẩu bằng argon2id (@node-rs/argon2: bản dựng sẵn, không cần biên dịch).
import { hash, verify } from '@node-rs/argon2';

export const MAT_KHAU_TOI_THIEU = 12;

export function bamMatKhau(mk: string): Promise<string> {
  return hash(mk); // mặc định argon2id, có muối ngẫu nhiên mỗi lần
}

export async function kiemMatKhau(bam: string, mk: string): Promise<boolean> {
  try {
    return await verify(bam, mk);
  } catch {
    return false; // chuỗi băm hỏng → coi như sai, không lộ lỗi nội bộ
  }
}

/** null = hợp lệ; ngược lại là thông báo lỗi tiếng Việt. */
export function matKhauHopLe(mk: string): string | null {
  return mk.length >= MAT_KHAU_TOI_THIEU ? null : `Mật khẩu phải có ít nhất ${MAT_KHAU_TOI_THIEU} ký tự.`;
}
