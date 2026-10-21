// Các tool ĐỌC bài lấy dữ liệu từ SQLite (nguồn sự thật nội dung): liệt kê, đọc, kiểm tra bài.
// (doc.ts giữ phần không liên quan tới nội dung: tạo link tải ảnh, liệt kê ảnh.)
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tinhSchema, urlBai, type BaiViet, type Tinh } from '@vntraveltips/schema';
import { docBai as docBaiDb, lietKeBai as lietKeBaiDb, timIdTheoSlug } from '../noi-dung/bai';
import { kiemTraBai, type KetQuaKiemTra } from '../seo/checklist';
import { SLUG_HOP_LE, type ToolCtx } from './ctx';
import type { TomTatBai } from './doc';

const MA_ANH = /^[A-Za-z0-9]{1,64}$/;

export async function lietKeBaiTuDb(
  ctx: ToolCtx,
  loc: { tinh?: string; draft?: boolean },
): Promise<{ bai: TomTatBai[]; loiDoc: string[] }> {
  const bai: TomTatBai[] = [];
  for (const d of lietKeBaiDb(ctx.db, 'vi')) {
    const b = d.bai;
    if (loc.tinh !== undefined && b.tinh !== loc.tinh) continue;
    if (loc.draft !== undefined && b.draft !== loc.draft) continue;
    bai.push({ slug: b.slug, tieuDe: b.tieuDe, loai: b.loai, tinh: b.tinh, draft: b.draft, ngayDang: b.ngayDang.toISOString().slice(0, 10), url: urlBai(b) });
  }
  return { bai, loiDoc: [] };
}

export async function docBaiTuDb(ctx: ToolCtx, slug: string): Promise<{ bai: BaiViet; noiDung: string }> {
  if (!SLUG_HOP_LE.test(slug)) throw new Error(`slug "${slug}" không hợp lệ (chỉ a-z, 0-9 và dấu gạch ngang).`);
  const id = timIdTheoSlug(ctx.db, 'vi', slug);
  const d = id === null ? null : docBaiDb(ctx.db, id);
  if (!d || d.xoaLuc !== null) throw new Error(`Không có bài "${slug}".`);
  return { bai: d.bai, noiDung: d.noiDung };
}

export async function kiemTraBaiToolTuDb(
  ctx: ToolCtx,
  input: { bai: unknown; noiDung?: string; slugDangSua?: string },
): Promise<KetQuaKiemTra> {
  const tinh: Tinh[] = (ctx.db.prepare('SELECT du_lieu FROM tinh').all() as { du_lieu: string }[])
    .map((r) => tinhSchema.safeParse(JSON.parse(r.du_lieu)))
    .flatMap((k) => (k.success ? [k.data] : []));
  const baiKhac = (ctx.db.prepare("SELECT slug FROM ban_dich WHERE ngon_ngu = 'vi'").all() as { slug: string }[]).filter(
    (r) => r.slug !== input.slugDangSua,
  );
  const maAnhHopLe = (ma: string) => MA_ANH.test(ma) && existsSync(join(ctx.config.anhDir, ma, 'meta.json'));
  return kiemTraBai(input.bai, tinh, baiKhac, input.noiDung ?? '', maAnhHopLe);
}
