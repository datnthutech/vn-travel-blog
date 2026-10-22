// Review cuối #1: bản dịch có slug riêng, nên đổi tỉnh của bài phải 301 từ URL THẬT của bản dịch (slug dịch),
// không phải "/<mã>" + URL tiếng Việt.
import { describe, expect, it } from 'vitest';
import { moDb } from '../db/ket-noi';
import { suaTinh, xoaTinh } from './tinh';

function chuanBi() {
  const db = moDb(':memory:');
  const tinh = (slug: string) => ({ ten: slug, slug, gioiThieu: 'x', anhBia: { ma: 'demo-bien', alt: 'x' }, moTa: 'x' });
  for (const s of ['quang-nam', 'da-nang']) db.prepare('INSERT INTO tinh (slug, du_lieu) VALUES (?, ?)').run(s, JSON.stringify(tinh(s)));
  db.prepare("INSERT OR IGNORE INTO ngon_ngu (ma, ten, bat, thu_tu) VALUES ('en', 'English', 1, 1)").run();
  const now = Date.now();
  db.prepare("INSERT INTO bai (id, tinh, loai, tao_luc, sua_luc) VALUES (1, 'quang-nam', 'nhat-ky', ?, ?)").run(now, now);
  const them = (nn: string, slug: string) =>
    db.prepare("INSERT INTO ban_dich (bai_id, ngon_ngu, slug, trang_thai, du_lieu, noi_dung, sua_luc) VALUES (1, ?, ?, 'da-dang', ?, '', ?)")
      .run(nn, slug, JSON.stringify(nn === 'vi' ? { slug, tinh: 'quang-nam' } : { slug }), now);
  them('vi', 'pho-co-hoi-an');
  them('en', 'hoi-an-old-town');
  return db;
}
const redirects = (db: ReturnType<typeof moDb>) =>
  (db.prepare('SELECT tu, den FROM redirect ORDER BY tu').all() as { tu: string; den: string }[]).map((r) => `${r.tu} → ${r.den}`);

describe('đổi tỉnh → 301 cho URL thật của bản dịch', () => {
  it('đổi slug tỉnh: bài vi, bài en (slug riêng) và hub đều có 301 đúng', () => {
    const db = chuanBi();
    suaTinh(db, 'quang-nam', { slug: 'quang-nam-moi' });
    const r = redirects(db);
    expect(r).toContain('/quang-nam/pho-co-hoi-an/ → /quang-nam-moi/pho-co-hoi-an/');
    expect(r).toContain('/en/quang-nam/hoi-an-old-town/ → /en/quang-nam-moi/hoi-an-old-town/');
    expect(r).not.toContain('/en/quang-nam/pho-co-hoi-an/ → /en/quang-nam-moi/pho-co-hoi-an/'); // URL không bao giờ tồn tại
    expect(r).toContain('/en/quang-nam/ → /en/quang-nam-moi/'); // hub: slug tỉnh giống nhau giữa các ngôn ngữ
  });

  it('xoá tỉnh, chuyển bài sang tỉnh khác: bản en cũng 301 theo slug riêng', () => {
    const db = chuanBi();
    xoaTinh(db, 'quang-nam', 'da-nang');
    expect(redirects(db)).toContain('/en/quang-nam/hoi-an-old-town/ → /en/da-nang/hoi-an-old-town/');
  });
});
