// Mẫu mail + trang kết quả của newsletter. Chuỗi theo ngôn ngữ truyền vào qua tham số `chuoi` (xem chuoi.ts); không truyền → tiếng Việt.
import { CHUOI_GIAO_DIEN_VI } from '@vntraveltips/schema';
export interface ChuoiBanTin {
  xacNhanTieuDe: string; xacNhanLoiChao: string; xacNhanNut: string; xacNhanGhiChu: string;
  trangDaXacNhan: string; trangHetHan: string; trangHuyHoi: string; trangNutHuy: string; trangDaHuy: string; trangLinkLoi: string;
  chanTrang: string; huyLienKet: string;
}

/** Chuỗi tiếng Việt mặc định (nguồn: khoá `mail.*` của chuỗi giao diện); ngôn ngữ khác do `docChuoiBanTin(db, mã)` dựng. */
const VI: ChuoiBanTin = {
  xacNhanTieuDe: CHUOI_GIAO_DIEN_VI['mail.xac-nhan-tieu-de']!, xacNhanLoiChao: CHUOI_GIAO_DIEN_VI['mail.xac-nhan-loi-chao']!, xacNhanNut: CHUOI_GIAO_DIEN_VI['mail.xac-nhan-nut']!,
  xacNhanGhiChu: CHUOI_GIAO_DIEN_VI['mail.xac-nhan-ghi-chu']!, trangDaXacNhan: CHUOI_GIAO_DIEN_VI['mail.trang-da-xac-nhan']!, trangHetHan: CHUOI_GIAO_DIEN_VI['mail.trang-het-han']!,
  trangHuyHoi: CHUOI_GIAO_DIEN_VI['mail.trang-huy-hoi']!, trangNutHuy: CHUOI_GIAO_DIEN_VI['mail.trang-nut-huy']!, trangDaHuy: CHUOI_GIAO_DIEN_VI['mail.trang-da-huy']!,
  trangLinkLoi: CHUOI_GIAO_DIEN_VI['mail.trang-link-loi']!, chanTrang: CHUOI_GIAO_DIEN_VI['mail.chan-trang']!, huyLienKet: CHUOI_GIAO_DIEN_VI['mail.huy-lien-ket']!,
};
export const chuoiBanTinVi = (): ChuoiBanTin => VI;

export const escHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function mauMailXacNhan(o: { ngonNgu: string; link: string; chuoi?: ChuoiBanTin }): { tieuDe: string; html: string; text: string } {
  const c = o.chuoi ?? VI;
  return {
    tieuDe: c.xacNhanTieuDe,
    text: `${c.xacNhanLoiChao}\n\n${o.link}\n\n${c.xacNhanGhiChu}`,
    html: `<p>${escHtml(c.xacNhanLoiChao)}</p><p><a href="${escHtml(o.link)}" style="display:inline-block;padding:12px 20px;background:#0f766e;color:#fff;text-decoration:none;border-radius:6px">${escHtml(c.xacNhanNut)}</a></p><p style="color:#555;font-size:13px">${escHtml(c.xacNhanGhiChu)}</p>`,
  };
}

const ANH = /^https?:\/\/\S+\.(?:jpe?g|png|webp|gif)(?:\?\S*)?$/i;
const LIEN_KET = /https?:\/\/[^\s<]+/g;

/** Nội dung bản tin là chữ thường: đoạn cách nhau dòng trống; dòng chỉ gồm link ảnh → ảnh; link khác → liên kết bấm được. Mọi thứ được thoát HTML. */
function noiDungSangHtml(noiDung: string): string {
  return noiDung
    .split(/\n{2,}/)
    .map((doan) => doan.trim())
    .filter(Boolean)
    .map((doan) => {
      if (ANH.test(doan)) return `<p><img src="${escHtml(doan)}" alt="" style="max-width:100%;height:auto"></p>`;
      const html = escHtml(doan).replace(LIEN_KET, (u) => `<a href="${u}">${u}</a>`).replace(/\n/g, '<br>');
      return `<p>${html}</p>`;
    })
    .join('');
}

export function mauMailBanTin(o: { banTin: { tieuDe: string; noiDung: string; ngonNgu: string }; nguoiNhan?: { email: string }; linkHuy: string; chuoi?: ChuoiBanTin }): {
  tieuDe: string; html: string; text: string; headers: Record<string, string>;
} {
  const c = o.chuoi ?? VI;
  return {
    tieuDe: o.banTin.tieuDe,
    text: `${o.banTin.noiDung}\n\n--\n${c.chanTrang}\n${c.huyLienKet}: ${o.linkHuy}`,
    html: `${noiDungSangHtml(o.banTin.noiDung)}<hr><p style="color:#555;font-size:13px">${escHtml(c.chanTrang)} <a href="${escHtml(o.linkHuy)}">${escHtml(c.huyLienKet)}</a></p>`,
    headers: { 'List-Unsubscribe': `<${o.linkHuy}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
  };
}

/** Trang HTML nhỏ, không JS. `bieuMau` = form POST (nút "Xác nhận huỷ"). */
export function trangKetQua(o: { ngonNgu: string; noiDung: string; bieuMau?: { hanhDong: string; nut: string } }): string {
  const form = o.bieuMau ? `<form method="post" action="${escHtml(o.bieuMau.hanhDong)}"><button type="submit">${escHtml(o.bieuMau.nut)}</button></form>` : '';
  return `<!doctype html><html lang="${escHtml(o.ngonNgu)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>VNTravelTips</title><style>body{font:18px/1.6 system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1rem;color:#1f2937}button,a.nut{font:inherit;padding:.7rem 1.2rem;min-height:44px;background:#0f766e;color:#fff;border:0;border-radius:6px}</style></head><body><p>${escHtml(o.noiDung)}</p>${form}<p><a href="/">VNTravelTips</a></p></body></html>`;
}
