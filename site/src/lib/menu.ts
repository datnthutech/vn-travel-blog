// Menu đầu/chân trang: đọc menu.json (do MCP xuất từ DB; thiếu thì dùng menu mặc định), rồi giải thành link theo dữ liệu của lần build này.
import { readFileSync } from 'node:fs';
import { giaiMenu, menuSchema, type DuLieuMenu, type Menu, type MucDaGiai } from '@vntraveltips/schema';
import { timFileNoiDung } from './noi-dung-dir';

/** Menu mặc định = giao diện hiện tại: chỉ có tên blog, không có mục nào. */
export const MENU_MAC_DINH: Menu = { dauTrang: [], chanTrang: [] };

export function layMenu(): Menu {
  const f = timFileNoiDung('menu.json');
  if (!f) return MENU_MAC_DINH;
  const kq = menuSchema.safeParse(JSON.parse(readFileSync(f, 'utf8')));
  if (!kq.success) {
    console.warn('menu.json không hợp lệ, dùng menu mặc định:', kq.error.issues.map((i) => i.message).join('; '));
    return MENU_MAC_DINH;
  }
  return kq.data;
}

export const giaiMenuViTri = (vitri: keyof Menu, d: DuLieuMenu, menu: Menu = layMenu()): MucDaGiai[] => giaiMenu(menu[vitri], d);
