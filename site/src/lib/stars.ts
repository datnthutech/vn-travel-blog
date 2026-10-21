// Đổi điểm 1–5 thành chuỗi sao để hiện trong khung Tra nhanh (vd 4 → ★★★★☆).
export function sao(diem: number): string {
  const n = Math.min(5, Math.max(1, Math.round(diem)));
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}
