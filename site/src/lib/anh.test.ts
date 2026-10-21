import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { layAnhMeta, parseAnhMeta } from './anh';

// Thư mục site/ (anh.test.ts nằm ở site/src/lib/). Astro chạy từ site/, nên dev-anh nằm dưới đây.
const siteDir = join(__dirname, '..', '..');
const thuMucTam = () => mkdtempSync(join(tmpdir(), 'vtt-meta-'));

describe('parseAnhMeta', () => {
  it('đọc rong/cao hợp lệ', () => {
    expect(parseAnhMeta('abc', '{"rong":1600,"cao":1067}')).toEqual({ rong: 1600, cao: 1067 });
  });
  it('thiếu cao → lỗi nêu mã ảnh', () => {
    expect(() => parseAnhMeta('abc', '{"rong":1600}')).toThrow(/abc/);
  });
  it('không phải JSON → lỗi nêu mã ảnh', () => {
    expect(() => parseAnhMeta('abc', '<html>')).toThrow(/abc/);
  });
});

describe('layAnhMeta: đọc meta.json từ đĩa, không bao giờ qua mạng', () => {
  const fetchGia = vi.fn(() => {
    throw new Error('không được gọi fetch');
  });

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchGia);
    vi.spyOn(process, 'cwd').mockReturnValue(siteDir);
    delete process.env.ANH_META_DIR;
    process.env.ANH_BASE_URL = 'https://vntraveltips.monai.click';
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    fetchGia.mockClear();
    delete process.env.ANH_META_DIR;
    delete process.env.ANH_BASE_URL;
  });

  it('có ANH_META_DIR và có file → đọc từ thư mục đó', async () => {
    const meta = thuMucTam();
    mkdirSync(join(meta, 'ma-trong-meta'));
    writeFileSync(join(meta, 'ma-trong-meta', 'meta.json'), '{"rong":800,"cao":600}');
    process.env.ANH_META_DIR = meta;
    expect(await layAnhMeta('ma-trong-meta')).toEqual({ rong: 800, cao: 600 });
    expect(fetchGia).not.toHaveBeenCalled();
  });

  it('có ANH_META_DIR nhưng thiếu file → rơi về site/dev-anh', async () => {
    process.env.ANH_META_DIR = thuMucTam();
    const kyVong = JSON.parse(readFileSync(join(siteDir, 'dev-anh', 'demo-bien', 'meta.json'), 'utf8'));
    expect(await layAnhMeta('demo-bien')).toEqual(kyVong);
    expect(fetchGia).not.toHaveBeenCalled();
  });

  it('không đặt ANH_META_DIR (dù ANH_BASE_URL có) → đọc dev-anh, không fetch', async () => {
    const kyVong = JSON.parse(readFileSync(join(siteDir, 'dev-anh', 'demo-can-ho', 'meta.json'), 'utf8'));
    expect(await layAnhMeta('demo-can-ho')).toEqual(kyVong);
    expect(fetchGia).not.toHaveBeenCalled();
  });

  it('không có ở đâu → lỗi nêu mã ảnh và cả hai đường dẫn đã tìm', async () => {
    const meta = thuMucTam();
    process.env.ANH_META_DIR = meta;
    const loi = await layAnhMeta('khong-co-anh').catch((e: Error) => e);
    expect(loi).toBeInstanceOf(Error);
    expect((loi as Error).message).toContain('khong-co-anh');
    expect((loi as Error).message).toContain(join(meta, 'khong-co-anh', 'meta.json'));
    expect((loi as Error).message).toContain(join(siteDir, 'dev-anh', 'khong-co-anh', 'meta.json'));
    expect(fetchGia).not.toHaveBeenCalled();
  });
});
