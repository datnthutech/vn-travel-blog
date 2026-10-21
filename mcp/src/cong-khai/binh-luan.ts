// API công khai /api/cong-khai/binh-luan: người đọc bình luận bằng tên + email, HIỆN NGAY (trừ khi nghi spam). Không cookie, không trả email.
import { Router } from 'express';
import type { Config } from '../config';
import type { Db } from '../db/ket-noi';
import { bamGiaTri, daBiChan, lietKeHien, themBinhLuan } from '../binh-luan/kho';
import { kiemVeGui, phanLoai, taoSoDemVe, taoVeGui, TOI_DA_LAN_DUNG_VE, TOI_DA_MOI_IP, CUA_SO_IP_MS } from '../binh-luan/chong-spam';
import { docCaiDatSite } from '../noi-dung/cai-dat-site';
import { thongBaoBinhLuanMoi } from '../binh-luan/bao-mail';
import type { DichVuMail } from '../mail/dich-vu';

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

interface Deps { config: Config; db: Db; now: () => number; mail?: DichVuMail }

export function congKhaiRouter(d: Deps): Router {
  const r = Router();
  const demVe = taoSoDemVe();

  // Bài phải tồn tại, đã đăng, chưa vào thùng rác.
  const layBai = (baiId: number, ngonNgu: string) =>
    d.db
      .prepare("SELECT b.id FROM bai b JOIN ban_dich x ON x.bai_id = b.id WHERE b.id = ? AND x.ngon_ngu = ? AND x.trang_thai = 'da-dang' AND b.xoa_luc IS NULL")
      .get(baiId, ngonNgu) as { id: number } | undefined;

  r.get('/binh-luan', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const baiId = /^\d+$/.test(String(req.query.bai ?? '')) ? Number(req.query.bai) : NaN;
    const ngonNgu = String(req.query.ngonNgu ?? 'vi');
    if (Number.isNaN(baiId) || !layBai(baiId, ngonNgu)) return void res.status(404).json({ loi: 'Không tìm thấy bài' });
    if (!docCaiDatSite(d.db).binhLuan.bat) return void res.json({ tat: true });
    res.json({ binhLuan: lietKeHien(d.db, baiId, ngonNgu), veGui: taoVeGui(d.config.khoaBiMat, baiId, ngonNgu, d.now()) });
  });

  r.post('/binh-luan', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const b = (req.body ?? {}) as Record<string, unknown>;
    const baiId = Number.isInteger(b.bai) ? (b.bai as number) : NaN;
    const ngonNgu = typeof b.ngonNgu === 'string' ? b.ngonNgu : 'vi';
    if (Number.isNaN(baiId) || !layBai(baiId, ngonNgu)) return void res.status(404).json({ loi: 'Không tìm thấy bài' });
    const caiDat = docCaiDatSite(d.db).binhLuan;
    if (!caiDat.bat) return void res.status(403).json({ loi: 'Bình luận đang tắt' });

    // Ô bẫy: người thật không thấy ô này; bot điền → trả thành công GIẢ, không lưu gì.
    if (typeof b.website === 'string' && b.website !== '') return void res.status(201).json({ id: 0, trangThai: 'hien' });

    const ve = kiemVeGui(d.config.khoaBiMat, baiId, ngonNgu, b.veGui, d.now());
    if (ve !== 'ok') {
      return void res.status(400).json({ loi: ve === 'som' ? 'Bạn gửi quá nhanh, hãy thử lại sau vài giây' : ve === 'het-han' ? 'Trang đã mở quá lâu, hãy tải lại trang rồi gửi lại' : 'Yêu cầu không hợp lệ, hãy tải lại trang' });
    }

    if (demVe(String(b.veGui)) > TOI_DA_LAN_DUNG_VE) return void res.status(400).json({ loi: 'Trang đã mở quá lâu, hãy tải lại trang rồi gửi lại' });
    const ip = req.ip ?? 'khong-ro';
    const ipBam = bamGiaTri(d.config.khoaBiMat, 'ip', ip);
    const daGui = (d.db.prepare('SELECT count(*) AS n FROM binh_luan WHERE ip_bam = ? AND tao_luc > ?').get(ipBam, d.now() - CUA_SO_IP_MS) as { n: number }).n;
    if (daGui >= TOI_DA_MOI_IP) return void res.status(429).json({ loi: 'Bạn bình luận quá nhiều, hãy thử lại sau ít phút' });

    const ten = typeof b.ten === 'string' ? b.ten.trim() : '';
    const email = typeof b.email === 'string' ? b.email.trim() : '';
    const noiDung = typeof b.noiDung === 'string' ? b.noiDung.trim() : '';
    if (ten.length < 1 || ten.length > 60) return void res.status(400).json({ loi: 'Tên cần từ 1 đến 60 ký tự' });
    if (!EMAIL.test(email)) return void res.status(400).json({ loi: 'Email không hợp lệ' });
    if (noiDung.length < 2 || noiDung.length > 2000) return void res.status(400).json({ loi: 'Bình luận cần từ 2 đến 2000 ký tự' });
    if (b.chaId !== undefined && b.chaId !== null && !Number.isInteger(b.chaId)) return void res.status(400).json({ loi: 'chaId không hợp lệ' });

    // IP/email đã bị chặn: trả thành công GIẢ, không lưu (không cho kẻ xấu biết bị chặn).
    if (daBiChan(d.db, d.config.khoaBiMat, 'ip', ip) || daBiChan(d.db, d.config.khoaBiMat, 'email', email)) return void res.status(201).json({ id: 0, trangThai: 'hien' });

    const pl = phanLoai(noiDung, caiDat.tuCam);
    let kq;
    try {
      kq = themBinhLuan(d.db, { baiId, ngonNgu, chaId: (b.chaId as number | null | undefined) ?? null, ten, email, noiDung, ipBam, trangThai: pl.trangThai, lyDoChoXem: pl.lyDo }, d.now);
    } catch {
      return void res.status(400).json({ loi: 'Không trả lời được bình luận này' });
    }
    if (d.mail) thongBaoBinhLuanMoi(d.db, d.mail, { baiId, binhLuanId: kq.id, nguoiTraLoiId: null, ten, noiDung, trangThai: pl.trangThai, publicBaseUrl: d.config.publicBaseUrl });
    res.status(201).json({ id: kq.id, trangThai: kq.trangThai });
  });

  return r;
}
