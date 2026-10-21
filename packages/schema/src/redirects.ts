// Redirect 301 cho URL bài đã đổi (vd đổi tỉnh). Danh sách nằm ở site/redirects.json: [{ "tu": "/cu/", "den": "/moi/" }].
// Lúc build, site ghi lại thành dist/redirects.json (đã kiểm tra); dịch vụ MCP đọc file đó để trả 301 cho nginx.
// (Không dùng file cấu hình nginx do bên deploy ghi: như vậy vừa không cần reload nginx, vừa không thể bị chèn cấu hình.)
import { urlBai } from './bai-viet';

export interface Redirect {
  tu: string;
  den: string;
}

// Chỉ cho ký tự an toàn: bắt đầu và kết thúc bằng "/", các đoạn là chữ thường/số/chấm/gạch ngang (không có "..", khoảng trắng,
// xuống dòng, dấu nháy hay "//"). Dùng cả khi build lẫn khi dịch vụ MCP đọc file → không thể chèn header hay chuyển hướng ra ngoài.
const DUONG_DAN = /^\/([a-z0-9][a-z0-9.-]*\/)*$/;
export const duongDanRedirectHopLe = (p: string): boolean => DUONG_DAN.test(p) && !p.includes('..');

export function kiemTraRedirects(daDang: { slug: string; tinh?: string }[], redirects: Redirect[]): Redirect[] {
  const urlThat = new Set(daDang.map((b) => urlBai(b)));
  const cacTu = new Set<string>();

  for (const r of redirects) {
    for (const p of [r.tu, r.den]) {
      if (!duongDanRedirectHopLe(p)) throw new Error(`Redirect: đường dẫn không hợp lệ "${p}"`);
    }
    if (cacTu.has(r.tu)) throw new Error(`Redirect: "${r.tu}" bị trùng`);
    cacTu.add(r.tu);
    if (urlThat.has(r.tu)) throw new Error(`Redirect: "${r.tu}" đè lên một bài đang có`);
    if (!urlThat.has(r.den)) throw new Error(`Redirect: đích "${r.den}" không có bài nào`);
  }
  // Không cần kiểm tra chuỗi/vòng: `tu` không được là URL thật còn `den` phải là URL thật → không thể nối nhau.
  return redirects;
}
