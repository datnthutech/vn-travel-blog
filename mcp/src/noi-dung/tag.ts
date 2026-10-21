// Tag của bài: thống kê, đổi tên (gộp nếu đã có, bỏ trùng trong từng bài), tag chỉ còn ở bài trong thùng rác.
import type { Db } from '../db/ket-noi';
import { bienDoiDuLieuBai } from './bai';
import { LoiNghiepVu } from './chuyen-muc';
import { danhDauNoiDungDoi } from './phien-noi-dung';

interface Dong { du_lieu: string; xoa_luc: number | null }
const dong = (db: Db): { tags: string[]; thungRac: boolean }[] =>
  (db.prepare("SELECT d.du_lieu, b.xoa_luc FROM ban_dich d JOIN bai b ON b.id = d.bai_id WHERE d.ngon_ngu = 'vi'").all() as Dong[]).map((r) => ({
    tags: ((JSON.parse(r.du_lieu) as { tags?: string[] }).tags ?? []),
    thungRac: r.xoa_luc !== null,
  }));

/** Mọi tag đang dùng ở bài CHƯA vào thùng rác, kèm số bài. */
export function lietKeTag(db: Db): { tag: string; soBai: number }[] {
  const m = new Map<string, number>();
  for (const r of dong(db)) if (!r.thungRac) for (const t of new Set(r.tags)) m.set(t, (m.get(t) ?? 0) + 1);
  return [...m].map(([tag, soBai]) => ({ tag, soBai })).sort((a, b) => b.soBai - a.soBai || a.tag.localeCompare(b.tag));
}

/** Tag chỉ xuất hiện ở bài trong thùng rác (dọn được). */
export function tagKhongDung(db: Db): { tag: string; soBai: number }[] {
  const dung = new Set(lietKeTag(db).map((t) => t.tag));
  const m = new Map<string, number>();
  for (const r of dong(db)) if (r.thungRac) for (const t of new Set(r.tags)) if (!dung.has(t)) m.set(t, (m.get(t) ?? 0) + 1);
  return [...m].map(([tag, soBai]) => ({ tag, soBai })).sort((a, b) => a.tag.localeCompare(b.tag));
}

export function doiTenTag(db: Db, tu: unknown, den: unknown): { daDoi: number } {
  if (typeof tu !== 'string' || typeof den !== 'string' || !tu.trim() || !den.trim()) throw new LoiNghiepVu('Cần gửi tu và den (chuỗi không rỗng)');
  const denSach = den.trim();
  if (denSach.length > 50) throw new LoiNghiepVu('Tag tối đa 50 ký tự');
  return db.transaction(() => {
    const daDoi = bienDoiDuLieuBai(db, (du) => {
      const ds = du.tags as string[] | undefined;
      if (!ds?.includes(tu.trim())) return false;
      du.tags = [...new Set(ds.map((t) => (t === tu.trim() ? denSach : t)))];
      return true;
    });
    if (daDoi > 0) danhDauNoiDungDoi(db);
    return { daDoi };
  })();
}
