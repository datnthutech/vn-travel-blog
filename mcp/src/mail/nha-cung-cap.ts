// Nhà cung cấp SMTP (Gmail, Brevo…) lưu trong DB. Mật khẩu SMTP mã hoá trong bảng bi_mat, chỉ GHI, không bao giờ đọc ra API.
import { z } from 'zod';
import { coBiMat, docBiMat, luuBiMat, xoaBiMat } from '../bi-mat';
import type { Db } from '../db/ket-noi';

export interface NhaCungCap {
  id: number;
  ten: string;
  host: string;
  cong: number;
  baoMat: 'ssl' | 'starttls';
  taiKhoan: string;
  diaChiGui: string;
  gioiHanNgay: number;
  duPhongQuanTrong: number;
  thuTu: number;
  laChinh: boolean;
  bat: boolean;
}

/** Dạng trả ra API: có `daDatMatKhau`, tuyệt đối không có mật khẩu hay chuỗi mã hoá. */
export type NhaCungCapCongKhai = NhaCungCap & { daDatMatKhau: boolean };

export const MAU_NHA_CUNG_CAP = [
  { ten: 'Gmail', host: 'smtp.gmail.com', cong: 465, baoMat: 'ssl', gioiHanNgay: 500 },
  { ten: 'Brevo', host: 'smtp-relay.brevo.com', cong: 587, baoMat: 'starttls', gioiHanNgay: 300 },
] as const;

export const nhaCungCapSchema = z.object({
  ten: z.string().trim().min(1).max(60),
  host: z.string().trim().min(1).max(200),
  cong: z.number().int().min(1).max(65535),
  baoMat: z.enum(['ssl', 'starttls']),
  taiKhoan: z.string().trim().min(1).max(200),
  matKhau: z.string().min(1).max(500).optional(),
  diaChiGui: z.string().trim().min(3).max(200),
  gioiHanNgay: z.number().int().min(1).max(100000),
  duPhongQuanTrong: z.number().int().min(0).max(100000).default(30),
  thuTu: z.number().int().min(0).max(1000).default(0),
  laChinh: z.boolean().default(false),
  bat: z.boolean().default(true),
});
export type NhaCungCapInput = z.infer<typeof nhaCungCapSchema>;

interface Dong {
  id: number; ten: string; host: string; cong: number; bao_mat: 'ssl' | 'starttls'; tai_khoan: string; mat_khau_khoa: string | null;
  dia_chi_gui: string; gioi_han_ngay: number; du_phong_quan_trong: number; thu_tu: number; la_chinh: number; bat: number;
}
const toNcc = (r: Dong): NhaCungCap => ({
  id: r.id, ten: r.ten, host: r.host, cong: r.cong, baoMat: r.bao_mat, taiKhoan: r.tai_khoan, diaChiGui: r.dia_chi_gui,
  gioiHanNgay: r.gioi_han_ngay, duPhongQuanTrong: r.du_phong_quan_trong, thuTu: r.thu_tu, laChinh: r.la_chinh === 1, bat: r.bat === 1,
});
const tenKhoa = (id: number) => `smtp_${id}`;

export function lietKeNhaCungCap(db: Db): NhaCungCap[] {
  return (db.prepare('SELECT * FROM nha_cung_cap_mail ORDER BY la_chinh DESC, thu_tu, id').all() as Dong[]).map(toNcc);
}

export function lietKeNhaCungCapCongKhai(db: Db): NhaCungCapCongKhai[] {
  return lietKeNhaCungCap(db).map((n) => ({ ...n, daDatMatKhau: coBiMat(db, tenKhoa(n.id)) }));
}

export function docNhaCungCap(db: Db, id: number): NhaCungCap | null {
  const r = db.prepare('SELECT * FROM nha_cung_cap_mail WHERE id = ?').get(id) as Dong | undefined;
  return r ? toNcc(r) : null;
}

/** Mật khẩu SMTP đã giải mã — CHỈ dùng nội bộ khi gửi mail. */
export function matKhauNhaCungCap(db: Db, khoaBiMat: string, id: number): string {
  return docBiMat(db, khoaBiMat, tenKhoa(id)) ?? '';
}

export function themNhaCungCap(db: Db, khoaBiMat: string, input: NhaCungCapInput): number {
  return db.transaction(() => {
    if (input.laChinh) db.prepare('UPDATE nha_cung_cap_mail SET la_chinh = 0').run();
    const id = Number(
      db.prepare(
        'INSERT INTO nha_cung_cap_mail (ten, host, cong, bao_mat, tai_khoan, dia_chi_gui, gioi_han_ngay, du_phong_quan_trong, thu_tu, la_chinh, bat) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      ).run(input.ten, input.host, input.cong, input.baoMat, input.taiKhoan, input.diaChiGui, input.gioiHanNgay, input.duPhongQuanTrong, input.thuTu, input.laChinh ? 1 : 0, input.bat ? 1 : 0).lastInsertRowid,
    );
    if (input.matKhau) {
      luuBiMat(db, khoaBiMat, tenKhoa(id), input.matKhau);
      db.prepare('UPDATE nha_cung_cap_mail SET mat_khau_khoa = ? WHERE id = ?').run(tenKhoa(id), id);
    }
    return id;
  })();
}

export function suaNhaCungCap(db: Db, khoaBiMat: string, id: number, input: Partial<NhaCungCapInput>): boolean {
  const cu = docNhaCungCap(db, id);
  if (!cu) return false;
  const m = { ...cu, ...input };
  db.transaction(() => {
    if (input.laChinh) db.prepare('UPDATE nha_cung_cap_mail SET la_chinh = 0').run();
    db.prepare(
      'UPDATE nha_cung_cap_mail SET ten=?, host=?, cong=?, bao_mat=?, tai_khoan=?, dia_chi_gui=?, gioi_han_ngay=?, du_phong_quan_trong=?, thu_tu=?, la_chinh=?, bat=? WHERE id=?',
    ).run(m.ten, m.host, m.cong, m.baoMat, m.taiKhoan, m.diaChiGui, m.gioiHanNgay, m.duPhongQuanTrong, m.thuTu, m.laChinh ? 1 : 0, m.bat ? 1 : 0, id);
    if (input.matKhau) {
      luuBiMat(db, khoaBiMat, tenKhoa(id), input.matKhau);
      db.prepare('UPDATE nha_cung_cap_mail SET mat_khau_khoa = ? WHERE id = ?').run(tenKhoa(id), id);
    }
  })();
  return true;
}

export function xoaNhaCungCap(db: Db, id: number): boolean {
  return db.transaction(() => {
    xoaBiMat(db, tenKhoa(id));
    db.prepare('DELETE FROM mail_tam_bo_qua WHERE nha_cung_cap_id = ?').run(id);
    return db.prepare('DELETE FROM nha_cung_cap_mail WHERE id = ?').run(id).changes > 0;
  })();
}
