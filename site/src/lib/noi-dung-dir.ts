// Tìm file nội dung do MCP xuất (chuyen-muc.json, menu.json, cai-dat.json, trang/*.md…).
// Có NOI_DUNG_DIR (build từ DB) → ưu tiên thư mục đó; thiếu file ở đó hoặc không đặt biến → dùng file mẫu trong ./src/content.
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export const thuMucMacDinh = (): string => join(process.cwd(), 'src', 'content');

/** Đường dẫn file nội dung `tuongDoi`, hoặc null nếu cả thư mục xuất lẫn thư mục mẫu đều không có. */
export function timFileNoiDung(tuongDoi: string): string | null {
  const dirs = [process.env.NOI_DUNG_DIR, thuMucMacDinh()].filter((x): x is string => !!x);
  for (const d of dirs) {
    const f = join(d, tuongDoi);
    if (existsSync(f)) return f;
  }
  return null;
}
