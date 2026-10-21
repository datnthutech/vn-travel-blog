// Ngôn ngữ của site. `vi` là gốc, luôn bật. Mã ngôn ngữ chiếm đường dẫn cấp 1 (/<mã>/…) nên không được trùng slug tỉnh/trang/hệ thống.
import { SLUG_HE_THONG } from '@vntraveltips/schema';
import type { Db } from '../db/ket-noi';
import { LoiNghiepVu } from './chuyen-muc';
import { slugTrang } from './slug-cap-1';

export interface NgonNgu { ma: string; ten: string; bat: boolean; thuTu: number }
const MA = /^[a-z]{2}(-[a-z]{2})?$/;
const sang = (r: { ma: string; ten: string; bat: number; thu_tu: number }): NgonNgu => ({ ma: r.ma, ten: r.ten, bat: r.bat === 1, thuTu: r.thu_tu });

export const lietKeNgonNgu = (db: Db): NgonNgu[] =>
  (db.prepare('SELECT ma, ten, bat, thu_tu FROM ngon_ngu ORDER BY thu_tu, ma').all() as Parameters<typeof sang>[0][]).map(sang);
/** Mọi mã đã có (kể cả đang tắt) — vẫn giữ chỗ trong đường dẫn. */
export const maNgonNguDaCo = (db: Db): string[] => (db.prepare('SELECT ma FROM ngon_ngu').all() as { ma: string }[]).map((r) => r.ma);
export const maNgonNguDangBat = (db: Db): string[] => lietKeNgonNgu(db).filter((n) => n.bat).map((n) => n.ma);

const tenHopLe = (v: unknown): string => {
  const t = typeof v === 'string' ? v.trim() : '';
  if (t.length < 1 || t.length > 60) throw new LoiNghiepVu('Tên ngôn ngữ cần từ 1 đến 60 ký tự');
  return t;
};

export function themNgonNgu(db: Db, input: { ma?: unknown; ten?: unknown }): NgonNgu {
  const ma = typeof input.ma === 'string' ? input.ma : '';
  if (!MA.test(ma)) throw new LoiNghiepVu('Mã ngôn ngữ gồm 2 chữ cái thường (vd en) hoặc dạng zh-cn');
  if (ma === 'vi') throw new LoiNghiepVu('Tiếng Việt là ngôn ngữ gốc, đã có sẵn');
  const ten = tenHopLe(input.ten);
  if (maNgonNguDaCo(db).includes(ma)) throw new LoiNghiepVu(`Ngôn ngữ "${ma}" đã có`, 409);
  if (SLUG_HE_THONG.includes(ma) || ma === 'trang') throw new LoiNghiepVu(`Mã "${ma}" trùng đường dẫn hệ thống`);
  if (db.prepare('SELECT 1 FROM tinh WHERE slug = ?').get(ma)) throw new LoiNghiepVu(`Mã "${ma}" trùng slug một tỉnh — đổi slug tỉnh trước`);
  if (slugTrang(db).includes(ma)) throw new LoiNghiepVu(`Mã "${ma}" trùng slug một trang tĩnh — đổi slug trang trước`);
  const thuTu = (db.prepare('SELECT coalesce(max(thu_tu), 0) + 1 AS n FROM ngon_ngu').get() as { n: number }).n;
  db.prepare('INSERT INTO ngon_ngu (ma, ten, bat, thu_tu) VALUES (?, ?, 1, ?)').run(ma, ten, thuTu);
  return { ma, ten, bat: true, thuTu };
}

export function suaNgonNgu(db: Db, ma: string, input: { ten?: unknown; bat?: unknown; thuTu?: unknown }): NgonNgu {
  const cu = lietKeNgonNgu(db).find((n) => n.ma === ma);
  if (!cu) throw new LoiNghiepVu('Không tìm thấy ngôn ngữ', 404);
  const ten = input.ten === undefined ? cu.ten : tenHopLe(input.ten);
  const bat = input.bat === undefined ? cu.bat : input.bat === true;
  if (input.bat !== undefined && typeof input.bat !== 'boolean') throw new LoiNghiepVu('bat phải là true/false');
  if (ma === 'vi' && !bat) throw new LoiNghiepVu('Không tắt được tiếng Việt (ngôn ngữ gốc)');
  if (input.thuTu !== undefined && !Number.isInteger(input.thuTu)) throw new LoiNghiepVu('thuTu phải là số nguyên');
  const thuTu = input.thuTu === undefined ? cu.thuTu : (input.thuTu as number);
  db.prepare('UPDATE ngon_ngu SET ten = ?, bat = ?, thu_tu = ? WHERE ma = ?').run(ten, bat ? 1 : 0, thuTu, ma);
  return { ma, ten, bat, thuTu };
}
