// Báo mail cho TÁC GIẢ bài khi có bình luận mới (hiện hoặc chờ xem), nếu họ không tắt `nhan_mail_binh_luan` và không phải người vừa trả lời.
import { urlBai } from '@vntraveltips/schema';
import type { Db } from '../db/ket-noi';
import type { DichVuMail } from '../mail/dich-vu';

const escHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function thongBaoBinhLuanMoi(
  db: Db,
  mail: DichVuMail,
  m: { baiId: number; binhLuanId: number; nguoiTraLoiId: number | null; ten: string; noiDung: string; trangThai: 'hien' | 'cho-xem' | 'an'; publicBaseUrl: string },
): boolean {
  if (m.trangThai === 'an') return false;
  const r = db
    .prepare(
      `SELECT u.id, u.email, u.ten, u.nhan_mail_binh_luan, u.bi_khoa, json_extract(d.du_lieu, '$.tieuDe') AS tieu_de, d.slug, b.tinh
       FROM bai b JOIN ban_dich d ON d.bai_id = b.id AND d.ngon_ngu = 'vi' JOIN nguoi_dung u ON u.id = b.tac_gia_id WHERE b.id = ?`,
    )
    .get(m.baiId) as { id: number; email: string; ten: string; nhan_mail_binh_luan: number; bi_khoa: number; tieu_de: string | null; slug: string; tinh: string | null } | undefined;
  if (!r || r.bi_khoa === 1 || r.nhan_mail_binh_luan !== 1 || r.id === m.nguoiTraLoiId) return false;
  const url = `${m.publicBaseUrl}${urlBai({ slug: r.slug, tinh: r.tinh ?? undefined })}`;
  const trich = m.noiDung.length > 300 ? `${m.noiDung.slice(0, 300)}…` : m.noiDung;
  const cho = m.trangThai === 'cho-xem' ? ' (đang CHỜ XEM — nghi spam, vào trang quản trị để duyệt)' : '';
  mail.gui({
    loai: 'thuong',
    den: r.email,
    tieuDe: `Bình luận mới ở bài "${r.tieu_de ?? r.slug}"`,
    text: `${m.ten} vừa bình luận${cho}:\n\n${trich}\n\nBài: ${url}\nQuản lý bình luận: ${m.publicBaseUrl}/quan-tri/binh-luan\nTắt thư báo này trong "Của tôi" ở trang quản trị.`,
    html: `<p><strong>${escHtml(m.ten)}</strong> vừa bình luận${cho}:</p><blockquote>${escHtml(trich)}</blockquote><p><a href="${url}">Mở bài</a> · <a href="${m.publicBaseUrl}/quan-tri/binh-luan">Quản lý bình luận</a></p>`,
  });
  return true;
}
