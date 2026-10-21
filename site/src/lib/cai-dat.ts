// Cài đặt site do MCP xuất ra cai-dat.json (xem lib/noi-dung-dir.ts). Chưa có file → giá trị mặc định, trong đó NOINDEX_ALL và
// GOATCOUNTER_CODE của môi trường chỉ là giá trị khởi tạo (có file thì env không còn tác dụng).
import { readFileSync } from 'node:fs';
import { caiDatSiteMacDinh, caiDatSiteSchema, type CaiDatSite } from '@vntraveltips/schema';
import { timFileNoiDung } from './noi-dung-dir';

/** Cài đặt đọc từ file, hoặc null nếu chưa có file (khi đó dùng mặc định + env). */
export function docCaiDatFile(): CaiDatSite | null {
  const f = timFileNoiDung('cai-dat.json');
  if (!f) return null;
  const kq = caiDatSiteSchema.safeParse(JSON.parse(readFileSync(f, 'utf8')));
  if (!kq.success) throw new Error(`cai-dat.json không hợp lệ: ${kq.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  return kq.data;
}

export const layCaiDatSite = (env: Record<string, string | undefined> = process.env): CaiDatSite => docCaiDatFile() ?? caiDatSiteMacDinh(env);
