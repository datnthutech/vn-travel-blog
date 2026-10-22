// Chuyên mục do chủ blog quản lý: MCP xuất ra chuyen-muc.json (xem lib/noi-dung-dir.ts); chưa có thì dùng file mẫu 5 chuyên mục.
import { readFileSync } from 'node:fs';
import { timFileNoiDung } from './noi-dung-dir';

export interface ChuyenMuc {
  slug: string;
  ten: string;
  moTa: string;
  anhBia?: { ma: string; alt: string };
  thuTu: number;
}

export function layChuyenMuc(): ChuyenMuc[] {
  const f = timFileNoiDung('chuyen-muc.json');
  if (!f) return [];
  const ds = JSON.parse(readFileSync(f, 'utf8')) as ChuyenMuc[];
  return [...ds].sort((a, b) => a.thuTu - b.thuTu || a.slug.localeCompare(b.slug));
}
