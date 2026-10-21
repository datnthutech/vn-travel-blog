// Gửi bản tin: xếp mỗi người đã xác nhận (cùng ngôn ngữ với bản tin) một mail `thuong` vào hàng đợi của service mail.
// Hạn mức Gmail/Brevo, chuyển nhà cung cấp, "chờ qua ngày" đều do service mail lo; ở đây chỉ bảo đảm KHÔNG GỬI TRÙNG:
//  - ghi `ban_tin_gui` (khoá chính bản tin × người nhận) CÙNG LÚC với xếp mail trong một giao dịch → bấm "Gửi" lần hai/chạy lại không xếp thêm;
//  - bộ lọc `truocKhiGui` gắn vào service mail: người đã huỷ (hoặc bị xoá) trong lúc mail còn chờ thì mail bị bỏ.
import { urlBai } from '@vntraveltips/schema';
import type { Db } from '../db/ket-noi';
import type { DichVuMail } from '../mail/dich-vu';
import { docChuoiBanTin } from './chuoi';
import { mauMailBanTin } from './mau-mail';

export interface BanTin { id: number; tieuDe: string; noiDung: string; ngonNgu: string; loai: 'tu-soan' | 'bai-moi'; baiId: number | null; trangThai: 'nhap' | 'dang-gui' | 'da-gui'; taoLuc: number; guiLuc: number | null }

const sangBanTin = (r: any): BanTin => ({ id: r.id, tieuDe: r.tieu_de, noiDung: r.noi_dung, ngonNgu: r.ngon_ngu, loai: r.loai, baiId: r.bai_id, trangThai: r.trang_thai, taoLuc: r.tao_luc, guiLuc: r.gui_luc });
export const docBanTin = (db: Db, id: number): BanTin | undefined => {
  const r = db.prepare('SELECT * FROM ban_tin WHERE id = ?').get(id);
  return r ? sangBanTin(r) : undefined;
};
export const lietKeBanTin = (db: Db): BanTin[] => (db.prepare('SELECT * FROM ban_tin ORDER BY id DESC').all() as unknown[]).map(sangBanTin);

export const linkHuy = (publicBaseUrl: string, token: string) => `${publicBaseUrl}/api/cong-khai/ban-tin/huy?token=${token}`;

/** Gắn bộ lọc vào service mail: chỉ gửi mail bản tin nếu người nhận VẪN đang `da-xac-nhan`. Mail không thuộc bản tin → không đụng tới. */
export function dangKyBoLocBanTin(db: Db, mail: DichVuMail): void {
  mail.themBoLoc((mailId) => {
    const r = db
      .prepare('SELECT n.trang_thai FROM ban_tin_gui g LEFT JOIN nguoi_dang_ky n ON n.id = g.nguoi_dang_ky_id WHERE g.mail_id = ?')
      .get(mailId) as { trang_thai: string | null } | undefined;
    return !r || r.trang_thai === 'da-xac-nhan';
  });
}

/** Xếp mail cho người chưa có dòng `ban_tin_gui`. Chạy lại an toàn (giao dịch + khoá chính). Trả tổng số người nhận của bản tin và số người MỚI xếp. */
export function xepHangGui(db: Db, mail: DichVuMail, o: { banTinId: number; publicBaseUrl: string; nguoiGuiId: number; now: () => number }): { soNguoiNhan: number; moiXep: number } {
  const bt = docBanTin(db, o.banTinId);
  if (!bt) throw new Error('Không tìm thấy bản tin');
  return db.transaction(() => {
    const chua = db
      .prepare(
        `SELECT n.id, n.email, n.token_huy FROM nguoi_dang_ky n
         WHERE n.trang_thai = 'da-xac-nhan' AND n.ngon_ngu = ?
           AND NOT EXISTS (SELECT 1 FROM ban_tin_gui g WHERE g.ban_tin_id = ? AND g.nguoi_dang_ky_id = n.id AND g.mail_id IS NOT NULL)
         ORDER BY n.id`,
      )
      .all(bt.ngonNgu, bt.id) as { id: number; email: string; token_huy: string }[];
    // Không có ai để gửi thì KHÔNG đổi trạng thái (nếu không bản nháp bị khoá vĩnh viễn ở 'da-gui' với 0 người nhận).
    if (bt.trangThai === 'nhap' && chua.length === 0) return { soNguoiNhan: 0, moiXep: 0 };
    if (bt.trangThai === 'nhap') db.prepare("UPDATE ban_tin SET trang_thai = 'dang-gui', gui_luc = ?, nguoi_gui_id = ? WHERE id = ?").run(o.now(), o.nguoiGuiId, bt.id);
    const chuoi = docChuoiBanTin(db, bt.ngonNgu);
    const ghi = db.prepare('INSERT INTO ban_tin_gui (ban_tin_id, nguoi_dang_ky_id, mail_id) VALUES (?,?,NULL) ON CONFLICT(ban_tin_id, nguoi_dang_ky_id) DO NOTHING');
    const gan = db.prepare('UPDATE ban_tin_gui SET mail_id = ? WHERE ban_tin_id = ? AND nguoi_dang_ky_id = ?');
    for (const n of chua) {
      ghi.run(bt.id, n.id);
      const m = mauMailBanTin({ banTin: bt, nguoiNhan: { email: n.email }, linkHuy: linkHuy(o.publicBaseUrl, n.token_huy), chuoi });
      const mailId = mail.gui({ loai: 'thuong', den: n.email, tieuDe: m.tieuDe, html: m.html, text: m.text, headers: m.headers, nhayCam: true });
      gan.run(mailId, bt.id, n.id);
    }
    const tong = (db.prepare('SELECT count(*) AS n FROM ban_tin_gui WHERE ban_tin_id = ?').get(bt.id) as { n: number }).n;
    return { soNguoiNhan: tong, moiXep: chua.length };
  })();
}

export interface TienDo { tong: number; daGui: number; dangCho: number; boQua: number; loi: number }

/** Đọc trạng thái mail trong hàng đợi. `loi` = số mail còn chờ mà lần thử gần nhất bị lỗi (tập con của `dangCho`); `boQua` = người đã huỷ trước khi mail đi. Hết chờ → bản tin chuyển `da-gui`. */
export function tienDo(db: Db, banTinId: number): TienDo {
  const r = db
    .prepare(
      `SELECT count(*) AS tong,
              coalesce(sum(m.trang_thai = 'da-gui'), 0) AS da_gui,
              coalesce(sum(m.id IS NULL OR m.trang_thai = 'cho'), 0) AS dang_cho,
              coalesce(sum(m.trang_thai = 'bo-qua'), 0) AS bo_qua,
              coalesce(sum(m.trang_thai = 'cho' AND m.loi_cuoi IS NOT NULL), 0) AS loi
       FROM ban_tin_gui g LEFT JOIN mail_hang_doi m ON m.id = g.mail_id WHERE g.ban_tin_id = ?`,
    )
    .get(banTinId) as { tong: number; da_gui: number; dang_cho: number; bo_qua: number; loi: number };
  const kq = { tong: r.tong, daGui: r.da_gui, dangCho: r.dang_cho, boQua: r.bo_qua, loi: r.loi };
  if (kq.dangCho === 0) db.prepare("UPDATE ban_tin SET trang_thai = 'da-gui' WHERE id = ? AND trang_thai = 'dang-gui'").run(banTinId);
  return kq;
}

/** Bản nháp "thông báo bài mới": tiêu đề, mô tả, ảnh bìa (URL tuyệt đối), link bài. */
export function nhapTuBai(db: Db, baiId: number, ngonNgu: string, publicBaseUrl: string, now: () => number): BanTin | undefined {
  const r = db
    .prepare(
      `SELECT d.slug, d.du_lieu, b.tinh FROM bai b JOIN ban_dich d ON d.bai_id = b.id AND d.ngon_ngu = ?
       WHERE b.id = ? AND b.xoa_luc IS NULL AND d.trang_thai = 'da-dang'`,
    )
    .get(ngonNgu, baiId) as { slug: string; du_lieu: string; tinh: string | null } | undefined;
  if (!r) return undefined;
  const d = JSON.parse(r.du_lieu) as { tieuDe?: string; moTa?: string; anhBia?: { ma?: string } };
  const duongDan = ngonNgu === 'vi' ? urlBai({ slug: r.slug, tinh: r.tinh ?? undefined }) : `/${ngonNgu}${urlBai({ slug: r.slug, tinh: r.tinh ?? undefined })}`;
  const khuc = [d.moTa ?? '', d.anhBia?.ma ? `${publicBaseUrl}/anh/${d.anhBia.ma}/960.webp` : '', `Đọc bài: ${publicBaseUrl}${duongDan}`].filter(Boolean);
  const id = Number(
    db
      .prepare("INSERT INTO ban_tin (tieu_de, noi_dung, ngon_ngu, loai, bai_id, trang_thai, tao_luc) VALUES (?,?,?,'bai-moi',?,'nhap',?)")
      .run(d.tieuDe ?? r.slug, khuc.join('\n\n'), ngonNgu, baiId, now()).lastInsertRowid,
  );
  return docBanTin(db, id);
}
