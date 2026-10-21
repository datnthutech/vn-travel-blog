// Hẹn giờ đăng bài theo GIỜ VIỆT NAM (Asia/Ho_Chi_Minh), không phụ thuộc múi giờ của máy chủ.
import type { HangDoiBuild } from '../build/hang-doi';
import type { Db } from '../db/ket-noi';
import { ghiNhatKy } from '../tai-khoan/nhat-ky';
import { danhDauNoiDungDoi } from './phien-noi-dung';

const GIO_VN = 7 * 3600_000; // UTC+7, không có giờ mùa hè

/** "YYYY-MM-DDTHH:mm" (giờ VN) → epoch mili giây. Sai định dạng/ngày không có thật → ném lỗi. */
export function gioVNSangEpoch(chuoi: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(chuoi);
  if (!m) throw new Error('Giờ hẹn phải có dạng YYYY-MM-DDTHH:mm (giờ Việt Nam)');
  const [y, mo, d, h, mi] = m.slice(1).map(Number) as [number, number, number, number, number];
  const utc = Date.UTC(y, mo - 1, d, h, mi);
  const kiem = new Date(utc);
  if (kiem.getUTCFullYear() !== y || kiem.getUTCMonth() !== mo - 1 || kiem.getUTCDate() !== d || h > 23 || mi > 59) throw new Error('Ngày giờ hẹn không có thật');
  return utc - GIO_VN;
}

/** epoch mili giây → "YYYY-MM-DDTHH:mm" theo giờ VN. */
export const epochSangGioVN = (ms: number): string => new Date(ms + GIO_VN).toISOString().slice(0, 16);

/** Đăng mọi bài hẹn giờ đã tới hạn (bỏ qua bài trong thùng rác). Trả id các bài vừa đăng. */
export function dangBaiDenHan(db: Db, now: number): number[] {
  return db.transaction(() => {
    const den = db
      .prepare(
        `SELECT d.bai_id AS id, d.hen_gio_nguoi_id AS nguoi FROM ban_dich d JOIN bai b ON b.id = d.bai_id
         WHERE d.trang_thai = 'hen-gio' AND d.hen_gio <= ? AND b.xoa_luc IS NULL ORDER BY d.hen_gio, d.bai_id`,
      )
      .all(now) as { id: number; nguoi: number | null }[];
    for (const b of den) {
      db.prepare("UPDATE ban_dich SET trang_thai = 'da-dang', hen_gio = NULL, dang_luc = ?, sua_luc = ? WHERE bai_id = ? AND ngon_ngu = 'vi'").run(now, now, b.id);
      db.prepare('UPDATE bai SET nguoi_dang_id = ? WHERE id = ?').run(b.nguoi, b.id);
      ghiNhatKy(db, { nguoiDungId: b.nguoi, loai: 'dang-bai', chiTiet: { baiId: b.id, henGio: true } }, () => now);
    }
    if (den.length > 0) danhDauNoiDungDoi(db);
    return den.map((b) => b.id);
  })();
}

/** Việc chạy mỗi 60 giây: đăng bài đến hạn rồi xếp MỘT lượt build nếu có bài được đăng. */
export function xuLyHenGio(db: Db, hangDoi: HangDoiBuild, now: number): number[] {
  const ids = dangBaiDenHan(db, now);
  if (ids.length > 0) hangDoi.yeuCau();
  return ids;
}
