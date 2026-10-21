// Nhật ký thao tác quan trọng (đăng nhập, đăng xuất, đổi mật khẩu…). Không bao giờ ghi mật khẩu hay token.
import type { Db } from '../db/ket-noi';

export function ghiNhatKy(
  db: Db,
  m: { nguoiDungId?: number | null; loai: string; ip?: string; chiTiet?: unknown },
  now: () => number = Date.now,
): void {
  db.prepare('INSERT INTO nhat_ky (luc, nguoi_dung_id, loai, ip, chi_tiet) VALUES (?,?,?,?,?)').run(
    now(), m.nguoiDungId ?? null, m.loai, m.ip ?? null, m.chiTiet === undefined ? null : JSON.stringify(m.chiTiet),
  );
}
