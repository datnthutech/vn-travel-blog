// API công khai /api/cong-khai/ban-tin: đăng ký (xác nhận 2 bước), xác nhận, huỷ một chạm. Không cookie; luôn trả cùng nội dung dù email đã có hay chưa.
import { Router, type Request, type Response } from 'express';
import type { Config } from '../config';
import type { Db } from '../db/ket-noi';
import type { DichVuMail } from '../mail/dich-vu';
import { dangKy, huy, xacNhan } from '../ban-tin/kho';
import { chuoiBanTin, mauMailXacNhan, trangKetQua } from '../ban-tin/mau-mail';

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const NGON_NGU = /^[a-z]{2}(-[A-Za-z]{2,4})?$/;
const TOI_DA_MOI_IP = 5;
const CUA_SO_IP_MS = 60 * 60_000;

interface Deps { config: Config; db: Db; now: () => number; mail?: DichVuMail }

/** Chỉ lấy ĐƯỜNG DẪN của Referer (không bao giờ chuyển sang host khác) để tránh open redirect. */
function trangTruoc(req: Request): string {
  try {
    const p = new URL(String(req.get('referer') ?? '')).pathname;
    return /^\/(?!\/)[^\\\s]*$/.test(p) ? p : '/';
  } catch {
    return '/';
  }
}

export function banTinCongKhaiRouter(d: Deps): Router {
  const r = Router();
  const lanTheoIp = new Map<string, number[]>();
  const vuotGioiHan = (ip: string): boolean => {
    const bay = d.now() - CUA_SO_IP_MS;
    const ds = (lanTheoIp.get(ip) ?? []).filter((t) => t > bay);
    if (ds.length >= TOI_DA_MOI_IP) return (lanTheoIp.set(ip, ds), true);
    ds.push(d.now());
    lanTheoIp.set(ip, ds);
    if (lanTheoIp.size > 5000) for (const [k, v] of lanTheoIp) if (v.every((t) => t <= bay)) lanTheoIp.delete(k); // giữ bộ nhớ nhỏ
    return false;
  };

  const trang = (res: Response, status: number, html: string) =>
    void res
      .status(status)
      .set({ 'X-Robots-Tag': 'noindex', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'" })
      .type('html')
      .send(html);
  const docToken = (req: Request) => (typeof req.query.token === 'string' ? req.query.token : '');

  r.post('/ban-tin/dang-ky', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const b = (req.body ?? {}) as Record<string, unknown>;
    const laForm = !!req.is('application/x-www-form-urlencoded');
    const xong = () => (laForm ? res.redirect(303, `${trangTruoc(req)}?dang-ky=da-gui#ban-tin-da-gui`) : res.json({ ok: true }));
    if (typeof b.website === 'string' && b.website !== '') return void xong(); // ô bẫy: bot được "thành công" giả
    if (vuotGioiHan(req.ip ?? 'khong-ro')) return void res.status(429).json({ loi: 'Bạn đăng ký quá nhiều lần, hãy thử lại sau' });
    const email = typeof b.email === 'string' ? b.email.trim() : '';
    if (!EMAIL.test(email)) return void res.status(400).json({ loi: 'Email không hợp lệ' });
    const ngonNgu = typeof b.ngonNgu === 'string' && NGON_NGU.test(b.ngonNgu) ? b.ngonNgu : 'vi';
    const kq = dangKy(d.db, email, ngonNgu, d.now());
    if (kq.canGuiXacNhan && d.mail) {
      const link = `${d.config.publicBaseUrl}/api/cong-khai/ban-tin/xac-nhan?token=${kq.token}`;
      const m = mauMailXacNhan({ ngonNgu, link });
      d.mail.gui({ loai: 'quan-trong', den: email.toLowerCase(), tieuDe: m.tieuDe, html: m.html, text: m.text, nhayCam: true });
    }
    xong();
  });

  r.get('/ban-tin/xac-nhan', (req, res) => {
    const ok = xacNhan(d.db, docToken(req), d.now());
    const c = chuoiBanTin('vi');
    trang(res, ok ? 200 : 400, trangKetQua({ ngonNgu: 'vi', noiDung: ok ? c.trangDaXacNhan : c.trangHetHan }));
  });

  r.get('/ban-tin/huy', (req, res) => {
    const c = chuoiBanTin('vi');
    trang(res, 200, trangKetQua({ ngonNgu: 'vi', noiDung: c.trangHuyHoi, bieuMau: { hanhDong: `/api/cong-khai/ban-tin/huy?token=${encodeURIComponent(docToken(req))}`, nut: c.trangNutHuy } }));
  });

  r.post('/ban-tin/huy', (req, res) => {
    const c = chuoiBanTin('vi');
    const ok = huy(d.db, docToken(req), d.now());
    trang(res, ok ? 200 : 400, trangKetQua({ ngonNgu: 'vi', noiDung: ok ? c.trangDaHuy : c.trangLinkLoi }));
  });

  return r;
}
