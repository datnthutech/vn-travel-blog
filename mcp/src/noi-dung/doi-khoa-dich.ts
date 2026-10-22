// Bản dịch chuyên mục/tỉnh/trang tĩnh (bảng dich_cau_truc) gắn vào đối tượng tiếng Việt qua `khoa` = slug tiếng Việt.
// Đổi slug tiếng Việt mà không đổi khoá theo thì bản dịch thành "mồ côi" → bị bỏ khi xuất → trang dịch biến mất (404).
// File riêng, chỉ phụ thuộc DB, để chuyen-muc/tinh/trang gọi được mà không tạo vòng import với dich-cau-truc.ts.
import type { Db } from '../db/ket-noi';

export function doiKhoaDichCauTruc(db: Db, loai: 'chuyen-muc' | 'tinh' | 'trang', khoaCu: string, khoaMoi: string): void {
  if (khoaCu === khoaMoi) return;
  db.prepare('UPDATE dich_cau_truc SET khoa = ? WHERE loai = ? AND khoa = ?').run(khoaMoi, loai, khoaCu);
}

interface MucMenuToiThieu { loai: string; giaTri: string; con?: MucMenuToiThieu[] }
type MenuToiThieu = { dauTrang: MucMenuToiThieu[]; chanTrang: MucMenuToiThieu[] };

/** Khoá vị trí → "danh tính" của mục (thứ nó trỏ tới). Mục trùng danh tính được đánh số lần xuất hiện để ghép theo thứ tự. */
function khoaTheoDanhTinh(menu: MenuToiThieu): Map<string, string> {
  const ra = new Map<string, string>();
  const dem = new Map<string, number>();
  const ghi = (khoa: string, m: MucMenuToiThieu, cha: string) => {
    const goc = `${cha}|${m.loai}|${m.giaTri}`;
    const n = dem.get(goc) ?? 0;
    dem.set(goc, n + 1);
    ra.set(khoa, `${goc}#${n}`);
  };
  for (const vung of ['dauTrang', 'chanTrang'] as const) {
    menu[vung].forEach((m, i) => {
      ghi(`${vung}.${i}`, m, vung);
      m.con?.forEach((c, j) => ghi(`${vung}.${i}.${j}`, c, `${vung}>${m.loai}|${m.giaTri}`));
    });
  }
  return ra;
}

/**
 * Bản dịch nhãn menu gắn theo khoá VỊ TRÍ (`dauTrang.<i>[.<j>]`). Lưu menu mới (đổi thứ tự, chèn, xoá mục) → chuyển bản dịch
 * sang vị trí mới của CÙNG mục (cùng loại + giá trị, cùng vùng/mục cha); mục đã bị xoá thì bỏ bản dịch của nó.
 */
export function chuyenKhoaDichMenu(db: Db, menuCu: MenuToiThieu | null, menuMoi: MenuToiThieu): void {
  const cu = khoaTheoDanhTinh(menuCu ?? { dauTrang: [], chanTrang: [] });
  const moiTheoDanhTinh = new Map([...khoaTheoDanhTinh(menuMoi)].map(([khoa, dt]) => [dt, khoa]));
  const rows = db.prepare("SELECT khoa, ngon_ngu, du_lieu, sua_luc FROM dich_cau_truc WHERE loai = 'menu'").all() as {
    khoa: string; ngon_ngu: string; du_lieu: string; sua_luc: number;
  }[];
  db.transaction(() => {
    db.prepare("DELETE FROM dich_cau_truc WHERE loai = 'menu'").run();
    const them = db.prepare("INSERT INTO dich_cau_truc (loai, khoa, ngon_ngu, du_lieu, sua_luc) VALUES ('menu', ?, ?, ?, ?)");
    for (const r of rows) {
      const dt = cu.get(r.khoa);
      const khoaMoi = dt ? moiTheoDanhTinh.get(dt) : undefined;
      if (khoaMoi) them.run(khoaMoi, r.ngon_ngu, r.du_lieu, r.sua_luc);
    }
  })();
}
