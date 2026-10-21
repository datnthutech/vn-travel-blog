// Sao lưu SQLite bằng API backup của SQLite (an toàn khi đang có ghi), dọn bản cũ và khôi phục.
import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import type { Db } from './ket-noi';

const TEN_FILE = /^vntraveltips-(\d{8})-(\d{4})\.sqlite$/;
const GIO_VN = 7 * 3600_000; // Việt Nam UTC+7, không có giờ mùa hè → cộng cố định, không phụ thuộc TZ máy.

const vn = (now: number) => new Date(now + GIO_VN).toISOString(); // "2026-10-22T00:05:00.000Z" (đã là giờ VN)
const dauNgay = (now: number) => vn(now).slice(0, 10).replaceAll('-', '');

/** Sao lưu DB đang mở vào `thuMuc`, tên theo giờ VN. Trả đường dẫn file. */
export async function saoLuu(db: Db, thuMuc: string, now: number): Promise<string> {
  mkdirSync(thuMuc, { recursive: true });
  const iso = vn(now);
  const file = join(thuMuc, `vntraveltips-${dauNgay(now)}-${iso.slice(11, 13)}${iso.slice(14, 16)}.sqlite`);
  await db.backup(file);
  db.prepare("INSERT OR REPLACE INTO he_thong (khoa, gia_tri) VALUES ('sao_luu_cuoi_luc', ?)").run(String(now));
  return file;
}

/** Giữ `giu.gio` bản mới nhất + bản đầu tiên của mỗi ngày trong `giu.ngay` ngày gần nhất. Trả tên file đã xoá. */
export function donSaoLuu(thuMuc: string, now: number, giu = { gio: 48, ngay: 14 }): string[] {
  if (!existsSync(thuMuc)) return [];
  const files = readdirSync(thuMuc).filter((f) => TEN_FILE.test(f)).sort(); // tên đã theo thời gian
  const giuLai = new Set(files.slice(-giu.gio));
  const gioiHan = dauNgay(now - (giu.ngay - 1) * 24 * 3600_000);
  const daThay = new Set<string>();
  for (const f of files) {
    const ngay = TEN_FILE.exec(f)![1]!;
    if (ngay < gioiHan || daThay.has(ngay)) continue;
    daThay.add(ngay);
    giuLai.add(f);
  }
  const xoa = files.filter((f) => !giuLai.has(f));
  for (const f of xoa) rmSync(join(thuMuc, f), { force: true });
  return xoa;
}

/** Thay DB hiện tại bằng bản sao lưu. Kiểm tra bản sao trước; DB cũ được đổi tên `*.truoc-khoi-phuc-<luc>`. */
export function khoiPhuc(fileSaoLuu: string, duongDanDb: string, now: () => number = Date.now): void {
  let ok: unknown;
  try {
    const sao = new Database(fileSaoLuu, { readonly: true, fileMustExist: true });
    try {
      ok = sao.pragma('integrity_check', { simple: true });
    } finally {
      sao.close();
    }
  } catch (e) {
    throw new Error(`Không đọc được file sao lưu: ${(e as Error).message}`);
  }
  if (ok !== 'ok') throw new Error('File sao lưu hỏng (integrity_check không ok), không khôi phục.');
  const hauTo = `.truoc-khoi-phuc-${now()}`;
  for (const duoi of ['', '-wal', '-shm']) {
    if (existsSync(duongDanDb + duoi)) renameSync(duongDanDb + duoi, duongDanDb + hauTo + duoi);
  }
  mkdirSync(join(duongDanDb, '..'), { recursive: true });
  copyFileSync(fileSaoLuu, duongDanDb);
}
