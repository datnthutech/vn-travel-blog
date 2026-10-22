// Chấm ô SEO ngay khi gõ. Ngưỡng mô tả theo schema (120–160); tiêu đề gợi ý 30–65 ký tự để Google không cắt.
export type DanhGia = { doDai: number; trangThai: 'tot' | 'ngan' | 'dai' };

const dem = (s: string) => [...s].length; // đếm ký tự người đọc thấy (không đếm byte / mảnh dấu)
const chamKhoang = (s: string, tu: number, den: number): DanhGia => {
  const doDai = dem(s.normalize('NFC'));
  return { doDai, trangThai: doDai < tu ? 'ngan' : doDai > den ? 'dai' : 'tot' };
};

export const danhGiaTieuDe = (s: string): DanhGia => chamKhoang(s, 30, 65);
export const danhGiaMoTa = (s: string): DanhGia => chamKhoang(s, 120, 160);

const cat = (s: string, toiDa: number) => {
  const k = [...s];
  return k.length <= toiDa ? s : `${k.slice(0, toiDa - 1).join('').trimEnd()}…`;
};

/** Mô phỏng kết quả tìm kiếm Google: tiêu đề cắt ở 60, mô tả cắt ở 160, đường dẫn dạng "miền › tỉnh › slug". */
export function xemTruocGoogle(x: { tieuDe: string; url: string; moTa: string }): { tieuDe: string; duongDan: string; moTa: string } {
  let duongDan = x.url;
  try {
    const u = new URL(x.url);
    duongDan = [u.host, ...u.pathname.split('/').filter(Boolean)].join(' › ');
  } catch {
    /* url chưa đầy đủ: hiện nguyên văn */
  }
  return { tieuDe: x.tieuDe.trim() ? cat(x.tieuDe, 60) : '(chưa có tiêu đề)', duongDan, moTa: x.moTa.trim() ? cat(x.moTa, 160) : '(chưa có mô tả)' };
}
