// Tạo slug từ tiêu đề tiếng Việt. Dùng chung cho trang quản trị và các tool: bỏ dấu, "đ/Đ" → "d", chỉ a-z 0-9 và "-".

const TOI_DA = 80;
const MAC_DINH = 'bai-viet';

export const slugHopLe = (s: string): boolean => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s);

export function taoSlug(chuoi: string): string {
  let s = chuoi
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (s.length > TOI_DA) {
    const cat = s.slice(0, TOI_DA);
    // Cắt giữa từ thì lùi về dấu "-" gần nhất (nếu có) để slug không bị cụt chữ.
    s = s[TOI_DA] === '-' || !cat.includes('-') ? cat : cat.slice(0, cat.lastIndexOf('-'));
    s = s.replace(/-+$/g, '');
  }
  return s || MAC_DINH;
}
