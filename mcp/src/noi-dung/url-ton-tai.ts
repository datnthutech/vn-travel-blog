// Tập URL đang tồn tại ở bản production: bài đã đăng, trang chuyên mục có bài đã đăng, trang tỉnh, trang tĩnh đã đăng.
// Dùng để kiểm tra redirect thủ công (đích phải tồn tại, nguồn không được đè lên trang có thật).
import { urlBai, urlChuyenMuc, urlTinh, urlTrang } from '@vntraveltips/schema';
import type { Db } from '../db/ket-noi';
import { lietKeBaiDaDang } from './bai';

export function urlTonTaiProduction(db: Db): Set<string> {
  const bai = lietKeBaiDaDang(db, 'vi').filter((b) => b.hopLe);
  const urls = new Set<string>(bai.map((b) => urlBai(b.bai)));
  for (const c of new Set(bai.flatMap((b) => b.bai.chuyenMuc ?? []))) urls.add(urlChuyenMuc(c));
  for (const t of db.prepare('SELECT slug FROM tinh').all() as { slug: string }[]) urls.add(urlTinh(t.slug));
  for (const t of db.prepare("SELECT slug FROM trang WHERE trang_thai = 'da-dang'").all() as { slug: string }[]) urls.add(urlTrang(t.slug));
  return urls;
}
