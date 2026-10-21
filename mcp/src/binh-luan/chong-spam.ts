// Chống spam bình luận nhiều lớp: vé gửi có chữ ký + thời gian tối thiểu, ô bẫy, giới hạn theo IP, đếm link và từ cấm.
import { createHmac, timingSafeEqual } from 'node:crypto';

export const THOI_GIAN_TOI_THIEU_MS = 3000;
export const HAN_VE_MS = 24 * 3600_000;
export const TOI_DA_MOI_IP = 3;
export const CUA_SO_IP_MS = 10 * 60_000;
export const TOI_DA_LINK = 2;

const ky = (khoaBiMat: string, baiId: number, ngonNgu: string, luc: number) => createHmac('sha256', khoaBiMat).update(`binh-luan|${baiId}|${ngonNgu}|${luc}`).digest('hex');

/** Vé gửi = `luc.chữ-ký`: gắn với bài + ngôn ngữ + thời điểm tải trang, dùng để đo "người thật không gửi nhanh hơn 3 giây". */
export const taoVeGui = (khoaBiMat: string, baiId: number, ngonNgu: string, luc: number): string => `${luc}.${ky(khoaBiMat, baiId, ngonNgu, luc)}`;

export type KetQuaVe = 'ok' | 'sai' | 'som' | 'het-han';
export function kiemVeGui(khoaBiMat: string, baiId: number, ngonNgu: string, ve: unknown, now: number): KetQuaVe {
  const m = typeof ve === 'string' ? /^(\d{10,16})\.([0-9a-f]{64})$/.exec(ve) : null;
  if (!m) return 'sai';
  const luc = Number(m[1]);
  const dung = Buffer.from(ky(khoaBiMat, baiId, ngonNgu, luc));
  const co = Buffer.from(m[2]!);
  if (co.length !== dung.length || !timingSafeEqual(co, dung)) return 'sai';
  if (now - luc < THOI_GIAN_TOI_THIEU_MS) return 'som';
  if (now - luc > HAN_VE_MS) return 'het-han';
  return 'ok';
}

/** Bỏ dấu tiếng Việt, đ → d, chữ thường — để so từ cấm "Cờ bạc" với "co bac". */
export const boDau = (s: string): string => s.replace(/đ/g, 'd').replace(/Đ/g, 'd').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const demLink = (s: string): number => (s.match(/https?:\/\/|www\./gi) ?? []).length;

/** Hiện ngay hay vào hàng chờ xem (nhiều link hoặc có từ cấm). */
export function phanLoai(noiDung: string, tuCam: string[]): { trangThai: 'hien' | 'cho-xem'; lyDo?: string } {
  if (demLink(noiDung) > TOI_DA_LINK) return { trangThai: 'cho-xem', lyDo: `Có hơn ${TOI_DA_LINK} liên kết` };
  const nd = boDau(noiDung);
  const tu = tuCam.find((t) => t.trim() && nd.includes(boDau(t).trim()));
  if (tu) return { trangThai: 'cho-xem', lyDo: `Chứa từ cấm: ${tu}` };
  return { trangThai: 'hien' };
}
