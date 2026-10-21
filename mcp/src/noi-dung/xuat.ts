// Xuất nội dung từ DB ra file đúng định dạng cũ (bai-viet/*.md, tinh/*.md, redirects.json) để Astro build đọc qua NOI_DUNG_DIR.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { urlBai, urlChuyenMuc, urlTinh, urlTrang } from '@vntraveltips/schema';
import { stringify } from 'yaml';
import { serializeBai } from '../bai/serialize';
import type { Db } from '../db/ket-noi';
import { lietKeBai } from './bai';
import { docCaiDat } from './cai-dat';
import { kiemTraDayDu } from './kiem-tra';

/**
 * `anhDir` (nếu có): bản nháp đưa vào preview còn phải qua kiểm tra tham chiếu (ảnh/tỉnh có thật), nếu không một nháp
 * trỏ tới ảnh không tồn tại sẽ làm hỏng build preview của mọi người.
 */
export function xuatNoiDung(db: Db, dich: string, target: 'production' | 'preview', anhDir?: string): { soBai: number } {
  rmSync(dich, { recursive: true, force: true });
  mkdirSync(join(dich, 'bai-viet'), { recursive: true });
  mkdirSync(join(dich, 'tinh'), { recursive: true });

  // Bản nháp còn thiếu trường (chưa qua schema) không xuất được: Astro sẽ báo lỗi và làm hỏng cả build.
  const bai = lietKeBai(db, 'vi').filter(
    (b) =>
      b.hopLe &&
      (target === 'preview' || b.trangThai === 'da-dang') &&
      (!anhDir || b.trangThai === 'da-dang' || kiemTraDayDu(db, anhDir, b.bai, b.noiDung, b.bai.slug).dat),
  );
  for (const b of bai) writeFileSync(join(dich, 'bai-viet', `${b.bai.slug}.md`), serializeBai(b.bai, b.noiDung));

  for (const r of db.prepare('SELECT slug, du_lieu FROM tinh ORDER BY slug').all() as { slug: string; du_lieu: string }[]) {
    writeFileSync(join(dich, 'tinh', `${r.slug}.md`), `---\n${stringify(JSON.parse(r.du_lieu), { lineWidth: 0 })}---\n`);
  }

  // Trang tĩnh: bản đã đăng (và cả nháp ở preview) → trang/<slug>.md với frontmatter tieuDe, moTa. Trang nháp không có ở production.
  mkdirSync(join(dich, 'trang'), { recursive: true });
  const trangXuat = (db.prepare("SELECT slug, tieu_de, mo_ta, noi_dung, trang_thai FROM trang ORDER BY slug").all() as { slug: string; tieu_de: string; mo_ta: string; noi_dung: string; trang_thai: string }[]).filter(
    (t) => t.tieu_de.trim() && (target === 'preview' || t.trang_thai === 'da-dang'),
  );
  for (const t of trangXuat) {
    writeFileSync(join(dich, 'trang', `${t.slug}.md`), `---\n${stringify({ tieuDe: t.tieu_de, moTa: t.mo_ta }, { lineWidth: 0 })}---\n\n${t.noi_dung}\n`);
  }

  // Cài đặt site: chỉ ghi khi đã có (server khởi tạo lần đầu từ env); thiếu thì site dùng mặc định + env.
  const caiDat = docCaiDat(db, 'site');
  if (caiDat) writeFileSync(join(dich, 'cai-dat.json'), JSON.stringify(caiDat, null, 2) + '\n');

  // Menu: chỉ ghi khi chủ blog đã lưu; thiếu thì site dùng menu mặc định. Mục có đích chưa đăng bị site ẩn lúc build.
  const menu = docCaiDat(db, 'menu');
  if (menu) writeFileSync(join(dich, 'menu.json'), JSON.stringify(menu, null, 2) + '\n');

  // Build kiểm tra: đích phải là bài đang đăng, nguồn không được đè lên một bài có thật. Bài bị gỡ/vào thùng rác thì
  // redirect liên quan bỏ qua (không làm hỏng build); dữ liệu trong DB vẫn giữ để dùng lại khi bài được đăng lại.
  // Trang hub cũng là đích hợp lệ: trang chuyên mục (chỉ khi có bài), trang tỉnh (mọi tỉnh).
  const urlHub = [
    ...new Set(bai.flatMap((b) => b.bai.chuyenMuc ?? [])).values(),
  ].map(urlChuyenMuc).concat((db.prepare('SELECT slug FROM tinh').all() as { slug: string }[]).map((t) => urlTinh(t.slug)));
  const urlTrangXuat = trangXuat.map((t) => urlTrang(t.slug));
  const urlDaDang = new Set([...bai.filter((b) => b.trangThai === 'da-dang').map((b) => urlBai(b.bai)), ...urlHub, ...urlTrangXuat]);
  const urlTatCa = new Set([...bai.map((b) => urlBai(b.bai)), ...urlHub, ...urlTrangXuat]);
  writeFileSync(
    join(dich, 'chuyen-muc.json'),
    JSON.stringify(
      (db.prepare('SELECT slug, ten, mo_ta, anh_bia, thu_tu FROM chuyen_muc ORDER BY thu_tu, slug').all() as { slug: string; ten: string; mo_ta: string; anh_bia: string | null; thu_tu: number }[]).map((c) => ({
        slug: c.slug, ten: c.ten, moTa: c.mo_ta, ...(c.anh_bia ? { anhBia: JSON.parse(c.anh_bia) } : {}), thuTu: c.thu_tu,
      })),
      null,
      2,
    ) + '\n',
  );

  const redirects = (db.prepare('SELECT tu, den FROM redirect ORDER BY tu').all() as { tu: string; den: string }[]).filter(
    (r) => urlDaDang.has(r.den) && !urlTatCa.has(r.tu),
  );
  writeFileSync(join(dich, 'redirects.json'), JSON.stringify(redirects, null, 2) + '\n');
  return { soBai: bai.length };
}
