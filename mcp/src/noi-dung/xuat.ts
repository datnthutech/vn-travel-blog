// Xuất nội dung từ DB ra file đúng định dạng cũ (bai-viet/*.md, tinh/*.md, redirects.json) để Astro build đọc qua NOI_DUNG_DIR.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { baiVietSchema, urlBai, urlChuyenMuc, urlTinh, urlTrang } from '@vntraveltips/schema';
import { stringify } from 'yaml';
import { serializeBai } from '../bai/serialize';
import type { Db } from '../db/ket-noi';
import { lietKeBai } from './bai';
import { docCaiDat } from './cai-dat';
import { kiemTraDayDu } from './kiem-tra';
import { lietKeNgonNgu, maNgonNguDangBat } from './ngon-ngu';
import { docBanDich, ghepDayDu } from './ban-dich';

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
  // Bản dịch (ngôn ngữ ĐANG BẬT): chỉ của bài vi đã qua bộ lọc ở trên — nên bài vi bị gỡ/vào thùng rác thì mọi bản dịch cũng biến khỏi production.
  // `banDich` = URL các bản dịch ĐÃ ĐĂNG (dùng cho hreflang); bản dịch chỉ ghi ra khi ghép + kiểm tra được.
  const bangDich: { id: number; ma: string; bai: ReturnType<typeof ghepDayDu>; trangThai: string }[] = [];
  for (const ma of maNgonNguDangBat(db).filter((m) => m !== 'vi')) {
    for (const b of bai) {
      const ban = docBanDich(db, b.id, ma);
      if (!ban || (target === 'production' && ban.trangThai !== 'da-dang')) continue;
      let g;
      try {
        g = ghepDayDu(db, ban);
      } catch {
        continue; // bản dịch nháp còn thiếu/lệch cấu trúc: không xuất (giống bản nháp tiếng Việt thiếu trường)
      }
      if (!baiVietSchema.safeParse({ ...g.bai, draft: false }).success) continue;
      if (anhDir && ban.trangThai !== 'da-dang' && !kiemTraDayDu(db, anhDir, g.bai, g.noiDung, ban.dich.slug, ma).dat) continue;
      bangDich.push({ id: b.id, ma, bai: g, trangThai: ban.trangThai });
    }
  }
  const urlDich = (ma: string, b: { slug: string; tinh?: string }) => `/${ma}${urlBai(b)}`;
  const banDichDaDang = (id: number, tru: string): Record<string, string> => {
    const r: Record<string, string> = {};
    const vi = bai.find((x) => x.id === id);
    if (vi && vi.trangThai === 'da-dang' && tru !== 'vi') r.vi = urlBai(vi.bai);
    for (const x of bangDich) if (x.id === id && x.ma !== tru && x.trangThai === 'da-dang') r[x.ma] = urlDich(x.ma, x.bai.bai);
    return r;
  };
  for (const b of bai) {
    const bd = banDichDaDang(b.id, 'vi');
    writeFileSync(join(dich, 'bai-viet', `${b.bai.slug}.md`), serializeBai({ ...b.bai, maBai: b.id, ...(Object.keys(bd).length ? { banDich: bd } : {}) } as typeof b.bai, b.noiDung));
  }
  for (const x of bangDich) {
    mkdirSync(join(dich, 'bai-viet', x.ma), { recursive: true });
    const bd = banDichDaDang(x.id, x.ma);
    writeFileSync(join(dich, 'bai-viet', x.ma, `${x.bai.bai.slug}.md`), serializeBai({ ...x.bai.bai, maBai: x.id, ngonNgu: x.ma, ...(Object.keys(bd).length ? { banDich: bd } : {}) } as typeof x.bai.bai, x.bai.noiDung));
  }

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

  // Danh sách ngôn ngữ ĐANG BẬT (vi luôn đứng đầu): site và các bước xuất sau chỉ làm việc với các mã này.
  writeFileSync(join(dich, 'ngon-ngu.json'), JSON.stringify(lietKeNgonNgu(db).filter((n) => n.bat).map((n) => ({ ma: n.ma, ten: n.ten, thuTu: n.thuTu })), null, 2) + '\n');

  // Bản dịch cấu trúc (chuyên mục, tỉnh, trang, menu, site) và chuỗi giao diện của các ngôn ngữ ĐANG BẬT.
  const dangBat = new Set(maNgonNguDangBat(db));
  const dcRows = (db.prepare('SELECT loai, khoa, ngon_ngu, du_lieu FROM dich_cau_truc ORDER BY loai, khoa, ngon_ngu').all() as { loai: string; khoa: string; ngon_ngu: string; du_lieu: string }[]).filter((r) => dangBat.has(r.ngon_ngu));
  writeFileSync(join(dich, 'dich-cau-truc.json'), JSON.stringify(dcRows.filter((r) => r.loai !== 'giao-dien').map((r) => ({ loai: r.loai, khoa: r.khoa, ngonNgu: r.ngon_ngu, duLieu: JSON.parse(r.du_lieu) })), null, 2) + '\n');
  mkdirSync(join(dich, 'giao-dien'), { recursive: true });
  for (const r of dcRows.filter((x) => x.loai === 'giao-dien')) writeFileSync(join(dich, 'giao-dien', `${r.ngon_ngu}.json`), JSON.stringify(JSON.parse(r.du_lieu), null, 2) + '\n');

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
  const urlDaDang = new Set([...bai.filter((b) => b.trangThai === 'da-dang').map((b) => urlBai(b.bai)), ...bangDich.filter((x) => x.trangThai === 'da-dang').map((x) => urlDich(x.ma, x.bai.bai)), ...urlHub, ...urlTrangXuat]);
  const urlTatCa = new Set([...bai.map((b) => urlBai(b.bai)), ...bangDich.map((x) => urlDich(x.ma, x.bai.bai)), ...urlHub, ...urlTrangXuat]);
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
