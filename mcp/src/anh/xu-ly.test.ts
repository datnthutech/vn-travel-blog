import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AnhKhongHopLe, xuLyAnh } from './xu-ly';
import { conDungLuong } from './dung-luong';

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'vtt-anh-'));
});
afterAll(() => rm(dir, { recursive: true, force: true }));

// Ảnh thử: màu phẳng, có EXIF GPS (và tuỳ chọn orientation).
const taoJpeg = (w: number, h: number, orientation?: number) =>
  sharp({ create: { width: w, height: h, channels: 3, background: '#2a9d8f' } })
    .jpeg()
    .withMetadata({
      ...(orientation ? { orientation } : {}),
      exif: { IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '10/1 46/1 0/1', GPSLongitudeRef: 'E', GPSLongitude: '107/1 4/1 0/1' } },
    })
    .toBuffer();

describe('xuLyAnh', () => {
  it('ảnh 3000×2000: ra 6 file, bản 1600 rộng 1600, meta.json đúng, không còn EXIF/GPS', async () => {
    const dau = await taoJpeg(3000, 2000);
    expect((await sharp(dau).metadata()).exif, 'ảnh thử phải có EXIF thì kiểm tra mới có nghĩa').toBeDefined();
    const { ma, rong, cao } = await xuLyAnh(dau, dir);
    expect({ rong, cao }).toEqual({ rong: 1600, cao: 1067 });

    const files = (await readdir(join(dir, ma))).sort();
    expect(files).toEqual(
      ['1600.avif', '1600.webp', '480.avif', '480.webp', '960.avif', '960.webp', 'meta.json'].sort(),
    );
    expect(JSON.parse(await readFile(join(dir, ma, 'meta.json'), 'utf8'))).toEqual({ rong: 1600, cao: 1067 });

    const m1600 = await sharp(join(dir, ma, '1600.webp')).metadata();
    expect(m1600.width).toBe(1600);
    for (const f of files.filter((f) => f !== 'meta.json')) {
      const m = await sharp(join(dir, ma, f)).metadata();
      expect(m.exif, f).toBeUndefined();
    }
  });

  it('ảnh xoay bằng EXIF orientation=6 → rong/cao đã hoán đổi (ảnh đứng)', async () => {
    const { rong, cao } = await xuLyAnh(await taoJpeg(3000, 2000, 6), dir);
    expect(rong).toBeLessThan(cao);
    expect(cao).toBe(1600);
    expect(rong).toBe(1067);
  });

  it('không phóng to ảnh nhỏ: 800×600 → bản 960 vẫn rộng 800', async () => {
    const { ma } = await xuLyAnh(await taoJpeg(800, 600), dir);
    expect((await sharp(join(dir, ma, '960.webp')).metadata()).width).toBe(800);
  });

  it('mã ảnh ngẫu nhiên, khó đoán, an toàn trong URL', async () => {
    const [a, b] = [await xuLyAnh(await taoJpeg(100, 100), dir), await xuLyAnh(await taoJpeg(100, 100), dir)];
    expect(a.ma).not.toBe(b.ma);
    expect(a.ma).toMatch(/^[a-f0-9]{16,}$/);
  });

  it('file không phải ảnh → AnhKhongHopLe, không để lại thư mục rác', async () => {
    const truoc = (await readdir(dir)).length;
    await expect(xuLyAnh(Buffer.from('xin chào, đây là văn bản'), dir)).rejects.toBeInstanceOf(AnhKhongHopLe);
    expect((await readdir(dir)).length).toBe(truoc);
  });

  it('ảnh quá nhiều megapixel → AnhKhongHopLe (bảo vệ RAM 384MB), không đụng đĩa', async () => {
    const truoc = (await readdir(dir)).length;
    await expect(xuLyAnh(await taoJpeg(2000, 1000), dir, { toiDaPixel: 1_000_000 })).rejects.toThrow(/quá lớn/);
    await expect(xuLyAnh(await taoJpeg(2000, 1000), dir, { toiDaPixel: 1_000_000 })).rejects.toBeInstanceOf(AnhKhongHopLe);
    expect((await readdir(dir)).length).toBe(truoc);
  });

  it('mặc định chấp nhận ảnh điện thoại ~48MP trở xuống (giới hạn 80MP)', async () => {
    const { rong } = await xuLyAnh(await taoJpeg(2000, 1000), dir);
    expect(rong).toBe(1600);
  });

  it('HEIC không đọc được → thông báo hướng dẫn chọn "Tương thích nhất" trên iPhone', async () => {
    const heic = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypheic'), Buffer.alloc(40)]);
    await expect(xuLyAnh(heic, dir)).rejects.toThrow(/HEIC/);
  });
});

describe('conDungLuong', () => {
  const gia = (freeGB: number) => async () => ({ bavail: freeGB * 1024, bsize: 1024 * 1024 }) as any;
  it('còn ≥ 2 GB → true', async () => {
    expect(await conDungLuong(dir, 2, gia(3))).toBe(true);
    expect(await conDungLuong(dir, 2, gia(2))).toBe(true);
  });
  it('còn < 2 GB → false', async () => {
    expect(await conDungLuong(dir, 2, gia(1.9))).toBe(false);
  });
});
