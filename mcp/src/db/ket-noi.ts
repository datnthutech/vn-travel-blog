// Mở SQLite (better-sqlite3), bật WAL + khoá ngoại và chạy các migration chưa áp dụng.
import Database from 'better-sqlite3';
import { MIGRATIONS, type Migration } from './migrations';

export type Db = Database.Database;

/** Mở (hoặc tạo) DB tại `duongDan` (hoặc ':memory:'). Mỗi migration chạy trong một transaction riêng. */
export function moDb(duongDan: string, migrations: Migration[] = MIGRATIONS): Db {
  const db = new Database(duongDan);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec('CREATE TABLE IF NOT EXISTS he_thong (khoa TEXT PRIMARY KEY, gia_tri TEXT)');
  const hienTai = Number(
    (db.prepare("SELECT gia_tri FROM he_thong WHERE khoa = 'schema_phien_ban'").get() as { gia_tri: string } | undefined)
      ?.gia_tri ?? 0,
  );
  const datPhienBan = db.prepare("INSERT OR REPLACE INTO he_thong (khoa, gia_tri) VALUES ('schema_phien_ban', ?)");
  try {
    for (const m of migrations.filter((x) => x.phienBan > hienTai).sort((a, b) => a.phienBan - b.phienBan)) {
      db.transaction(() => {
        db.exec(m.sql);
        datPhienBan.run(String(m.phienBan));
      })();
    }
    db.prepare("INSERT OR IGNORE INTO he_thong (khoa, gia_tri) VALUES ('noi_dung_phien', '0')").run();
  } catch (e) {
    db.close();
    throw e;
  }
  return db;
}

/** Đường dẫn file DB trong thư mục dữ liệu chung (volume /data). */
export const duongDanDb = (dataDir: string): string => `${dataDir}/db/vntraveltips.sqlite`;
