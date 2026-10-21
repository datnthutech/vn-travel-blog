// Bộ đếm "phiên nội dung": mỗi lần nội dung đổi thì tăng 1. Build so bộ đếm này để biết có cần build lại không.
import type { Db } from '../db/ket-noi';

/** Mọi hàm ghi nội dung phải gọi hàm này (rồi `hangDoi.yeuCau()` để xếp lượt build). */
export function danhDauNoiDungDoi(db: Db): void {
  db.prepare("UPDATE he_thong SET gia_tri = CAST(CAST(gia_tri AS INTEGER) + 1 AS TEXT) WHERE khoa = 'noi_dung_phien'").run();
}

export function docNoiDungPhien(db: Db): number {
  const r = db.prepare("SELECT gia_tri FROM he_thong WHERE khoa = 'noi_dung_phien'").get() as { gia_tri: string } | undefined;
  return Number(r?.gia_tri ?? 0);
}
