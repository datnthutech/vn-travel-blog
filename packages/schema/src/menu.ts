// Menu đầu trang / chân trang do chủ blog tự sắp xếp. Chỉ 1 cấp con; mục trỏ tới thứ không tồn tại hoặc chưa đăng thì bị ẩn lúc build.
import { z } from 'zod';
import { urlBai, type BaiViet } from './bai-viet';
import { urlChuyenMuc, urlTinh, urlTrang } from './url';

const LOAI = ['chuyen-muc', 'tinh', 'trang', 'bai', 'link'] as const;
const slug = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// `link` chỉ được là https://… hoặc đường dẫn nội bộ bắt đầu bằng "/" (không "//", không khoảng trắng): chặn javascript:, data:, http:.
export const linkMenuHopLe = (s: string): boolean => {
  if (/\s/.test(s) || s.includes('\\')) return false; // trình duyệt coi \ như / nên "/\evil.com" là địa chỉ ngoài
  if (s.startsWith('/')) return !s.startsWith('//');
  try {
    return new URL(s).protocol === 'https:';
  } catch {
    return false;
  }
};

const mucCoBan = z
  .object({
    nhan: z.string().trim().min(1, 'nhãn không được để trống').max(40, 'nhãn tối đa 40 ký tự'),
    loai: z.enum(LOAI),
    giaTri: z.string().trim().min(1, 'giá trị không được để trống').max(300),
  })
  .strict()
  .superRefine((m, ctx) => {
    if (m.loai === 'link' ? !linkMenuHopLe(m.giaTri) : !slug.test(m.giaTri)) {
      ctx.addIssue({ code: 'custom', path: ['giaTri'], message: m.loai === 'link' ? 'link phải là https://… hoặc đường dẫn bắt đầu bằng /' : 'giá trị phải là slug (a-z, 0-9, dấu gạch ngang)' });
    }
  });

export const mucMenuSchema = z
  .object({
    nhan: z.string().trim().min(1, 'nhãn không được để trống').max(40, 'nhãn tối đa 40 ký tự'),
    loai: z.enum(LOAI),
    giaTri: z.string().trim().min(1, 'giá trị không được để trống').max(300),
    con: z.array(mucCoBan).max(20, 'tối đa 20 mục con').optional(),
  })
  .strict()
  .superRefine((m, ctx) => {
    if (m.loai === 'link' ? !linkMenuHopLe(m.giaTri) : !slug.test(m.giaTri)) {
      ctx.addIssue({ code: 'custom', path: ['giaTri'], message: m.loai === 'link' ? 'link phải là https://… hoặc đường dẫn bắt đầu bằng /' : 'giá trị phải là slug (a-z, 0-9, dấu gạch ngang)' });
    }
  });

export const menuSchema = z.object({
  dauTrang: z.array(mucMenuSchema).max(12, 'menu đầu trang tối đa 12 mục'),
  chanTrang: z.array(mucMenuSchema).max(20, 'menu chân trang tối đa 20 mục'),
});

export type MucMenu = z.infer<typeof mucMenuSchema>;
export type Menu = z.infer<typeof menuSchema>;

/** Dữ liệu để biết đích có tồn tại (và đã đăng, ở bản đang build) không. */
export interface DuLieuMenu {
  /** slug chuyên mục có ít nhất một bài */
  chuyenMuc: Iterable<string>;
  tinh: Iterable<string>;
  /** slug trang tĩnh đã đăng */
  trang: Iterable<string>;
  /** bài có thể truy cập ở bản đang build (production: chỉ bài đã đăng) */
  bai: Pick<BaiViet, 'slug' | 'tinh'>[];
}

/** URL của một mục menu, hoặc null nếu đích không tồn tại / chưa đăng (mục bị ẩn). */
export function duongDanMuc(muc: Pick<MucMenu, 'loai' | 'giaTri'>, d: DuLieuMenu): string | null {
  switch (muc.loai) {
    case 'link':
      return linkMenuHopLe(muc.giaTri) ? muc.giaTri : null;
    case 'chuyen-muc':
      return new Set(d.chuyenMuc).has(muc.giaTri) ? urlChuyenMuc(muc.giaTri) : null;
    case 'tinh':
      return new Set(d.tinh).has(muc.giaTri) ? urlTinh(muc.giaTri) : null;
    case 'trang':
      return new Set(d.trang).has(muc.giaTri) ? urlTrang(muc.giaTri) : null;
    case 'bai': {
      const b = d.bai.find((x) => x.slug === muc.giaTri);
      return b ? urlBai(b) : null;
    }
  }
}

export interface MucDaGiai { nhan: string; href: string; con: { nhan: string; href: string }[] }

/** Giải menu thành danh sách có href, bỏ các mục có đích không tồn tại (mục cha mất đích thì mất cả nhóm). */
export function giaiMenu(muc: MucMenu[], d: DuLieuMenu): MucDaGiai[] {
  const ra: MucDaGiai[] = [];
  for (const m of muc) {
    const href = duongDanMuc(m, d);
    if (!href) continue;
    const con = (m.con ?? []).flatMap((c) => {
      const h = duongDanMuc(c, d);
      return h ? [{ nhan: c.nhan, href: h }] : [];
    });
    ra.push({ nhan: m.nhan, href, con });
  }
  return ra;
}

/** Đổi lỗi của zod thành câu tiếng Việt kèm đường dẫn (vd "dauTrang.0.con.1: menu chỉ được lồng 1 cấp"). */
export function loiMenu(error: z.ZodError): string[] {
  return error.issues.map((i) => {
    const duong = i.path.join('.') || '(menu)';
    if (i.code === 'unrecognized_keys') {
      return i.keys.includes('con') ? `${duong}: menu chỉ được lồng 1 cấp (mục con không được có mục con)` : `${duong}: có trường không được phép (${i.keys.join(', ')})`;
    }
    return `${duong}: ${i.message}`;
  });
}
