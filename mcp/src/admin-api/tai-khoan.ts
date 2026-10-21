// Mời người dùng qua email và quản lý tài khoản. Lời mời: token 32 byte (DB chỉ lưu băm), sống 48 giờ, dùng một lần,
// tối đa 5 lời mời/giờ/người mời. Người nhận lời mời tự đặt tên + mật khẩu (≥ 12 ký tự), tài khoản `quan-tri` bị bắt bật 2FA ngay.
import { randomBytes } from 'node:crypto';
import { CAC_VAI_TRO, coQuyen, type VaiTro } from '@vntraveltips/schema';
import { Router } from 'express';
import type { Config } from '../config';
import type { Db } from '../db/ket-noi';
import type { DichVuMail } from '../mail/dich-vu';
import { matKhauHopLe } from '../tai-khoan/mat-khau';
import { demQuanTriHoatDong, taoNguoiDung, timTheoEmail, timTheoId } from '../tai-khoan/nguoi-dung';
import { ghiNhatKy } from '../tai-khoan/nhat-ky';
import { bamToken, taoPhien, xoaMoiPhien } from '../tai-khoan/phien';
import { yeuCauQuyen } from '../tai-khoan/quyen';
import { datCookiePhien } from './xac-thuc';

const GIO = 3600_000;
export const HAN_LOI_MOI = 48 * GIO;
const TOI_DA_MOI_GIO = 5;
const TEN_VAI_TRO: Record<VaiTro, string> = { 'quan-tri': 'Quản trị', 'quan-ly': 'Quản lý', writer: 'Người viết (writer)' };
const escHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

interface Deps { config: Config; db: Db; mail: DichVuMail; now: () => number }

interface LoiMoi { email: string; vai_tro: VaiTro; het_han_luc: number; da_dung: number; nguoi_moi_id: number }
/** Lời mời còn dùng được: chưa dùng, chưa hết hạn VÀ người mời còn hoạt động với quyền mời (bị khoá/hạ vai trò thì lời mời chưa dùng của họ vô hiệu). */
function docLoiMoi(db: Db, token: string, now: number): LoiMoi | null {
  const r = db.prepare('SELECT email, vai_tro, het_han_luc, da_dung, nguoi_moi_id FROM loi_moi WHERE token_bam = ?').get(bamToken(token)) as LoiMoi | undefined;
  if (!r || r.da_dung !== 0 || r.het_han_luc < now) return null;
  const nguoiMoi = timTheoId(db, r.nguoi_moi_id);
  return nguoiMoi && !nguoiMoi.biKhoa && coQuyen(nguoiMoi, 'tai-khoan.quan-ly') ? r : null;
}

/** Route công khai (chưa đăng nhập): xem và nhận lời mời. */
export function loiMoiCongKhaiRouter(d: Deps): Router {
  const r = Router();

  r.get('/loi-moi/:token', (req, res) => {
    const m = docLoiMoi(d.db, String(req.params.token), d.now());
    if (!m || timTheoEmail(d.db, m.email)) return void res.status(410).json({ loi: 'Lời mời không hợp lệ hoặc đã hết hạn' });
    res.json({ email: m.email, vaiTro: m.vai_tro });
  });

  r.post('/loi-moi/:token/nhan', async (req, res) => {
    const token = String(req.params.token);
    const m = docLoiMoi(d.db, token, d.now());
    if (!m || timTheoEmail(d.db, m.email)) return void res.status(410).json({ loi: 'Lời mời không hợp lệ hoặc đã hết hạn' });
    const { ten, matKhau } = (req.body ?? {}) as { ten?: unknown; matKhau?: unknown };
    if (typeof ten !== 'string' || !ten.trim() || ten.trim().length > 80) return void res.status(400).json({ loi: 'Cần nhập tên (tối đa 80 ký tự)' });
    if (typeof matKhau !== 'string') return void res.status(400).json({ loi: 'Cần nhập mật khẩu' });
    const loi = matKhauHopLe(matKhau);
    if (loi) return void res.status(400).json({ loi });
    // Đánh dấu đã dùng TRƯỚC khi tạo (hai request song song cùng nhận → chỉ một cái thắng).
    if (d.db.prepare('UPDATE loi_moi SET da_dung = 1 WHERE token_bam = ? AND da_dung = 0').run(bamToken(token)).changes === 0) {
      return void res.status(410).json({ loi: 'Lời mời không hợp lệ hoặc đã hết hạn' });
    }
    let u;
    try {
      u = await taoNguoiDung(d.db, { email: m.email, ten, vaiTro: m.vai_tro, matKhau }, d.now);
    } catch (e) {
      d.db.prepare('UPDATE loi_moi SET da_dung = 0 WHERE token_bam = ?').run(bamToken(token)); // tạo thất bại: trả lại lời mời để thử lại
      throw e;
    }
    const tokenPhien = taoPhien(d.db, u.id, { ghiNho: false, ip: req.ip, thietBi: req.get('user-agent') ?? '' }, d.now);
    datCookiePhien(res, d.config, tokenPhien, false);
    ghiNhatKy(d.db, { nguoiDungId: u.id, loai: 'nhan-loi-moi', ip: req.ip, chiTiet: { vaiTro: u.vaiTro } }, d.now);
    res.json({ ok: true, nguoiDung: u, canBatTotp: u.vaiTro === 'quan-tri' });
  });

  return r;
}

/** Route quản lý tài khoản (cần quyền `tai-khoan.quan-ly`). */
export function taiKhoanRouter(d: Deps): Router {
  const r = Router();

  r.post('/tai-khoan/moi', yeuCauQuyen('tai-khoan.quan-ly'), (req, res) => {
    const { email, vaiTro } = (req.body ?? {}) as { email?: unknown; vaiTro?: unknown };
    const den = typeof email === 'string' ? email.trim() : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(den)) return void res.status(400).json({ loi: 'Email không hợp lệ' });
    if (typeof vaiTro !== 'string' || !CAC_VAI_TRO.includes(vaiTro as VaiTro)) return void res.status(400).json({ loi: 'Vai trò phải là quan-tri, quan-ly hoặc writer' });
    const nguoiMoi = req.nguoiDung!;
    const dem = (d.db.prepare('SELECT count(*) AS n FROM loi_moi WHERE nguoi_moi_id = ? AND tao_luc > ?').get(nguoiMoi.id, d.now() - GIO) as { n: number }).n;
    if (dem >= TOI_DA_MOI_GIO) return void res.status(429).json({ loi: `Mỗi giờ chỉ mời được tối đa ${TOI_DA_MOI_GIO} người. Hãy thử lại sau.` });
    if (timTheoEmail(d.db, den)) return void res.status(409).json({ loi: 'Email này đã có tài khoản' });
    const token = randomBytes(32).toString('base64url');
    d.db.transaction(() => {
      d.db.prepare('UPDATE loi_moi SET da_dung = 1 WHERE email = ? COLLATE NOCASE AND da_dung = 0').run(den); // mời lại → lời mời cũ vô hiệu
      d.db.prepare('INSERT INTO loi_moi (token_bam, email, vai_tro, het_han_luc, nguoi_moi_id, tao_luc) VALUES (?,?,?,?,?,?)').run(bamToken(token), den, vaiTro, d.now() + HAN_LOI_MOI, nguoiMoi.id, d.now());
    })();
    const link = `${d.config.publicBaseUrl}/quan-tri/nhan-loi-moi?token=${token}`;
    d.mail.gui({
      loai: 'quan-trong',
      nhayCam: true,
      den,
      tieuDe: 'Lời mời tham gia quản trị VNTravelTips',
      text: `${nguoiMoi.ten} mời bạn tham gia trang quản trị VNTravelTips với vai trò ${TEN_VAI_TRO[vaiTro as VaiTro]}.\n\nMở liên kết sau để đặt tên và mật khẩu (hiệu lực 48 giờ, dùng một lần):\n${link}`,
      html: `<p>${escHtml(nguoiMoi.ten)} mời bạn tham gia trang quản trị VNTravelTips với vai trò <strong>${TEN_VAI_TRO[vaiTro as VaiTro]}</strong>.</p><p><a href="${link}">Nhận lời mời</a> (hiệu lực 48 giờ, dùng một lần).</p>`,
    });
    ghiNhatKy(d.db, { nguoiDungId: nguoiMoi.id, loai: 'moi', ip: req.ip, chiTiet: { email: den, vaiTro } }, d.now);
    res.status(201).json({ ok: true });
  });


  // ---- Danh sách, đổi vai trò / khoá, đặt lại 2FA ----
  r.get('/tai-khoan', yeuCauQuyen('tai-khoan.quan-ly'), (_req, res) => {
    const ds = d.db
      .prepare(
        `SELECT u.id, u.email, u.ten, u.vai_tro, u.bi_khoa, u.totp_bi_mat IS NOT NULL AS co_totp,
                (SELECT max(luc) FROM nhat_ky WHERE nguoi_dung_id = u.id AND loai = 'dang-nhap') AS dang_nhap_cuoi
         FROM nguoi_dung u ORDER BY u.id`,
      )
      .all() as { id: number; email: string; ten: string; vai_tro: VaiTro; bi_khoa: number; co_totp: number; dang_nhap_cuoi: number | null }[];
    res.json(ds.map((u) => ({ id: u.id, email: u.email, ten: u.ten, vaiTro: u.vai_tro, biKhoa: u.bi_khoa === 1, coTotp: u.co_totp === 1, dangNhapCuoiLuc: u.dang_nhap_cuoi })));
  });

  // Không xoá cứng tài khoản (giữ tác giả bài/lịch sử): chỉ khoá. Luôn phải còn ≥ 1 quản trị đang hoạt động.
  r.put('/tai-khoan/:id', yeuCauQuyen('tai-khoan.quan-ly'), (req, res) => {
    const id = /^\d+$/.test(String(req.params.id)) ? Number(req.params.id) : NaN;
    const dich = Number.isNaN(id) ? null : timTheoId(d.db, id);
    if (!dich) return void res.status(404).json({ loi: 'Không tìm thấy tài khoản' });
    const { vaiTro, biKhoa } = (req.body ?? {}) as { vaiTro?: unknown; biKhoa?: unknown };
    if (vaiTro !== undefined && (typeof vaiTro !== 'string' || !CAC_VAI_TRO.includes(vaiTro as VaiTro))) return void res.status(400).json({ loi: 'Vai trò phải là quan-tri, quan-ly hoặc writer' });
    if (biKhoa !== undefined && typeof biKhoa !== 'boolean') return void res.status(400).json({ loi: 'biKhoa phải là true/false' });
    if (vaiTro === undefined && biKhoa === undefined) return void res.status(400).json({ loi: 'Cần gửi vaiTro và/hoặc biKhoa' });
    const moiVaiTro = (vaiTro as VaiTro | undefined) ?? dich.vaiTro;
    const moiKhoa = (biKhoa as boolean | undefined) ?? dich.biKhoa;
    const conHoatDong = dich.vaiTro === 'quan-tri' && !dich.biKhoa;
    const seConHoatDong = moiVaiTro === 'quan-tri' && !moiKhoa;
    if (conHoatDong && !seConHoatDong && demQuanTriHoatDong(d.db) <= 1) {
      return void res.status(409).json({ loi: 'Phải còn ít nhất một quản trị đang hoạt động. Hãy thêm/mở khoá một quản trị khác trước.' });
    }
    d.db.transaction(() => {
      d.db.prepare('UPDATE nguoi_dung SET vai_tro = ?, bi_khoa = ? WHERE id = ?').run(moiVaiTro, moiKhoa ? 1 : 0, id);
      if (moiKhoa && !dich.biKhoa) {
        xoaMoiPhien(d.db, id); // khoá → đăng xuất mọi thiết bị ngay
        d.db.prepare('DELETE FROM oauth_token WHERE nguoi_dung_id = ?').run(id); // và thu hồi token MCP của Claude
      }
      if (moiVaiTro !== dich.vaiTro) ghiNhatKy(d.db, { nguoiDungId: req.nguoiDung!.id, loai: 'doi-vai-tro', ip: req.ip, chiTiet: { doi: id, tu: dich.vaiTro, sang: moiVaiTro } }, d.now);
      if (moiKhoa !== dich.biKhoa) ghiNhatKy(d.db, { nguoiDungId: req.nguoiDung!.id, loai: moiKhoa ? 'khoa' : 'mo-khoa', ip: req.ip, chiTiet: { doi: id } }, d.now);
    })();
    res.json(timTheoId(d.db, id));
  });

  // Mất điện thoại: quản trị đặt lại 2FA cho NGƯỜI KHÁC; người đó phải bật lại ở lần đăng nhập sau (quản trị thì bị ép bật).
  r.post('/tai-khoan/:id/dat-lai-2fa', yeuCauQuyen('tai-khoan.quan-ly'), (req, res) => {
    const id = /^\d+$/.test(String(req.params.id)) ? Number(req.params.id) : NaN;
    const dich = Number.isNaN(id) ? null : timTheoId(d.db, id);
    if (!dich) return void res.status(404).json({ loi: 'Không tìm thấy tài khoản' });
    if (id === req.nguoiDung!.id) return void res.status(400).json({ loi: 'Không tự đặt lại 2FA của chính mình (nhờ một quản trị khác)' });
    d.db.transaction(() => {
      d.db.prepare('UPDATE nguoi_dung SET totp_bi_mat = NULL, totp_tam = NULL, totp_buoc_cuoi = 0 WHERE id = ?').run(id);
      d.db.prepare('DELETE FROM ma_du_phong WHERE nguoi_dung_id = ?').run(id);
      xoaMoiPhien(d.db, id);
      ghiNhatKy(d.db, { nguoiDungId: req.nguoiDung!.id, loai: 'dat-lai-2fa', ip: req.ip, chiTiet: { doi: id } }, d.now);
    })();
    res.json({ ok: true });
  });

  return r;
}
