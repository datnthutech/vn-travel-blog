// Các tool ĐỌC bài lấy dữ liệu từ SQLite (nguồn sự thật nội dung): liệt kê, đọc, kiểm tra bài. Tham số nhận `id` HOẶC `slug` (slug tiếng Việt).
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tinhSchema, urlBai, type Tinh } from '@vntraveltips/schema';
import { docBai as docBaiDb, lietKeBai as lietKeBaiDb, timIdTheoSlug, type BaiDoc } from '../noi-dung/bai';
import { kiemTraBai, type KetQuaKiemTra } from '../seo/checklist';
import { SLUG_HOP_LE, type ToolCtx } from './ctx';
import type { TomTatBai } from './doc';

const MA_ANH = /^[A-Za-z0-9]{1,64}$/;

export interface ThamChieuBai { id?: number; slug?: string }

/** Tìm bài tiếng Việt theo id hoặc slug (không lấy bài trong thùng rác). Không thấy → ném lỗi tiếng Việt. */
export function timBai(ctx: ToolCtx, ref: ThamChieuBai): BaiDoc {
  let id: number | null = null;
  if (ref.id !== undefined) id = ref.id;
  else if (ref.slug !== undefined) {
    if (!SLUG_HOP_LE.test(ref.slug)) throw new Error(`slug "${ref.slug}" không hợp lệ (chỉ a-z, 0-9 và dấu gạch ngang).`);
    id = timIdTheoSlug(ctx.db, 'vi', ref.slug);
  } else throw new Error('Cần truyền id hoặc slug của bài.');
  const d = id === null ? null : docBaiDb(ctx.db, id);
  if (!d || d.xoaLuc !== null) throw new Error(`Không có bài "${ref.id ?? ref.slug}".`);
  return d;
}

export async function lietKeBaiTuDb(
  ctx: ToolCtx,
  loc: { tinh?: string; draft?: boolean },
): Promise<{ bai: TomTatBai[]; loiDoc: string[] }> {
  const bai: TomTatBai[] = [];
  for (const d of lietKeBaiDb(ctx.db, 'vi')) {
    const b = d.bai;
    if (loc.tinh !== undefined && b.tinh !== loc.tinh) continue;
    if (loc.draft !== undefined && b.draft !== loc.draft) continue;
    bai.push({
      id: d.id, slug: b.slug, tieuDe: b.tieuDe, loai: b.loai, tinh: b.tinh, trangThai: d.trangThai, draft: b.draft,
      ngayDang: b.ngayDang ? new Date(b.ngayDang).toISOString().slice(0, 10) : '', url: urlBai(b),
    });
  }
  return { bai, loiDoc: [] };
}

export async function docBaiTuDb(ctx: ToolCtx, ref: ThamChieuBai): Promise<{ id: number; bai: BaiDoc['bai']; noiDung: string; trangThai: string; phienSo: number }> {
  const d = timBai(ctx, ref);
  return { id: d.id, bai: d.bai, noiDung: d.noiDung, trangThai: d.trangThai, phienSo: d.phienSo };
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
  const chuyenMuc = ctx.db.prepare('SELECT slug FROM chuyen_muc').all() as { slug: string }[];
  const maAnhHopLe = (ma: string) => MA_ANH.test(ma) && existsSync(join(ctx.config.anhDir, ma, 'meta.json'));
  return kiemTraBai(input.bai, tinh, baiKhac, input.noiDung ?? '', maAnhHopLe, chuyenMuc);
}
