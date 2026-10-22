// Trạng thái build cho trang quản trị: hàng đợi, lần build gần nhất, bộ đếm nội dung của bản xem trước/production, lần sao lưu cuối.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Router } from 'express';
import type { HangDoiBuild } from '../build/hang-doi';
import type { Config } from '../config';
import type { Db } from '../db/ket-noi';

// build.json do bản build ghi (site/scripts/write-build-json.mjs); thiếu/hỏng → null.
export async function docBuildJson(thuMuc: string): Promise<number | null> {
  try {
    const d = JSON.parse(await readFile(join(thuMuc, 'build.json'), 'utf8')) as { noiDungPhien?: unknown };
    return typeof d.noiDungPhien === 'number' ? d.noiDungPhien : null;
  } catch {
    return null;
  }
}

export function buildRouter(d: { config: Config; db: Db; hangDoi: HangDoiBuild }): Router {
  const r = Router();
  r.get('/build', async (_req, res) => {
    const s = d.db.prepare("SELECT gia_tri FROM he_thong WHERE khoa = 'sao_luu_cuoi_luc'").get() as { gia_tri: string } | undefined;
    res.json({
      ...d.hangDoi.trangThai(),
      saoLuuCuoiLuc: s ? Number(s.gia_tri) : null,
      previewNoiDungPhien: await docBuildJson(d.config.previewDir),
      productionNoiDungPhien: await docBuildJson(d.config.siteDir),
    });
  });
  return r;
}

/** Khoá giao diện còn thiếu theo ngôn ngữ ({ en: số khoá }) do build ghi vào build.json; thiếu/hỏng → {}. */
export async function docGiaoDienThieu(thuMuc: string): Promise<Record<string, number>> {
  try {
    const d = JSON.parse(await readFile(join(thuMuc, 'build.json'), 'utf8')) as { giaoDienThieu?: Record<string, unknown> };
    return Object.fromEntries(Object.entries(d.giaoDienThieu ?? {}).map(([ma, ds]) => [ma, Array.isArray(ds) ? ds.length : 0]));
  } catch {
    return {};
  }
}
