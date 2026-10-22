// Mô hình bản dịch bài viết: bản dịch CHỈ chứa trường chữ; trường không phải chữ (ảnh, toạ độ, giá số, điểm, link, tỉnh, chuyên mục, tags, ngày…)
// luôn lấy từ bản tiếng Việt khi ghép → bản dịch không thể làm lệch dữ liệu có cấu trúc.
import { z } from 'zod';
import type { BaiViet } from './bai-viet';

const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'slug chỉ gồm a-z, 0-9 và dấu gạch ngang');

export const banDichChuSchema = z.object({
  tieuDe: z.string().min(1),
  slug,
  moTa: z.string().min(120, 'moTa tối thiểu 120 ký tự').max(160, 'moTa tối đa 160 ký tự'),
  noiDung: z.string(),
  anhBiaAlt: z.string().min(1),
  traNhanh: z
    .object({
      hopVoi: z.string(),
      thoiGian: z.string(),
      choO: z.string().optional(),
      diChuyen: z.string(),
      thoiDiemNenDi: z.string(),
      luuYVoiBe: z.array(z.string()),
    })
    .optional(),
  /** Cùng độ dài và thứ tự với bản gốc. */
  diaDiem: z.array(
    z.object({
      ten: z.string(),
      diaChi: z.string().optional(),
      khoangGia: z.string().optional(),
      gioMoCua: z.string().optional(),
      thanThienVoiBe: z.string().optional(),
      uuDiem: z.array(z.string()),
      nhuocDiem: z.array(z.string()),
      /** Alt của từng ảnh của địa điểm, cùng thứ tự với bản gốc. */
      anhAlt: z.array(z.string()),
    }),
  ),
  doMangChoBe: z.array(z.object({ ten: z.string(), ghiChu: z.string().optional() })),
  faq: z.array(z.object({ hoi: z.string(), dap: z.string() })),
});
export type BanDichChu = z.infer<typeof banDichChuSchema>;

/** Chỉ thêm khoá khi có giá trị (để ghép(gốc, tách(gốc)) giống hệt gốc, không sinh khoá `undefined`). */
const co = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

export function tachTruongChu(goc: BaiViet, noiDung: string): BanDichChu {
  return co({
    tieuDe: goc.tieuDe,
    slug: goc.slug,
    moTa: goc.moTa,
    noiDung,
    anhBiaAlt: goc.anhBia.alt,
    traNhanh: goc.traNhanh
      ? co({ hopVoi: goc.traNhanh.hopVoi, thoiGian: goc.traNhanh.thoiGian, choO: goc.traNhanh.choO, diChuyen: goc.traNhanh.diChuyen, thoiDiemNenDi: goc.traNhanh.thoiDiemNenDi, luuYVoiBe: [...goc.traNhanh.luuYVoiBe] })
      : undefined,
    diaDiem: goc.diaDiem.map((d) =>
      co({ ten: d.ten, diaChi: d.diaChi, khoangGia: d.khoangGia, gioMoCua: d.gioMoCua, thanThienVoiBe: d.thanThienVoiBe, uuDiem: [...d.uuDiem], nhuocDiem: [...d.nhuocDiem], anhAlt: d.anh.map((a) => a.alt) }),
    ),
    doMangChoBe: goc.doMangChoBe.map((x) => co({ ten: x.ten, ghiChu: x.ghiChu })),
    faq: goc.faq.map((f) => ({ hoi: f.hoi, dap: f.dap })),
  });
}

/** Ghép bản dịch vào bản gốc. Số phần tử mảng lệch với gốc → ném lỗi nêu tên mảng. (`noiDung` của bản dịch do nơi gọi lấy riêng.) */
export function ghepBanDich(goc: BaiViet, dich: BanDichChu): BaiViet {
  if (dich.diaDiem.length !== goc.diaDiem.length) throw new Error(`diaDiem: bản dịch có ${dich.diaDiem.length} mục, bản gốc có ${goc.diaDiem.length}`);
  if (dich.doMangChoBe.length !== goc.doMangChoBe.length) throw new Error(`doMangChoBe: bản dịch có ${dich.doMangChoBe.length} mục, bản gốc có ${goc.doMangChoBe.length}`);
  if (goc.traNhanh && !dich.traNhanh) throw new Error('traNhanh: bản gốc có "Tra nhanh" nhưng bản dịch thiếu');
  const diaDiem = goc.diaDiem.map((g, i) => {
    const d = dich.diaDiem[i]!;
    if (d.anhAlt.length !== g.anh.length) throw new Error(`diaDiem[${i}].anhAlt: bản dịch có ${d.anhAlt.length} alt, bản gốc có ${g.anh.length} ảnh`);
    return co({ ...g, ten: d.ten, diaChi: d.diaChi, khoangGia: d.khoangGia, gioMoCua: d.gioMoCua, thanThienVoiBe: d.thanThienVoiBe, uuDiem: d.uuDiem, nhuocDiem: d.nhuocDiem, anh: g.anh.map((a, j) => ({ ma: a.ma, alt: d.anhAlt[j]! })) });
  });
  return co({
    ...goc,
    tieuDe: dich.tieuDe,
    slug: dich.slug,
    moTa: dich.moTa,
    anhBia: { ma: goc.anhBia.ma, alt: dich.anhBiaAlt },
    traNhanh: goc.traNhanh ? co({ ...goc.traNhanh, hopVoi: dich.traNhanh!.hopVoi, thoiGian: dich.traNhanh!.thoiGian, choO: dich.traNhanh!.choO, diChuyen: dich.traNhanh!.diChuyen, thoiDiemNenDi: dich.traNhanh!.thoiDiemNenDi, luuYVoiBe: dich.traNhanh!.luuYVoiBe }) : undefined,
    diaDiem,
    doMangChoBe: goc.doMangChoBe.map((g, i) => co({ ...g, ten: dich.doMangChoBe[i]!.ten, ghiChu: dich.doMangChoBe[i]!.ghiChu })),
    faq: dich.faq.map((f) => ({ hoi: f.hoi, dap: f.dap })),
  });
}

const chuanHoa = (v: unknown): unknown =>
  typeof v === 'string'
    ? v.normalize('NFC').replace(/\r\n?/g, '\n').trim()
    : Array.isArray(v)
      ? v.map(chuanHoa)
      : v && typeof v === 'object'
        ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, chuanHoa((v as Record<string, unknown>)[k])]))
        : v;

/** Băm các trường chữ của bản gốc: bản dịch "cũ hơn bản gốc" khi băm lúc dịch ≠ băm hiện tại. Slug không tính (đổi slug vi không làm bản dịch cũ). */
export function bamBanGoc(goc: BaiViet, noiDung: string): string {
  const { slug: _slug, ...chu } = tachTruongChu(goc, noiDung);
  return sha256Hex(JSON.stringify(chuanHoa(chu)));
}

// ---- SHA-256 thuần JS (schema chạy cả trong trình duyệt của trang quản trị nên không dùng node:crypto) ----
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

export function sha256Hex(chu: string): string {
  const bytes = new TextEncoder().encode(chu);
  const n = bytes.length;
  const tong = (((n + 9 + 63) >> 6) << 6);
  const buf = new Uint8Array(tong);
  buf.set(bytes);
  buf[n] = 0x80;
  const dv = new DataView(buf.buffer);
  dv.setUint32(tong - 8, Math.floor((n * 8) / 2 ** 32));
  dv.setUint32(tong - 4, (n * 8) >>> 0);
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  const xoay = (x: number, k: number) => (x >>> k) | (x << (32 - k));
  for (let off = 0; off < tong; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = xoay(w[i - 15]!, 7) ^ xoay(w[i - 15]!, 18) ^ (w[i - 15]! >>> 3);
      const s1 = xoay(w[i - 2]!, 17) ^ xoay(w[i - 2]!, 19) ^ (w[i - 2]! >>> 10);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h as unknown as number[];
    for (let i = 0; i < 64; i++) {
      const t1 = (hh! + (xoay(e!, 6) ^ xoay(e!, 11) ^ xoay(e!, 25)) + ((e! & f!) ^ (~e! & g!)) + K[i]! + w[i]!) >>> 0;
      const t2 = ((xoay(a!, 2) ^ xoay(a!, 13) ^ xoay(a!, 22)) + ((a! & b!) ^ (a! & c!) ^ (b! & c!))) >>> 0;
      hh = g; g = f; f = e; e = (d! + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    [a, b, c, d, e, f, g, hh].forEach((v, i) => (h[i] = (h[i]! + v!) >>> 0));
  }
  return [...h].map((x) => x.toString(16).padStart(8, '0')).join('');
}
