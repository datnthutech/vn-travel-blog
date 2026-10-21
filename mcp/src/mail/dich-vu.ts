// Service gửi mail dùng chung (đặt lại mật khẩu, mời, xác nhận newsletter, bản tin…).
// `gui()` chỉ xếp mail vào hàng đợi (bảng mail_hang_doi); `xuLyHangDoi()` (mỗi 30 giây) mới thật sự gửi:
//  - Chọn nhà cung cấp: [chính, rồi các cái khác theo thu_tu], chỉ cái đang bật, bỏ cái đang "tạm bỏ qua",
//    lấy cái ĐẦU TIÊN còn hạn mức trong ngày (ngày theo giờ Việt Nam). Mail thường chừa `du_phong_quan_trong` cho mail quan trọng.
//  - Gửi lỗi → thử cái kế tiếp trong cùng lượt; 3 lỗi liên tiếp → bỏ qua nhà cung cấp đó 15 phút.
//  - Hết hạn mức hết nơi → mail nằm lại hàng đợi, sang ngày mới (0 giờ VN) gửi tiếp. Mail quan trọng luôn đi trước.
import nodemailer from 'nodemailer';
import type { Db } from '../db/ket-noi';
import { ghiNhatKy } from '../tai-khoan/nhat-ky';
import { docNhaCungCap, lietKeNhaCungCap, matKhauNhaCungCap, type NhaCungCap } from './nha-cung-cap';
import { ngayVN } from './ngay-vn';

export type LoaiMail = 'quan-trong' | 'thuong';

export interface MailGui {
  loai: LoaiMail;
  den: string;
  tieuDe: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
}

export interface Transport {
  sendMail(opt: { from: string; to: string; subject: string; html: string; text: string; headers?: Record<string, string> }): Promise<unknown>;
}

export interface DichVuMail {
  gui(m: MailGui): number;
  xuLyHangDoi(): Promise<{ daGui: number; conCho: number }>;
  thongKeHomNay(): { id: number; ten: string; daGui: number; gioiHan: number }[];
  guiThu(nhaCungCapId: number, den: string): Promise<void>;
}

const PHUT = 60_000;
const TOI_DA_MOI_LUOT = 20;
const LOI_LIEN_TIEP_TOI_DA = 3;
const TAM_BO_QUA_MS = 15 * PHUT;

export function taoDichVuMail(
  db: Db,
  opt: { khoaBiMat: string; now?: () => number; taoTransport?: (ncc: NhaCungCap, matKhau: string) => Transport },
): DichVuMail {
  const now = opt.now ?? Date.now;
  const taoTransport =
    opt.taoTransport ??
    ((ncc: NhaCungCap, matKhau: string): Transport =>
      nodemailer.createTransport({
        host: ncc.host,
        port: ncc.cong,
        secure: ncc.baoMat === 'ssl',
        requireTLS: ncc.baoMat === 'starttls',
        auth: { user: ncc.taiKhoan, pass: matKhau },
        connectionTimeout: 15_000,
        socketTimeout: 30_000,
      }));

  const daGuiHomNay = (id: number) =>
    ((db.prepare('SELECT so_da_gui FROM mail_dem WHERE nha_cung_cap_id = ? AND ngay = ?').get(id, ngayVN(now())) as { so_da_gui: number } | undefined)?.so_da_gui ?? 0);
  const tangDem = (id: number) =>
    db.prepare('INSERT INTO mail_dem (nha_cung_cap_id, ngay, so_da_gui) VALUES (?,?,1) ON CONFLICT(nha_cung_cap_id, ngay) DO UPDATE SET so_da_gui = so_da_gui + 1').run(id, ngayVN(now()));
  const dangBoQua = (id: number) => {
    const r = db.prepare('SELECT den_luc FROM mail_tam_bo_qua WHERE nha_cung_cap_id = ?').get(id) as { den_luc: number } | undefined;
    return !!r && r.den_luc > now();
  };
  const nhatKy = (m: { mailId?: number; nccId?: number; den?: string; loai?: string; ketQua: string; loi?: string }) =>
    db.prepare('INSERT INTO mail_nhat_ky (luc, mail_id, nha_cung_cap_id, den, loai, ket_qua, loi) VALUES (?,?,?,?,?,?,?)').run(
      now(), m.mailId ?? null, m.nccId ?? null, m.den ?? null, m.loai ?? null, m.ketQua, m.loi ?? null,
    );

  // Thông báo lỗi lưu lại không được chứa mật khẩu SMTP.
  const che = (loi: unknown, ncc: NhaCungCap): string => {
    let s = loi instanceof Error ? loi.message : String(loi);
    const mk = docBiMatAnToan(ncc.id);
    if (mk) s = s.split(mk).join('***');
    return s.slice(0, 500);
  };
  const docBiMatAnToan = (id: number): string => {
    try {
      return matKhauNhaCungCap(db, opt.khoaBiMat, id);
    } catch {
      return '';
    }
  };

  function ghiLoi(ncc: NhaCungCap) {
    const r = db.prepare('SELECT so_loi_lien_tiep FROM mail_tam_bo_qua WHERE nha_cung_cap_id = ?').get(ncc.id) as { so_loi_lien_tiep: number } | undefined;
    const n = (r?.so_loi_lien_tiep ?? 0) + 1;
    const batDau = n >= LOI_LIEN_TIEP_TOI_DA;
    db.prepare('INSERT OR REPLACE INTO mail_tam_bo_qua (nha_cung_cap_id, den_luc, so_loi_lien_tiep) VALUES (?,?,?)').run(ncc.id, batDau ? now() + TAM_BO_QUA_MS : 0, batDau ? 0 : n);
    if (batDau) nhatKy({ nccId: ncc.id, ketQua: 'tam-bo-qua', loi: `Lỗi ${LOI_LIEN_TIEP_TOI_DA} lần liên tiếp, tạm bỏ qua 15 phút` });
  }
  const ghiThanhCong = (ncc: NhaCungCap) =>
    db.prepare('INSERT OR REPLACE INTO mail_tam_bo_qua (nha_cung_cap_id, den_luc, so_loi_lien_tiep) VALUES (?,0,0)').run(ncc.id);

  function danhSachUngVien(loai: LoaiMail): NhaCungCap[] {
    return lietKeNhaCungCap(db).filter((n) => {
      if (!n.bat || dangBoQua(n.id)) return false;
      const khaDung = n.gioiHanNgay - (loai === 'thuong' ? n.duPhongQuanTrong : 0) - daGuiHomNay(n.id);
      return khaDung > 0;
    }); // lietKeNhaCungCap đã xếp: chính trước, rồi theo thu_tu
  }

  async function guiQua(ncc: NhaCungCap, m: MailGui): Promise<void> {
    const tp = taoTransport(ncc, matKhauNhaCungCap(db, opt.khoaBiMat, ncc.id));
    await tp.sendMail({ from: ncc.diaChiGui, to: m.den, subject: m.tieuDe, html: m.html, text: m.text, headers: m.headers });
  }

  return {
    gui(m) {
      return Number(
        db.prepare('INSERT INTO mail_hang_doi (loai, den, tieu_de, html, text, headers, tao_luc) VALUES (?,?,?,?,?,?,?)').run(
          m.loai, m.den, m.tieuDe, m.html, m.text, m.headers ? JSON.stringify(m.headers) : null, now(),
        ).lastInsertRowid,
      );
    },

    async xuLyHangDoi() {
      const cho = db
        .prepare("SELECT * FROM mail_hang_doi WHERE trang_thai = 'cho' ORDER BY (loai = 'quan-trong') DESC, id LIMIT ?")
        .all(TOI_DA_MOI_LUOT) as { id: number; loai: LoaiMail; den: string; tieu_de: string; html: string; text: string; headers: string | null }[];
      let daGui = 0;
      for (const r of cho) {
        const mail: MailGui = { loai: r.loai, den: r.den, tieuDe: r.tieu_de, html: r.html, text: r.text, headers: r.headers ? JSON.parse(r.headers) : undefined };
        const chinh = lietKeNhaCungCap(db).find((n) => n.laChinh && n.bat);
        let xong = false;
        let loiCuoi = 'Không có nhà cung cấp mail còn hạn mức';
        for (const ncc of danhSachUngVien(r.loai)) {
          try {
            await guiQua(ncc, mail);
          } catch (e) {
            loiCuoi = che(e, ncc);
            nhatKy({ mailId: r.id, nccId: ncc.id, den: r.den, loai: r.loai, ketQua: 'loi', loi: loiCuoi });
            ghiLoi(ncc);
            continue; // thử nhà cung cấp kế tiếp trong cùng lượt
          }
          ghiThanhCong(ncc);
          tangDem(ncc.id);
          db.prepare("UPDATE mail_hang_doi SET trang_thai = 'da-gui', loi_cuoi = NULL WHERE id = ?").run(r.id);
          nhatKy({ mailId: r.id, nccId: ncc.id, den: r.den, loai: r.loai, ketQua: 'ok' });
          if (chinh && ncc.id !== chinh.id) {
            nhatKy({ mailId: r.id, nccId: ncc.id, den: r.den, loai: r.loai, ketQua: 'chuyen-nha-cung-cap', loi: `Chuyển từ ${chinh.ten} sang ${ncc.ten}` });
            ghiNhatKy(db, { loai: 'mail-chuyen-nha-cung-cap', chiTiet: { tu: chinh.ten, sang: ncc.ten, mailId: r.id } }, now);
          }
          daGui++;
          xong = true;
          break;
        }
        if (!xong) db.prepare('UPDATE mail_hang_doi SET thu_lai = thu_lai + 1, loi_cuoi = ? WHERE id = ?').run(loiCuoi, r.id);
      }
      const conCho = (db.prepare("SELECT count(*) AS n FROM mail_hang_doi WHERE trang_thai = 'cho'").get() as { n: number }).n;
      return { daGui, conCho };
    },

    thongKeHomNay() {
      return lietKeNhaCungCap(db).map((n) => ({ id: n.id, ten: n.ten, daGui: daGuiHomNay(n.id), gioiHan: n.gioiHanNgay }));
    },

    async guiThu(nhaCungCapId, den) {
      const ncc = docNhaCungCap(db, nhaCungCapId);
      if (!ncc) throw new Error('Không tìm thấy nhà cung cấp mail');
      const mail: MailGui = {
        loai: 'quan-trong', den, tieuDe: 'Thử gửi mail từ VNTravelTips',
        html: '<p>Nếu bạn đọc được thư này, cấu hình gửi mail đã đúng.</p>', text: 'Nếu bạn đọc được thư này, cấu hình gửi mail đã đúng.',
      };
      try {
        await guiQua(ncc, mail);
      } catch (e) {
        const loi = che(e, ncc);
        nhatKy({ nccId: ncc.id, den, loai: 'thu', ketQua: 'loi', loi });
        throw new Error(loi);
      }
      tangDem(ncc.id);
      nhatKy({ nccId: ncc.id, den, loai: 'thu', ketQua: 'ok' });
    },
  };
}
