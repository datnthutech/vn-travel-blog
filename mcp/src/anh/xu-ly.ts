// Xử lý một ảnh tải lên: xoay đúng chiều theo EXIF rồi XOÁ EXIF (kể cả toạ độ GPS), thu về cạnh dài ≤ 1600px,
// sinh AVIF + WebP ở 480/960/1600px vào <anhDir>/<mã ảnh>/, kèm meta.json {rong, cao} để site đặt width/height.
// VPS yếu (~800MB RAM) nên: chỉ một luồng libvips và mã hoá TUẦN TỰ từng bản.
import { randomBytes } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

sharp.concurrency(1);
sharp.cache(false);

export class AnhKhongHopLe extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AnhKhongHopLe';
  }
}

const CAC_RONG = [480, 960, 1600] as const;
const CANH_DAI_TOI_DA = 1600;

const laHeic = (buf: Buffer) => /^(heic|heix|hevc|heim|heis|mif1|msf1)$/.test(buf.subarray(8, 12).toString('latin1')) && buf.subarray(4, 8).toString('latin1') === 'ftyp';

// 80 megapixel: đủ cho ảnh điện thoại 48MP/50MP, nhưng chặn "bom giải nén" làm container 384MB hết RAM.
const TOI_DA_PIXEL = 80_000_000;

export async function xuLyAnh(
  buf: Buffer,
  anhDir: string,
  opts: { toiDaPixel?: number } = {},
): Promise<{ ma: string; rong: number; cao: number }> {
  const toiDaPixel = opts.toiDaPixel ?? TOI_DA_PIXEL;
  // 1) Giải mã + xoay + thu nhỏ một lần; mọi bản khác suy ra từ bản 1600 này (không giải mã lại ảnh gốc lớn).
  // Không gọi withMetadata() nên sharp tự bỏ EXIF/GPS khỏi đầu ra.
  let goc: Buffer;
  let rong: number;
  let cao: number;
  try {
    const out = await sharp(buf, { limitInputPixels: toiDaPixel })
      .rotate()
      .resize({ width: CANH_DAI_TOI_DA, height: CANH_DAI_TOI_DA, fit: 'inside', withoutEnlargement: true })
      .png({ compressionLevel: 1 }) // trung gian không mất dữ liệu cho các lần mã hoá sau
      .toBuffer({ resolveWithObject: true });
    goc = out.data;
    rong = out.info.width;
    cao = out.info.height;
  } catch (e) {
    if (/pixel/i.test((e as Error).message)) {
      throw new AnhKhongHopLe(`Ảnh quá lớn (hơn ${Math.round(toiDaPixel / 1e6)} megapixel). Hãy chọn ảnh nhỏ hơn.`);
    }
    throw new AnhKhongHopLe(
      laHeic(buf)
        ? 'Ảnh HEIC chưa đọc được. Trên iPhone vào Cài đặt › Camera › Định dạng › chọn "Tương thích nhất", hoặc chọn ảnh dạng JPEG.'
        : 'Không đọc được file này như một ảnh (hỗ trợ JPEG, PNG, WebP, AVIF).',
    );
  }

  // 2) Ghi vào thư mục tạm rồi đổi tên một lần → nginx không bao giờ thấy ảnh viết dở.
  const ma = randomBytes(12).toString('hex');
  const tam = join(anhDir, `.tmp-${ma}`);
  try {
    await mkdir(tam, { recursive: true });
    for (const w of CAC_RONG) {
      const bien = sharp(goc).resize({ width: w, withoutEnlargement: true });
      await bien.clone().webp({ quality: 78, effort: 4 }).toFile(join(tam, `${w}.webp`));
      await bien.clone().avif({ quality: 50, effort: 4 }).toFile(join(tam, `${w}.avif`));
    }
    await writeFile(join(tam, 'meta.json'), JSON.stringify({ rong, cao }));
    await rename(tam, join(anhDir, ma));
  } catch (e) {
    await rm(tam, { recursive: true, force: true });
    throw e;
  }
  return { ma, rong, cao };
}
