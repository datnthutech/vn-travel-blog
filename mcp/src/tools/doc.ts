// Các tool CHỈ ĐỌC: tạo link tải ảnh, liệt kê ảnh, kiểm tra bài, liệt kê/đọc bài. Không tool nào ghi vào GitHub.
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { parse } from 'yaml';
import { tinhSchema, urlBai, type BaiViet, type Tinh } from '@vntraveltips/schema';
import { conDungLuong } from '../anh/dung-luong';
import { layAnhGanDay } from '../anh/gan-day';
import { taoToken, TTL_MAC_DINH } from '../anh/token';
import { parseBai } from '../bai/serialize';
import { kiemTraBai, type KetQuaKiemTra } from '../seo/checklist';
import { BAI_DIR, SLUG_HOP_LE, TINH_DIR, duongDanBai, type ToolCtx } from './ctx';

const MA_ANH = /^[A-Za-z0-9]{1,64}$/;
const TOI_DA_ANH = 20;

export async function taoLinkTaiAnh(ctx: ToolCtx): Promise<{ url: string; hetHan: string }> {
  // Ổ gần đầy thì nói ngay với Claude, thay vì để chủ blog chọn cả chục ảnh rồi mới bị từ chối ở trang tải.
  if (!(await (ctx.conDungLuong ?? ((d: string) => conDungLuong(d)))(ctx.config.anhDir))) {
    throw new Error('Ổ đĩa trên VPS gần đầy (còn dưới 2 GB) nên tạm không nhận thêm ảnh. Hãy báo chủ blog dọn ổ đĩa hoặc sao lưu ảnh cũ rồi xoá bớt.');
  }
  const token = taoToken(TTL_MAC_DINH, ctx.now);
  return { url: `${ctx.config.publicBaseUrl}/tai-anh/${token}`, hetHan: new Date(ctx.now() + TTL_MAC_DINH).toISOString() };
}

export interface AnhLietKe {
  ma: string;
  ten: string;
  luc: number;
  rong?: number;
  cao?: number;
  thumbnail?: { data: string; mimeType: 'image/webp' };
}

// Ảnh vừa tải, kèm thumbnail nhỏ để Claude NHÌN ảnh rồi viết alt text / chọn ảnh bìa.
export async function lietKeAnh(ctx: ToolCtx, gioiHan = 8): Promise<AnhLietKe[]> {
  const n = Math.min(TOI_DA_ANH, Math.max(1, Math.floor(gioiHan)));
  const ds = await layAnhGanDay(ctx.config.anhDir, n);
  const kq: AnhLietKe[] = [];
  for (const a of ds) {
    const muc: AnhLietKe = { ...a };
    if (MA_ANH.test(a.ma)) {
      try {
        const meta = JSON.parse(await readFile(join(ctx.config.anhDir, a.ma, 'meta.json'), 'utf8'));
        muc.rong = meta.rong;
        muc.cao = meta.cao;
        // Bản 480px tạo sẵn; thu nhỏ thêm về cạnh dài 320 để tiết kiệm token khi Claude xem nhiều ảnh.
        const nho = await sharp(join(ctx.config.anhDir, a.ma, '480.webp'))
          .resize({ width: 320, height: 320, fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 60 })
          .toBuffer();
        muc.thumbnail = { data: nho.toString('base64'), mimeType: 'image/webp' };
      } catch {
        /* thư mục ảnh đã mất → vẫn liệt kê, không thumbnail */
      }
    }
    kq.push(muc);
  }
  return kq;
}

async function layDanhSachTinh(ctx: ToolCtx): Promise<Tinh[]> {
  const tinh: Tinh[] = [];
  for (const p of await ctx.github.liet(TINH_DIR)) {
    const f = await ctx.github.docFile(p);
    const m = f && /^---\r?\n([\s\S]*?)\r?\n---/.exec(f.noiDung);
    const kq = m ? tinhSchema.safeParse(parse(m[1])) : null;
    if (kq?.success) tinh.push(kq.data);
  }
  return tinh;
}

const slugTuFile = (p: string) => p.slice(p.lastIndexOf('/') + 1).replace(/\.md$/, '');

export async function kiemTraBaiTool(
  ctx: ToolCtx,
  input: { bai: unknown; noiDung?: string; slugDangSua?: string },
): Promise<KetQuaKiemTra> {
  const [tinh, files] = await Promise.all([layDanhSachTinh(ctx), ctx.github.liet(BAI_DIR)]);
  const baiKhac = files.map(slugTuFile).filter((s) => s !== input.slugDangSua).map((slug) => ({ slug }));
  const maAnhHopLe = (ma: string) => MA_ANH.test(ma) && existsSync(join(ctx.config.anhDir, ma, 'meta.json'));
  return kiemTraBai(input.bai, tinh, baiKhac, input.noiDung ?? '', maAnhHopLe);
}

export interface TomTatBai {
  slug: string;
  tieuDe: string;
  loai: BaiViet['loai'];
  tinh?: string;
  draft: boolean;
  ngayDang: string;
  url: string;
}

// Đọc song song nhưng giới hạn 5 request để không chạm giới hạn tốc độ của GitHub.
async function chayDongThoi<T, R>(ds: T[], toiDa: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const kq: R[] = new Array(ds.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(toiDa, ds.length) }, async () => {
      while (i < ds.length) {
        const k = i++;
        kq[k] = await fn(ds[k]);
      }
    }),
  );
  return kq;
}

export async function lietKeBai(
  ctx: ToolCtx,
  loc: { tinh?: string; draft?: boolean },
): Promise<{ bai: TomTatBai[]; loiDoc: string[] }> {
  const files = (await ctx.github.liet(BAI_DIR)).filter((p) => p.endsWith('.md'));
  const doc = await chayDongThoi(files, 5, async (p) => {
    try {
      const f = await ctx.github.docFile(p);
      return f ? { p, bai: parseBai(f.noiDung).bai } : { p, bai: null };
    } catch {
      return { p, bai: null };
    }
  });
  const bai: TomTatBai[] = [];
  const loiDoc: string[] = [];
  for (const { p, bai: b } of doc) {
    if (!b) {
      loiDoc.push(p);
      continue;
    }
    if (loc.tinh !== undefined && b.tinh !== loc.tinh) continue;
    if (loc.draft !== undefined && b.draft !== loc.draft) continue;
    bai.push({ slug: b.slug, tieuDe: b.tieuDe, loai: b.loai, tinh: b.tinh, draft: b.draft, ngayDang: b.ngayDang.toISOString().slice(0, 10), url: urlBai(b) });
  }
  return { bai, loiDoc };
}

export async function docBai(ctx: ToolCtx, slug: string): Promise<{ bai: BaiViet; noiDung: string; sha: string }> {
  if (!SLUG_HOP_LE.test(slug)) throw new Error(`slug "${slug}" không hợp lệ (chỉ a-z, 0-9 và dấu gạch ngang).`);
  const f = await ctx.github.docFile(duongDanBai(slug));
  if (!f) throw new Error(`Không có bài "${slug}".`);
  return { ...parseBai(f.noiDung), sha: f.sha };
}
