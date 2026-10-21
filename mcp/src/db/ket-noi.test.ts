// Kiểm tra kết nối SQLite, chạy migration một lần, rollback khi migration lỗi.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { moDb } from './ket-noi';
import { MIGRATIONS } from './migrations';

const demBang = (db: ReturnType<typeof moDb>) =>
  (db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table'").get() as { n: number }).n;

describe('moDb', () => {
  it(':memory: bật foreign_keys, journal_mode memory/wal', () => {
    const db = moDb(':memory:');
    expect(['memory', 'wal']).toContain(db.pragma('journal_mode', { simple: true }));
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
  });

  it('file thật dùng WAL và ghi schema_phien_ban = migration cuối', () => {
    const f = join(mkdtempSync(join(tmpdir(), 'vtt-db-')), 'a.sqlite');
    const db = moDb(f);
    expect(db.pragma('journal_mode', { simple: true })).toBe('wal');
    const v = db.prepare("SELECT gia_tri FROM he_thong WHERE khoa='schema_phien_ban'").get() as { gia_tri: string };
    expect(Number(v.gia_tri)).toBe(MIGRATIONS.at(-1)!.phienBan);
    const nd = db.prepare("SELECT gia_tri FROM he_thong WHERE khoa='noi_dung_phien'").get() as { gia_tri: string };
    expect(nd.gia_tri).toBe('0');
    db.close();
  });

  it('mở lại cùng file không chạy lại migration', () => {
    const f = join(mkdtempSync(join(tmpdir(), 'vtt-db-')), 'a.sqlite');
    const a = moDb(f);
    const n = demBang(a);
    a.prepare("UPDATE he_thong SET gia_tri='7' WHERE khoa='noi_dung_phien'").run();
    a.close();
    const b = moDb(f);
    expect(demBang(b)).toBe(n);
    expect((b.prepare("SELECT gia_tri FROM he_thong WHERE khoa='noi_dung_phien'").get() as { gia_tri: string }).gia_tri).toBe('7');
    b.close();
  });

  it('migration lỗi giữa chừng → rollback, DB giữ phiên bản cũ', () => {
    const f = join(mkdtempSync(join(tmpdir(), 'vtt-db-')), 'a.sqlite');
    moDb(f).close();
    const cuoi = MIGRATIONS.at(-1)!.phienBan;
    const hong = [
      ...MIGRATIONS,
      { phienBan: cuoi + 1, sql: 'CREATE TABLE tam_thoi(x); INSERT INTO khong_ton_tai VALUES (1);' },
    ];
    expect(() => moDb(f, hong)).toThrow();
    const db = moDb(f);
    const v = db.prepare("SELECT gia_tri FROM he_thong WHERE khoa='schema_phien_ban'").get() as { gia_tri: string };
    expect(Number(v.gia_tri)).toBe(cuoi);
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name='tam_thoi'").get()).toBeUndefined();
  });
});
