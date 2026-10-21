import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Config } from '../config';
import type { HangDoiBuild } from './hang-doi';
import { khiKhoiDong } from './khoi-dong';

function hangDoiGia() {
  let soLan = 0;
  const hangDoi: HangDoiBuild = {
    yeuCau: () => void soLan++,
    trangThai: () => ({ trangThai: 'roi', dangCho: false, lanCuoi: null }),
    doiXong: async () => {},
  };
  return { hangDoi, soLan: () => soLan };
}

function configTam(coBanBuild: boolean): Config {
  const dataDir = mkdtempSync(join(tmpdir(), 'vtt-kd-'));
  if (coBanBuild) {
    mkdirSync(join(dataDir, 'builds', 'b1', 'production'), { recursive: true });
    writeFileSync(join(dataDir, 'builds', 'b1', 'production', 'index.html'), '<h1>ok</h1>');
    symlinkSync(join('builds', 'b1', 'production'), join(dataDir, 'site'));
  }
  return { dataDir } as Config;
}

describe('khiKhoiDong', () => {
  it('chưa có bản build → xếp một lượt build lần đầu', async () => {
    const { hangDoi, soLan } = hangDoiGia();
    const log: string[] = [];
    await khiKhoiDong(configTam(false), hangDoi, (s) => log.push(s));
    expect(soLan()).toBe(1);
    expect(log.join('\n')).toMatch(/lần đầu/);
  });

  it('đã có bản build → vẫn xếp một lượt build để nhận cấu hình mới (NOINDEX_ALL, GOATCOUNTER_CODE)', async () => {
    const { hangDoi, soLan } = hangDoiGia();
    const log: string[] = [];
    await khiKhoiDong(configTam(true), hangDoi, (s) => log.push(s));
    expect(soLan()).toBe(1);
    expect(log.join('\n')).toMatch(/bản cũ/);
  });
});
