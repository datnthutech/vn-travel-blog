// Chống dò mật khẩu (thiết kế 6.1).
//  - IP sai 5 lần trong 15 phút → chặn 15 phút; mỗi lần bị chặn lại thời gian GẤP ĐÔI, tối đa 24 giờ.
//    Đăng nhập đúng xoá bộ đếm (và mức leo thang) của IP đó.
//  - Một tài khoản bị sai > 20 lần trong 1 giờ (từ mọi IP) → mỗi lần thử bị làm chậm 3 giây, KHÔNG khoá cứng
//    (khoá cứng sẽ cho kẻ xấu khoá chủ blog ra khỏi trang quản trị).
import type { Db } from '../db/ket-noi';

const PHUT = 60_000;
export const SO_LAN_SAI_TOI_DA = 5;
const CUA_SO_IP = 15 * PHUT;
const CHAN_DAU = 15 * PHUT;
const CHAN_TOI_DA = 24 * 60 * PHUT;
const CUA_SO_TAI_KHOAN = 60 * PHUT;
const NGUONG_TAI_KHOAN = 20;
const TRE_TAI_KHOAN_MS = 3000;

export type KetQuaKiemTra = { choPhep: true; treMs: number } | { choPhep: false; conLaiGiay: number };

export interface ChongDo {
  kiemTra(ip: string, email: string): KetQuaKiemTra;
  ghiThatBai(ip: string, email: string): void;
  ghiThanhCong(ip: string, email: string): void;
}

const chuanEmail = (e: string) => e.trim().toLowerCase();

export function taoChongDo(db: Db, now: () => number = Date.now): ChongDo {
  const layChan = db.prepare('SELECT den_luc, so_lan_chan FROM chan_ip WHERE ip = ?');
  return {
    kiemTra(ip, email) {
      const t = now();
      const chan = layChan.get(ip) as { den_luc: number; so_lan_chan: number } | undefined;
      if (chan && chan.den_luc > t) return { choPhep: false, conLaiGiay: Math.ceil((chan.den_luc - t) / 1000) };
      const sai = (db.prepare('SELECT count(*) AS n FROM dang_nhap_thu WHERE email = ? AND thanh_cong = 0 AND luc > ?').get(chuanEmail(email), t - CUA_SO_TAI_KHOAN) as { n: number }).n;
      return { choPhep: true, treMs: sai > NGUONG_TAI_KHOAN ? TRE_TAI_KHOAN_MS : 0 };
    },

    ghiThatBai(ip, email) {
      const t = now();
      db.prepare('INSERT INTO dang_nhap_thu (ip, email, thanh_cong, luc) VALUES (?,?,0,?)').run(ip, chuanEmail(email), t);
      const chan = layChan.get(ip) as { den_luc: number; so_lan_chan: number } | undefined;
      // Chỉ tính các lần sai sau lần đăng nhập đúng gần nhất, sau khi lần chặn trước hết hạn và trong cửa sổ 15 phút.
      const dungCuoi = (db.prepare('SELECT coalesce(max(id), 0) AS id FROM dang_nhap_thu WHERE ip = ? AND thanh_cong = 1').get(ip) as { id: number }).id;
      const tu = Math.max(t - CUA_SO_IP, chan?.den_luc ?? 0);
      const n = (db.prepare('SELECT count(*) AS n FROM dang_nhap_thu WHERE ip = ? AND thanh_cong = 0 AND id > ? AND luc > ?').get(ip, dungCuoi, tu) as { n: number }).n;
      if (n >= SO_LAN_SAI_TOI_DA) {
        const lan = (chan?.so_lan_chan ?? 0) + 1;
        const thoiGian = Math.min(CHAN_DAU * 2 ** (lan - 1), CHAN_TOI_DA);
        db.prepare('INSERT OR REPLACE INTO chan_ip (ip, den_luc, so_lan_chan) VALUES (?,?,?)').run(ip, t + thoiGian, lan);
      }
    },

    ghiThanhCong(ip, email) {
      db.prepare('INSERT INTO dang_nhap_thu (ip, email, thanh_cong, luc) VALUES (?,?,1,?)').run(ip, chuanEmail(email), now());
      db.prepare('DELETE FROM chan_ip WHERE ip = ?').run(ip);
    },
  };
}

// Hàng đợi theo khoá (IP): các lần thử đăng nhập cùng IP chạy lần lượt, để "kiểm tra → băm mật khẩu → ghi lần sai"
// không bị 200 request song song cùng vượt qua bước kiểm tra trước khi lần sai nào được ghi.
const dangChay = new Map<string, Promise<unknown>>();
export function tuanTu<T>(khoa: string, viec: () => Promise<T>): Promise<T> {
  const truoc = dangChay.get(khoa) ?? Promise.resolve();
  const sau = truoc.then(viec, viec);
  const dau = sau.catch(() => undefined);
  dangChay.set(khoa, dau);
  void dau.then(() => {
    if (dangChay.get(khoa) === dau) dangChay.delete(khoa);
  });
  return sau;
}
