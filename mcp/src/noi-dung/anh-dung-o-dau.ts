// Ảnh đang được dùng ở đâu: quét ảnh bìa, ảnh địa điểm và ảnh trong thân bài (`anh:MÃ`) của MỌI bài — kể cả nháp và thùng rác
// (bài trong thùng rác còn khôi phục được, nên ảnh của nó chưa được xoá) — cộng ảnh bìa của các tỉnh.
import type { Db } from '../db/ket-noi';

const ANH_TRONG_THAN = /\banh:([A-Za-z0-9]{1,64})/g;

export interface DungO {
  /** mã ảnh → id các bài dùng */
  bai: Map<string, number[]>;
  /** mã ảnh → slug các tỉnh dùng làm ảnh bìa */
  tinh: Map<string, string[]>;
}

function them<T>(m: Map<string, T[]>, ma: string, v: T) {
  const ds = m.get(ma);
  if (!ds) m.set(ma, [v]);
  else if (!ds.includes(v)) ds.push(v);
}

export function timAnhDungO(db: Db): DungO {
  const bai = new Map<string, number[]>();
  const tinh = new Map<string, string[]>();
  for (const r of db.prepare('SELECT bai_id, du_lieu, noi_dung FROM ban_dich').all() as { bai_id: number; du_lieu: string; noi_dung: string }[]) {
    let d: { anhBia?: { ma?: unknown }; diaDiem?: { anh?: { ma?: unknown }[] }[] } = {};
    try {
      d = JSON.parse(r.du_lieu);
    } catch {
      /* bản ghi hỏng: vẫn quét thân bài */
    }
    if (typeof d.anhBia?.ma === 'string') them(bai, d.anhBia.ma, r.bai_id);
    for (const dd of d.diaDiem ?? []) for (const a of dd.anh ?? []) if (typeof a?.ma === 'string') them(bai, a.ma, r.bai_id);
    for (const m of r.noi_dung.matchAll(ANH_TRONG_THAN)) them(bai, m[1]!, r.bai_id);
  }
  for (const r of db.prepare('SELECT slug, du_lieu FROM tinh').all() as { slug: string; du_lieu: string }[]) {
    try {
      const ma = (JSON.parse(r.du_lieu) as { anhBia?: { ma?: unknown } }).anhBia?.ma;
      if (typeof ma === 'string') them(tinh, ma, r.slug);
    } catch {
      /* bỏ qua */
    }
  }
  return { bai, tinh };
}

/** Chỉ các bài dùng ảnh (đúng tên hàm kế hoạch): mã ảnh → danh sách id bài. */
export const timAnhDungOBai = (db: Db): Map<string, number[]> => timAnhDungO(db).bai;
