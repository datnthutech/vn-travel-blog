// Chuỗi mail + trang kết quả của newsletter theo ngôn ngữ: lấy từ CHUỖI GIAO DIỆN (khoá `mail.*`) — cùng nguồn với giao diện site,
// dịch ở "Chuỗi giao diện" trong trang quản trị. Chưa dịch khoá nào → dùng tiếng Việt.
import { CHUOI_GIAO_DIEN_VI } from '@vntraveltips/schema';
import type { Db } from '../db/ket-noi';
import { maNgonNguDangBat } from '../noi-dung/ngon-ngu';
import type { ChuoiBanTin } from './mau-mail';

const KHOA: Record<keyof ChuoiBanTin, string> = {
  xacNhanTieuDe: 'mail.xac-nhan-tieu-de', xacNhanLoiChao: 'mail.xac-nhan-loi-chao', xacNhanNut: 'mail.xac-nhan-nut', xacNhanGhiChu: 'mail.xac-nhan-ghi-chu',
  trangDaXacNhan: 'mail.trang-da-xac-nhan', trangHetHan: 'mail.trang-het-han', trangHuyHoi: 'mail.trang-huy-hoi', trangNutHuy: 'mail.trang-nut-huy',
  trangDaHuy: 'mail.trang-da-huy', trangLinkLoi: 'mail.trang-link-loi', chanTrang: 'mail.chan-trang', huyLienKet: 'mail.huy-lien-ket',
};

/** Ngôn ngữ dùng được cho người đăng ký: phải là ngôn ngữ ĐANG BẬT, nếu không → 'vi'. */
export const chonNgonNgu = (db: Db, ma: string): string => (maNgonNguDangBat(db).includes(ma) ? ma : 'vi');

export function docChuoiBanTin(db: Db, ngonNgu: string): ChuoiBanTin {
  let dich: Record<string, string> = {};
  if (ngonNgu !== 'vi') {
    const r = db.prepare("SELECT du_lieu FROM dich_cau_truc WHERE loai = 'giao-dien' AND khoa = 'giao-dien' AND ngon_ngu = ?").get(ngonNgu) as { du_lieu: string } | undefined;
    if (r) dich = JSON.parse(r.du_lieu) as Record<string, string>;
  }
  return Object.fromEntries(Object.entries(KHOA).map(([k, khoa]) => [k, dich[khoa]?.trim() ? dich[khoa]! : CHUOI_GIAO_DIEN_VI[khoa]!])) as unknown as ChuoiBanTin;
}
