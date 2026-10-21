// API xác thực 2 lớp (TOTP): bật, xác nhận, tắt, và hoàn tất đăng nhập bằng mã (hoặc mã dự phòng).
import { Router } from 'express';
import { giaiMa, maHoa } from '../bi-mat';
import { taoChongDo, tuanTu } from '../tai-khoan/chong-do';
import { kiemMatKhau } from '../tai-khoan/mat-khau';
import { docMatKhauBam } from '../tai-khoan/nguoi-dung';
import { xoaMoiPhien } from '../tai-khoan/phien';
import { ghiNhatKy } from '../tai-khoan/nhat-ky';
import { hoanTatTotp } from '../tai-khoan/phien';
import { bamMaDuPhong, buocTotpDung, giongMaDuPhong, taoBiMatTotp, taoMaDuPhong } from '../tai-khoan/totp';
import type { Db } from '../db/ket-noi';
import type { DepsXacThuc } from './xac-thuc';

const MA_SAI = 'Mã xác thực không đúng';

// Thử mã (TOTP hoặc dự phòng) cho một người dùng. TOTP không dùng lại được trong cùng/ trước bước đã dùng (chống phát lại).
export function thuMa(db: Db, khoaBiMat: string, nguoiId: number, ma: string, now: number): boolean {
  const u = db.prepare('SELECT totp_bi_mat, totp_buoc_cuoi FROM nguoi_dung WHERE id = ?').get(nguoiId) as { totp_bi_mat: string | null; totp_buoc_cuoi: number } | undefined;
  if (!u?.totp_bi_mat) return false;
  if (/^\d{6}$/.test(ma)) {
    const buoc = buocTotpDung(giaiMa(khoaBiMat, u.totp_bi_mat), ma, now);
    if (buoc === null || buoc <= u.totp_buoc_cuoi) return false;
    db.prepare('UPDATE nguoi_dung SET totp_buoc_cuoi = ? WHERE id = ?').run(buoc, nguoiId);
    return true;
  }
  if (!giongMaDuPhong(ma)) return false;
  return db.prepare('UPDATE ma_du_phong SET da_dung = 1 WHERE nguoi_dung_id = ? AND ma_bam = ? AND da_dung = 0').run(nguoiId, bamMaDuPhong(ma)).changes > 0;
}

export function haiLopRouter(d: DepsXacThuc): Router {
  const r = Router();
  const chongDo = taoChongDo(d.db, d.now);

  // Hoàn tất đăng nhập của phiên "chờ TOTP". Sai mã cũng tính vào chống dò như sai mật khẩu.
  r.post('/dang-nhap/totp', (req, res, next) => {
    tuanTu(req.ip ?? 'khong-ro', async () => xuLyTotp(req, res)).catch(next);
  });

  const xuLyTotp = (req: import('express').Request, res: import('express').Response): void => {
    const ma = String((req.body as { ma?: unknown } | undefined)?.ma ?? '').trim();
    const u = req.nguoiDung!;
    const ip = req.ip ?? 'khong-ro';
    if (!req.choTotp) {
      res.status(400).json({ loi: 'Phiên này không cần nhập mã' });
      return;
    }
    const kt = chongDo.kiemTra(ip, u.email);
    if (!kt.choPhep) {
      res.status(429).json({ loi: 'Nhập sai quá nhiều lần. Hãy thử lại sau.', conLaiGiay: kt.conLaiGiay });
      return;
    }
    if (!thuMa(d.db, d.config.khoaBiMat, u.id, ma, d.now())) {
      chongDo.ghiThatBai(ip, u.email);
      ghiNhatKy(d.db, { nguoiDungId: u.id, loai: 'dang-nhap-totp-that-bai', ip }, d.now);
      res.status(401).json({ loi: MA_SAI });
      return;
    }
    chongDo.ghiThanhCong(ip, u.email);
    hoanTatTotp(d.db, req.phienId!);
    ghiNhatKy(d.db, { nguoiDungId: u.id, loai: 'dang-nhap', ip, chiTiet: { totp: true } }, d.now);
    res.json({ ok: true });
  };

  r.post('/2fa/bat-dau', (req, res) => {
    const u = req.nguoiDung!;
    if (u.coTotp) {
      res.status(409).json({ loi: 'Đã bật xác thực 2 lớp' });
      return;
    }
    const { biMat, otpauthUrl } = taoBiMatTotp(u.email);
    d.db.prepare('UPDATE nguoi_dung SET totp_tam = ? WHERE id = ?').run(maHoa(d.config.khoaBiMat, biMat), u.id); // bí mật tạm, mã hoá
    res.json({ otpauthUrl });
  });

  r.post('/2fa/xac-nhan', async (req, res) => {
    const u = req.nguoiDung!;
    const ma = String((req.body as { ma?: unknown } | undefined)?.ma ?? '').trim();
    // Bật 2FA phải nhập lại mật khẩu: nếu không, kẻ chỉ có mật khẩu (hoặc phiên mượn) có thể chiếm yếu tố thứ hai.
    const mk = (req.body as { matKhau?: unknown } | undefined)?.matKhau;
    const chongDo = taoChongDo(d.db, d.now);
    const ip = req.ip ?? 'khong-ro';
    const kt = chongDo.kiemTra(ip, u.email);
    if (!kt.choPhep) {
      res.status(429).json({ loi: 'Nhập sai quá nhiều lần. Hãy thử lại sau.', conLaiGiay: kt.conLaiGiay });
      return;
    }
    if (typeof mk !== 'string' || !(await kiemMatKhau(docMatKhauBam(d.db, u.id)!, mk))) {
      chongDo.ghiThatBai(ip, u.email);
      res.status(400).json({ loi: 'Cần nhập đúng mật khẩu hiện tại để bật xác thực 2 lớp' });
      return;
    }
    const tam = (d.db.prepare('SELECT totp_tam FROM nguoi_dung WHERE id = ?').get(u.id) as { totp_tam: string | null }).totp_tam;
    if (!tam) {
      res.status(400).json({ loi: 'Chưa bắt đầu bật xác thực 2 lớp' });
      return;
    }
    const biMat = giaiMa(d.config.khoaBiMat, tam);
    const buoc = buocTotpDung(biMat, ma, d.now());
    if (buoc === null) {
      res.status(400).json({ loi: MA_SAI });
      return;
    }
    const maDuPhong = taoMaDuPhong();
    d.db.transaction(() => {
      d.db.prepare('UPDATE nguoi_dung SET totp_bi_mat = ?, totp_tam = NULL, totp_buoc_cuoi = ? WHERE id = ?').run(maHoa(d.config.khoaBiMat, biMat), buoc, u.id);
      d.db.prepare('DELETE FROM ma_du_phong WHERE nguoi_dung_id = ?').run(u.id);
      const them = d.db.prepare('INSERT INTO ma_du_phong (nguoi_dung_id, ma_bam, da_dung) VALUES (?,?,0)');
      for (const m of maDuPhong) them.run(u.id, bamMaDuPhong(m));
    })();
    xoaMoiPhien(d.db, u.id, req.phienId); // các thiết bị khác phải đăng nhập lại (giờ có yêu cầu mã)
    ghiNhatKy(d.db, { nguoiDungId: u.id, loai: 'bat-2fa', ip: req.ip }, d.now);
    res.json({ maDuPhong }); // chỉ hiện MỘT lần
  });

  r.post('/2fa/tat', async (req, res) => {
    const u = req.nguoiDung!;
    if (u.vaiTro === 'quan-tri') {
      res.status(403).json({ loi: 'Quản trị viên không được tắt xác thực 2 lớp' });
      return;
    }
    const { matKhau, ma } = (req.body ?? {}) as { matKhau?: unknown; ma?: unknown };
    if (typeof matKhau !== 'string' || typeof ma !== 'string' || !u.coTotp) {
      res.status(400).json({ loi: 'Cần nhập mật khẩu và mã xác thực' });
      return;
    }
    if (!(await kiemMatKhau(docMatKhauBam(d.db, u.id)!, matKhau)) || !thuMa(d.db, d.config.khoaBiMat, u.id, ma.trim(), d.now())) {
      res.status(400).json({ loi: 'Mật khẩu hoặc mã xác thực không đúng' });
      return;
    }
    d.db.transaction(() => {
      d.db.prepare('UPDATE nguoi_dung SET totp_bi_mat = NULL, totp_tam = NULL, totp_buoc_cuoi = 0 WHERE id = ?').run(u.id);
      d.db.prepare('DELETE FROM ma_du_phong WHERE nguoi_dung_id = ?').run(u.id);
    })();
    ghiNhatKy(d.db, { nguoiDungId: u.id, loai: 'tat-2fa', ip: req.ip }, d.now);
    res.json({ ok: true });
  });

  return r;
}
