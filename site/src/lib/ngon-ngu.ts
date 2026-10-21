// Ngôn ngữ đang bật: ngon-ngu.json do MCP xuất (vi luôn đứng đầu). Chưa có file (build local/bài mẫu) → chỉ tiếng Việt.
import { readFileSync } from 'node:fs';
import { timFileNoiDung } from './noi-dung-dir';

export interface NgonNguBat { ma: string; ten: string }

export function layNgonNguBat(): NgonNguBat[] {
  const f = timFileNoiDung('ngon-ngu.json');
  const vi: NgonNguBat = { ma: 'vi', ten: 'Tiếng Việt' };
  if (!f) return [vi];
  try {
    const ds = (JSON.parse(readFileSync(f, 'utf8')) as NgonNguBat[]).filter((n) => /^[a-z]{2}(-[a-z]{2})?$/.test(n.ma) && n.ma !== 'vi');
    return [vi, ...ds.map((n) => ({ ma: n.ma, ten: n.ten }))];
  } catch {
    return [vi];
  }
}
/** Ngôn ngữ KHÁC tiếng Việt đang bật. */
export const layNgonNguPhu = (): NgonNguBat[] => layNgonNguBat().filter((n) => n.ma !== 'vi');
