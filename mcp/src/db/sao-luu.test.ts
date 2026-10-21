// Sao lưu SQLite: nhất quán khi đang có ghi, dọn bản cũ giữ 48 bản theo giờ + bản đầu mỗi ngày, khôi phục an toàn.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { moDb } from './ket-noi';
import { donSaoLuu, khoiPhuc, saoLuu } from './sao-luu';

const tam = () => mkdtempSync(join(tmpdir(), 'vtt-sl-'));
const soBai = (db: Database.Database) => (db.prepare('SELECT count(*) AS n FROM bai').get() as { n: number }).n;
const themBai = (db: Database.Database, n: number) => {
  const ins = db.prepare("INSERT INTO bai (tinh, loai, tao_luc, sua_luc) VALUES ('x','nhat-ky',1,1)");
  for (let i = 0; i < n; i++) ins.run();
};

describe('saoLuu', () => {
  it('đặt tên theo giờ Việt Nam và ghi he_thong.sao_luu_cuoi_luc', async () => {
    const db = moDb(join(tam(), 'a.sqlite'));
    const now = Date.UTC(2026, 9, 21, 17, 5); // 00:05 ngày 22/10 giờ VN
    const f = await saoLuu(db, join(tam(), 'sl'), now);
    expect(f.endsWith('vntraveltips-20261022-0005.sqlite')).toBe(true);
    expect(existsSync(f)).toBe(true);
    const v = db.prepare("SELECT gia_tri FROM he_thong WHERE khoa='sao_luu_cuoi_luc'").get() as { gia_tri: string };
    expect(Number(v.gia_tri)).toBe(now);
  });

  it('Review Focus 3: transaction ghi 1000 dòng mở song song → bản sao nhất quán', async () => {
    const f = join(tam(), 'a.sqlite');
    const db = moDb(f);
    themBai(db, 5);
    const ghi = new Database(f);
    ghi.pragma('busy_timeout = 5000');
    ghi.exec('BEGIN');
    themBai(ghi, 1000); // chưa commit
    const p = saoLuu(db, join(tam(), 'sl'), Date.now());
    await new Promise((r) => setImmediate(r));
    ghi.exec('COMMIT');
    const file = await p;
    const sao = new Database(file, { readonly: true });
    expect(sao.pragma('integrity_check', { simple: true })).toBe('ok');
    // Hoặc thấy trạng thái trước commit (5), hoặc sau commit (1005) — không bao giờ nửa vời.
    expect([5, 1005]).toContain(soBai(sao));
    sao.close();
    ghi.close();
  });
});

describe('donSaoLuu', () => {
  const hai = (n: number) => String(n).padStart(2, '0');
  it('100 file trải 20 ngày → còn 48 bản mới nhất + bản đầu mỗi ngày (≤14), không xoá file mới nhất', () => {
    const thu = tam();
    const now = Date.UTC(2026, 9, 21, 12, 0);
    const tenTat: string[] = [];
    for (let i = 0; i < 100; i++) {
      // i=0 là bản cũ nhất: cách 20 ngày, mỗi bản cách ~4,8 giờ
      const t = now - (20 * 24 * 3600_000) + i * Math.floor((20 * 24 * 3600_000) / 99);
      const v = new Date(t + 7 * 3600_000);
      const ten = `vntraveltips-${v.getUTCFullYear()}${hai(v.getUTCMonth() + 1)}${hai(v.getUTCDate())}-${hai(v.getUTCHours())}${hai(v.getUTCMinutes())}.sqlite`;
      writeFileSync(join(thu, ten), 'x');
      tenTat.push(ten);
    }
    const moiNhat = [...tenTat].sort().at(-1)!;
    const daXoa = donSaoLuu(thu, now);
    const con = readdirSync(thu);
    expect(con.length).toBeGreaterThanOrEqual(48);
    expect(con.length).toBeLessThanOrEqual(48 + 14);
    expect(con).toContain(moiNhat);
    expect(daXoa.length + con.length).toBe(tenTat.length);
    for (const ten of [...tenTat].sort().slice(-48)) expect(con).toContain(ten);
    // Mọi file bị xoá đều cũ hơn 48 bản mới nhất.
    for (const ten of daXoa) expect(existsSync(join(thu, ten))).toBe(false);
  });

  it('không đụng file lạ trong thư mục', () => {
    const thu = tam();
    writeFileSync(join(thu, 'ghi-chu.txt'), 'x');
    donSaoLuu(thu, Date.now());
    expect(existsSync(join(thu, 'ghi-chu.txt'))).toBe(true);
  });
});

describe('khoiPhuc', () => {
  it('từ bản sao → DB mở được, đủ dữ liệu, còn bản .truoc-khoi-phuc-*', async () => {
    const thu = tam();
    const f = join(thu, 'a.sqlite');
    const db = moDb(f);
    themBai(db, 3);
    const sao = await saoLuu(db, join(thu, 'sl'), Date.now());
    themBai(db, 4); // sau sao lưu
    db.close();
    khoiPhuc(sao, f);
    const moi = moDb(f);
    expect(soBai(moi)).toBe(3);
    moi.close();
    expect(readdirSync(thu).some((x) => x.startsWith('a.sqlite.truoc-khoi-phuc-'))).toBe(true);
  });

  it('file sao lưu hỏng → ném lỗi, DB hiện tại không đổi', () => {
    const thu = tam();
    const f = join(thu, 'a.sqlite');
    const db = moDb(f);
    themBai(db, 2);
    db.close();
    const hong = join(thu, 'hong.sqlite');
    mkdirSync(thu, { recursive: true });
    writeFileSync(hong, 'đây không phải SQLite '.repeat(200));
    const truoc = readFileSync(f);
    expect(() => khoiPhuc(hong, f)).toThrow();
    expect(readFileSync(f).equals(truoc)).toBe(true);
    expect(readdirSync(thu).some((x) => x.includes('truoc-khoi-phuc'))).toBe(false);
  });
});
