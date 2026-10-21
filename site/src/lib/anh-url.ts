// Ghép đường dẫn ảnh và sinh HTML <picture> từ mã ảnh. Dùng chung cho component Picture.astro và plugin remark (ảnh trong thân bài).
import type { AnhMeta } from './anh';

const MA_ANH = /^[A-Za-z0-9]{1,64}$|^[a-z0-9-]{1,64}$/;
const CAC_RONG = [480, 960, 1600];

export function srcsetAnh(ma: string, dinhDang: 'avif' | 'webp'): string {
  return CAC_RONG.map((w) => `/anh/${ma}/${w}.${dinhDang} ${w}w`).join(', ');
}

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function anhHtml(ma: string, alt: string, meta: AnhMeta, sizes = '(min-width: 800px) 760px, 100vw'): string {
  if (!MA_ANH.test(ma)) throw new Error(`Mã ảnh không hợp lệ: "${ma}"`);
  return (
    `<picture>` +
    `<source type="image/avif" srcset="${srcsetAnh(ma, 'avif')}" sizes="${sizes}">` +
    `<source type="image/webp" srcset="${srcsetAnh(ma, 'webp')}" sizes="${sizes}">` +
    `<img src="/anh/${ma}/960.webp" alt="${escape(alt)}" width="${meta.rong}" height="${meta.cao}" loading="lazy" decoding="async">` +
    `</picture>`
  );
}
