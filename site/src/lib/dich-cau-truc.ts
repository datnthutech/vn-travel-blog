// Bản dịch cấu trúc (chuyên mục, tỉnh, trang, menu, site) do MCP xuất ra dich-cau-truc.json. Thiếu bản dịch → dùng bản tiếng Việt.
import { readFileSync } from 'node:fs';
import { timFileNoiDung } from './noi-dung-dir';

export type LoaiDich = 'chuyen-muc' | 'tinh' | 'trang' | 'menu' | 'site';
interface Dong { loai: LoaiDich; khoa: string; ngonNgu: string; duLieu: Record<string, unknown> }

let nho: { f: string | null; ds: Dong[] } | null = null;
function tatCa(): Dong[] {
  const f = timFileNoiDung('dich-cau-truc.json');
  if (nho && nho.f === f) return nho.ds;
  let ds: Dong[] = [];
  if (f) {
    try {
      ds = JSON.parse(readFileSync(f, 'utf8')) as Dong[];
    } catch {
      ds = [];
    }
  }
  nho = { f, ds };
  return ds;
}

export const layDich = (loai: LoaiDich, khoa: string, ngonNgu: string): Record<string, unknown> | undefined =>
  tatCa().find((d) => d.loai === loai && d.khoa === khoa && d.ngonNgu === ngonNgu)?.duLieu;

/** Chuỗi `truong` của bản dịch, hoặc `macDinh` nếu chưa dịch/để trống. */
export function chuoiDich(loai: LoaiDich, khoa: string, ngonNgu: string, truong: string, macDinh: string): string {
  if (ngonNgu === 'vi') return macDinh;
  const v = layDich(loai, khoa, ngonNgu)?.[truong];
  return typeof v === 'string' && v.trim() !== '' ? v : macDinh;
}
