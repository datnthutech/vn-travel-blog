// Menu cho trang của ngôn ngữ khác tiếng Việt: dùng menu.json chung nhưng
//  - chỉ giữ mục có đích ĐÃ CÓ BẢN DỊCH đã đăng (mục trỏ trang/bài chưa dịch bị ẩn),
//  - href thêm tiền tố /<mã> (bài → URL bản dịch), nhãn lấy từ bản dịch menu (khoá `dauTrang.<i>` / `dauTrang.<i>.<j>`), thiếu thì giữ nhãn tiếng Việt.
import { duongDanMuc, type MucDaGiai, type MucMenu } from '@vntraveltips/schema';
import { layBaiViet, layTinh } from './bai';
import { layChuyenMuc } from './chuyen-muc';
import { chuoiDich } from './dich-cau-truc';
import { layMenu } from './menu';
import { layTrangDich } from './trang-dich';

export async function giaiMenuNgonNgu(vitri: 'dauTrang' | 'chanTrang', ngonNgu: string): Promise<MucDaGiai[]> {
  const [bai, tinhTatCa, trang] = await Promise.all([layBaiViet(ngonNgu), layTinh(), layTrangDich(ngonNgu)]);
  const tinhCoBai = new Set(bai.map((b) => b.tinh).filter((x): x is string => !!x));
  const coBai = new Set(bai.flatMap((b) => b.chuyenMuc));
  // Bài trong menu trỏ theo slug TIẾNG VIỆT; bản dịch cho biết slug vi qua banDich.vi.
  const viSlug = (b: { banDich?: Record<string, string> }) => b.banDich?.vi?.split('/').filter(Boolean).pop();
  const bangBai = new Map<string, string>();
  for (const b of bai) {
    const s = viSlug(b);
    if (s) bangBai.set(s, `/${ngonNgu}${b.tinh ? `/${b.tinh}/${b.slug}/` : `/kinh-nghiem/${b.slug}/`}`);
  }
  const du = {
    chuyenMuc: layChuyenMuc().filter((c) => coBai.has(c.slug)).map((c) => c.slug),
    tinh: tinhTatCa.filter((t) => tinhCoBai.has(t.slug)).map((t) => t.slug),
    trang: trang.map((t) => t.slugGoc),
    bai: [...bangBai.keys()].map((slug) => ({ slug, tinh: undefined })),
  };
  const href = (m: Pick<MucMenu, 'loai' | 'giaTri'>): string | null => {
    if (m.loai === 'bai') return bangBai.get(m.giaTri) ?? null;
    if (m.loai === 'trang') {
      const t = trang.find((x) => x.slugGoc === m.giaTri); // trang đã dịch → URL theo slug ĐÃ DỊCH
      return t ? `/${ngonNgu}/${t.slug}/` : null;
    }
    const h = duongDanMuc(m, { ...du, bai: [] });
    if (!h) return null;
    if (m.loai === 'link') return h;
    return `/${ngonNgu}${h}`;
  };
  const ra: MucDaGiai[] = [];
  layMenu()[vitri].forEach((m, i) => {
    const h = href(m);
    if (!h) return;
    const con = (m.con ?? []).flatMap((c, j) => {
      const ch = href(c);
      return ch ? [{ nhan: chuoiDich('menu', `${vitri}.${i}.${j}`, ngonNgu, 'nhan', c.nhan), href: ch }] : [];
    });
    ra.push({ nhan: chuoiDich('menu', `${vitri}.${i}`, ngonNgu, 'nhan', m.nhan), href: h, con });
  });
  return ra;
}
