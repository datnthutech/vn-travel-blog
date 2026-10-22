// Chuỗi giao diện theo ngôn ngữ. chuỗi gốc nằm ở packages/schema/src/giao-dien-vi.json; ngôn ngữ khác lấy từ giao-dien/<mã>.json do MCP xuất từ DB
// (NOI_DUNG_DIR). Thiếu khoá → rơi về tiếng Việt (build vẫn chạy; script write-build-json liệt kê khoá thiếu vào build.json).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CHUOI_GIAO_DIEN_VI, type KhoaGiaoDien } from '@vntraveltips/schema';

export type { KhoaGiaoDien };
export const CHUOI_VI = CHUOI_GIAO_DIEN_VI;

const nho = new Map<string, Record<string, string>>();
export function chuoiNgonNgu(ngonNgu: string, env: Record<string, string | undefined> = process.env): Record<string, string> {
  if (ngonNgu === 'vi') return CHUOI_VI;
  const khoa = `${env.NOI_DUNG_DIR ?? ''}|${ngonNgu}`;
  const cu = nho.get(khoa);
  if (cu) return cu;
  let d: Record<string, string> = {};
  const f = env.NOI_DUNG_DIR ? join(env.NOI_DUNG_DIR, 'giao-dien', `${ngonNgu}.json`) : '';
  if (f && existsSync(f)) {
    try {
      d = JSON.parse(readFileSync(f, 'utf8')) as Record<string, string>;
    } catch {
      d = {}; // file hỏng → dùng tiếng Việt, không làm hỏng build
    }
  }
  nho.set(khoa, d);
  return d;
}

/** Lấy chuỗi; `thamSo` thay các {ten}. Thiếu bản dịch → chuỗi tiếng Việt. */
export function t(ngonNgu: string, khoa: KhoaGiaoDien, thamSo: Record<string, string | number> = {}, env?: Record<string, string | undefined>): string {
  const goc = chuoiNgonNgu(ngonNgu, env)[khoa];
  const chuoi = typeof goc === 'string' && goc !== '' ? goc : CHUOI_VI[khoa]!;
  return chuoi.replace(/\{(\w+)\}/g, (m, k: string) => (k in thamSo ? String(thamSo[k]) : m));
}

/** Khoá có trong tiếng Việt mà ngôn ngữ `ngonNgu` chưa có (hoặc để trống). */
export function khoaThieu(ngonNgu: string, env?: Record<string, string | undefined>): string[] {
  const d = chuoiNgonNgu(ngonNgu, env);
  return Object.keys(CHUOI_VI).filter((k) => typeof d[k] !== 'string' || d[k] === '');
}
