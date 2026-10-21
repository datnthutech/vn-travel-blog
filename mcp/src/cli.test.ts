// CLI quản trị: sao lưu, khôi phục (phải gõ KHOI-PHUC), nhập nội dung.
import { mkdirSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { chayCli, type CliIo } from './cli';
import { duongDanDb, moDb } from './db/ket-noi';

function dung(tra: string[] = []) {
  const dataDir = mkdtempSync(join(tmpdir(), 'vtt-cli-'));
  mkdirSync(join(dataDir, 'db'), { recursive: true });
  const ra: string[] = [];
  const loi: string[] = [];
  const io: CliIo = {
    dataDir,
    now: () => Date.UTC(2026, 9, 21, 3, 0),
    hoi: async () => tra.shift() ?? '',
    docMatKhau: async () => 'mat-khau-dai-hon-12',
    in: (s) => ra.push(s),
    loi: (s) => loi.push(s),
  };
  return { dataDir, io, ra, loi };
}

describe('cli', () => {
  it('lệnh lạ → mã thoát khác 0', async () => {
    const { io } = dung();
    expect(await chayCli(['khong-co'], io)).not.toBe(0);
  });

  it('sao-luu tạo file trong db/sao-luu', async () => {
    const { io, dataDir } = dung();
    moDb(duongDanDb(dataDir)).close();
    expect(await chayCli(['sao-luu'], io)).toBe(0);
    expect(readdirSync(join(dataDir, 'db/sao-luu'))).toHaveLength(1);
  });

  it('khoi-phuc không gõ KHOI-PHUC → mã khác 0, không đổi gì', async () => {
    const { io, dataDir } = dung(['co']);
    const f = duongDanDb(dataDir);
    const db = moDb(f);
    db.close();
    await chayCli(['sao-luu'], io);
    const sao = join(dataDir, 'db/sao-luu', readdirSync(join(dataDir, 'db/sao-luu'))[0]!);
    const truoc = readFileSync(f);
    expect(await chayCli(['khoi-phuc', '--file', sao], io)).not.toBe(0);
    expect(readFileSync(f).equals(truoc)).toBe(true);
    expect(readdirSync(join(dataDir, 'db')).some((x) => x.includes('truoc-khoi-phuc'))).toBe(false);
  });

  it('khoi-phuc gõ đúng KHOI-PHUC → khôi phục', async () => {
    const { io, dataDir } = dung(['KHOI-PHUC']);
    moDb(duongDanDb(dataDir)).close();
    await chayCli(['sao-luu'], io);
    const sao = join(dataDir, 'db/sao-luu', readdirSync(join(dataDir, 'db/sao-luu'))[0]!);
    expect(await chayCli(['khoi-phuc', '--file', sao], io)).toBe(0);
    expect(readdirSync(join(dataDir, 'db')).some((x) => x.includes('truoc-khoi-phuc'))).toBe(true);
  });
});
