// Theo dõi bản sao lưu ra NGOÀI VPS: script deploy/backup/backup-anh.sh (chạy trên host) ghi thời điểm vào file đánh dấu
// `<dataDir>/db/sao-luu/.da-day-ra-ngoai` sau khi rclone thành công. Quá 26 giờ chưa có → cảnh báo, gửi mail cho quản trị (tối đa 1 lần/ngày).
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Db } from '../db/ket-noi';
import { ngayVN } from '../mail/ngay-vn';
import type { DichVuMail } from '../mail/dich-vu';

export const NGUONG_CANH_BAO_MS = 26 * 3600_000;

export function docSaoLuuNgoai(dataDir: string): number | null {
  const f = join(dataDir, 'db', 'sao-luu', '.da-day-ra-ngoai');
  if (!existsSync(f)) return null;
  const n = Number(readFileSync(f, 'utf8').trim());
  return Number.isFinite(n) && n > 0 ? n : Math.floor(statSync(f).mtimeMs);
}

export interface TrangThaiSaoLuu { trongVpsLuc: number | null; ngoaiVpsLuc: number | null; canhBao: boolean }

export function trangThaiSaoLuu(db: Db, dataDir: string, now: number): TrangThaiSaoLuu {
  const t = db.prepare("SELECT gia_tri FROM he_thong WHERE khoa = 'sao_luu_cuoi_luc'").get() as { gia_tri: string } | undefined;
  const ngoai = docSaoLuuNgoai(dataDir);
  // Chưa từng có bản ra ngoài VPS (chưa cấu hình) cũng đáng cảnh báo trên bảng tổng quan.
  return { trongVpsLuc: t ? Number(t.gia_tri) : null, ngoaiVpsLuc: ngoai, canhBao: ngoai === null || now - ngoai > NGUONG_CANH_BAO_MS };
}

/**
 * Gửi mail cảnh báo `quan-trong` cho mọi quản trị chưa bị khoá, TỐI ĐA 1 LẦN/NGÀY (giờ VN), khi bản ngoài VPS đã quá 26 giờ.
 * Chưa từng có file đánh dấu (chưa cấu hình sao lưu ngoài) chỉ hiện cảnh báo trên bảng tổng quan, không gửi mail.
 * Trả số mail đã xếp hàng.
 */
export function guiCanhBaoSaoLuu(db: Db, mail: DichVuMail, dataDir: string, now: number): number {
  const tt = trangThaiSaoLuu(db, dataDir, now);
  if (tt.ngoaiVpsLuc === null || !tt.canhBao) return 0;
  const homNay = ngayVN(now);
  const cu = db.prepare("SELECT gia_tri FROM he_thong WHERE khoa = 'canh_bao_sao_luu_ngay'").get() as { gia_tri: string } | undefined;
  if (cu?.gia_tri === homNay) return 0;
  db.prepare("INSERT OR REPLACE INTO he_thong (khoa, gia_tri) VALUES ('canh_bao_sao_luu_ngay', ?)").run(homNay);
  const gio = Math.floor((now - tt.ngoaiVpsLuc) / 3600_000);
  let n = 0;
  for (const u of db.prepare("SELECT email, ten FROM nguoi_dung WHERE vai_tro = 'quan-tri' AND bi_khoa = 0").all() as { email: string; ten: string }[]) {
    mail.gui({
      loai: 'quan-trong',
      den: u.email,
      tieuDe: 'Cảnh báo: chưa sao lưu ra ngoài VPS',
      text: `Xin chào ${u.ten},\n\nBản sao lưu dữ liệu VNTravelTips ra ngoài VPS đã ${gio} giờ chưa chạy (ngưỡng 26 giờ). Hãy kiểm tra cron của deploy/backup/backup-anh.sh trên VPS.`,
      html: `<p>Xin chào ${u.ten.replace(/[<>&]/g, '')},</p><p>Bản sao lưu dữ liệu VNTravelTips ra ngoài VPS đã <strong>${gio} giờ</strong> chưa chạy (ngưỡng 26 giờ).</p><p>Hãy kiểm tra cron của <code>deploy/backup/backup-anh.sh</code> trên VPS.</p>`,
    });
    n++;
  }
  return n;
}
