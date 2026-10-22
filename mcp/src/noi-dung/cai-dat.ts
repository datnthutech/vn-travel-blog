// Đọc/ghi các khoá cài đặt (bảng `cai_dat`: khoá → JSON). Mỗi lần ghi đánh dấu nội dung đổi để build lại.
import type { Db } from '../db/ket-noi';
import { danhDauNoiDungDoi } from './phien-noi-dung';

export function docCaiDat<T>(db: Db, khoa: string): T | null {
  const r = db.prepare('SELECT gia_tri FROM cai_dat WHERE khoa = ?').get(khoa) as { gia_tri: string } | undefined;
  return r ? (JSON.parse(r.gia_tri) as T) : null;
}

export function ghiCaiDat(db: Db, khoa: string, giaTri: unknown): void {
  db.transaction(() => {
    db.prepare('INSERT OR REPLACE INTO cai_dat (khoa, gia_tri) VALUES (?, ?)').run(khoa, JSON.stringify(giaTri));
    danhDauNoiDungDoi(db);
  })();
}
