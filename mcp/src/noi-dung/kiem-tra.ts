// Kiểm tra bài trước khi ĐĂNG: dùng đúng `kiemTraBai` (schema + tham chiếu + ảnh) của seo/checklist — không có luật thứ hai.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tinhSchema, type BaiViet, type Tinh } from '@vntraveltips/schema';
import type { Db } from '../db/ket-noi';
import { kiemTraBai, type KetQuaKiemTra } from '../seo/checklist';

const MA_ANH = /^[A-Za-z0-9]{1,64}$/;

export function layDanhSachTinh(db: Db): Tinh[] {
  return (db.prepare('SELECT du_lieu FROM tinh ORDER BY slug').all() as { du_lieu: string }[])
    .map((r) => tinhSchema.safeParse(JSON.parse(r.du_lieu)))
    .flatMap((k) => (k.success ? [k.data] : []));
}

export function kiemTraDayDu(db: Db, anhDir: string, bai: BaiViet | unknown, noiDung: string, slugDangSua?: string): KetQuaKiemTra {
  const baiKhac = (db.prepare("SELECT slug FROM ban_dich WHERE ngon_ngu = 'vi'").all() as { slug: string }[]).filter((r) => r.slug !== slugDangSua);
  const maAnhHopLe = (ma: string) => MA_ANH.test(ma) && existsSync(join(anhDir, ma, 'meta.json'));
  const chuyenMuc = db.prepare('SELECT slug FROM chuyen_muc').all() as { slug: string }[];
  return kiemTraBai({ ...(bai as object), draft: false }, layDanhSachTinh(db), baiKhac, noiDung, maAnhHopLe, chuyenMuc);
}
