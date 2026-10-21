// API bản dịch bài viết: /bai/:id/ban-dich/:ngonNgu — cùng luật quyền với bài (người viết chỉ sửa/đăng bài của mình), riêng "đã kiểm tra" mở cho mọi vai trò.
// Đăng bản dịch cần bản tiếng Việt đang `da-dang`; mọi bản dịch của một bài biến khỏi production khi bài vi bị gỡ/vào thùng rác (xử lý ở xuatNoiDung).
import { urlBai } from '@vntraveltips/schema';
import { Router, type Request, type Response } from 'express';
import type { HangDoiBuild } from '../build/hang-doi';
import type { Config } from '../config';
import type { Db } from '../db/ket-noi';
import { gioVN } from '../mail/ngay-vn';
import { docBai, XungDotPhienBan } from '../noi-dung/bai';
import {
  cuHonBanGoc, datTrangThaiBanDich, docBanDich, ghepDayDu, luuBanDich, truongChuBanGoc, banGocVi, type BanDichDoc,
} from '../noi-dung/ban-dich';
import { epochSangGioVN, gioVNSangEpoch } from '../noi-dung/hen-gio';
import { kiemTraDayDu } from '../noi-dung/kiem-tra';
import { lietKeNgonNgu } from '../noi-dung/ngon-ngu';
import { ghiNhatKy } from '../tai-khoan/nhat-ky';
import { yeuCauQuyen } from '../tai-khoan/quyen';
import { idTuUrl, tenNguoi } from './bai';

const MUOI_PHUT = 10 * 60_000;
const tra = (res: Response, status: number, body: object): null => {
  res.status(status).json(body);
  return null;
};

export function banDichRouter(d: { config: Config; db: Db; now: () => number; hangDoi: HangDoiBuild }): Router {
  const r = Router();
  const chuBai = (req: Request) => {
    const x = d.db.prepare('SELECT tac_gia_id FROM bai WHERE id = ?').get(idTuUrl(String(req.params.id))) as { tac_gia_id: number | null } | undefined;
    return x ? { tacGiaId: x.tac_gia_id } : ('khong-ton-tai' as const);
  };
  /** :id phải là bài có thật và :ngonNgu phải là ngôn ngữ đã tạo (khác vi). Trả null (đã trả 404) nếu không. */
  const lay = (req: Request, res: Response): { baiId: number; ma: string } | null => {
    const baiId = idTuUrl(String(req.params.id));
    const ma = String(req.params.ngonNgu);
    if (Number.isNaN(baiId) || !docBai(d.db, baiId)) return tra(res, 404, { loi: 'Không tìm thấy bài viết' });
    if (ma === 'vi' || !lietKeNgonNgu(d.db).some((n) => n.ma === ma)) return tra(res, 404, { loi: 'Không có ngôn ngữ này' });
    return { baiId, ma };
  };
  const ghi = (req: Request, loai: string, baiId: number, ma: string, chiTiet: object = {}) =>
    ghiNhatKy(d.db, { nguoiDungId: req.nguoiDung!.id, loai, ip: req.ip, chiTiet: { baiId, ngonNgu: ma, ...chiTiet } }, d.now);
  const traXungDot = (res: Response, e: XungDotPhienBan) =>
    void res.status(409).json({ loi: `Bản dịch đã được ${e.nguoiSua ?? 'một người khác'} sửa lúc ${gioVN(e.luc)}. Tải lại để xem bản mới.`, nguoiSua: e.nguoiSua, luc: e.luc });
  const doc = (baiId: number, ma: string) => docBanDich(d.db, baiId, ma);

  const lanBody = (req: Request, res: Response): { dich: unknown; noiDung: string; phienSo?: number } | null => {
    const b = req.body as { dich?: unknown; phienSo?: unknown } | undefined;
    const dich = b?.dich as Record<string, unknown> | undefined;
    if (!dich || typeof dich !== 'object' || typeof dich.noiDung !== 'string' || dich.noiDung.length > 500_000) {
      return tra(res, 400, { loi: 'Cần gửi dich (đối tượng có noiDung là chuỗi)' });
    }
    if (b!.phienSo !== undefined && !Number.isInteger(b!.phienSo)) return tra(res, 400, { loi: 'phienSo phải là số nguyên' });
    return { dich, noiDung: dich.noiDung, phienSo: b!.phienSo as number | undefined };
  };

  /** Kiểm tra đầy đủ bản dịch đã ghép (schema + ảnh + slug trong ngôn ngữ này). Trả danh sách lỗi (rỗng = đạt). */
  const loiDayDu = (ban: BanDichDoc): string[] => {
    try {
      const g = ghepDayDu(d.db, ban);
      const kt = kiemTraDayDu(d.db, d.config.anhDir, g.bai, g.noiDung, ban.dich.slug, ban.ngonNgu);
      return kt.dat ? [] : kt.loi;
    } catch (e) {
      return [(e as Error).message];
    }
  };
  const loiDayDuTuBody = (baiId: number, ma: string, dich: Record<string, unknown>, noiDung: string): string[] => {
    const tam = { baiId, ngonNgu: ma, dich, noiDung } as unknown as BanDichDoc;
    return loiDayDu(tam);
  };

  r.get('/bai/:id/ban-dich/:ngonNgu', yeuCauQuyen('bai.xem'), (req, res) => {
    const k = lay(req, res);
    if (!k) return;
    const goc = banGocVi(d.db, k.baiId);
    const ban = doc(k.baiId, k.ma);
    res.json({
      ngonNgu: k.ma,
      banGoc: truongChuBanGoc(d.db, k.baiId),
      banGocDuDieuKien: goc !== null,
      trangThai: ban ? ban.trangThai : 'chua-dich',
      dich: ban ? { ...ban.dich, noiDung: ban.noiDung } : null,
      ...(ban?.henGio ? { henGio: ban.henGio } : {}),
      phienSo: ban?.phienSo ?? 0,
      cuHonBanGoc: ban ? cuHonBanGoc(d.db, ban) : false,
      daKiemTra: ban?.daKiemTra ?? false,
      ghiChuKiemTra: ban?.ghiChuKiemTra ?? null,
      nguoiKiemTra: tenNguoi(d.db, ban?.nguoiKiemTraId ?? null),
      kiemTraLuc: ban?.kiemTraLuc ?? null,
      suaLuc: ban?.suaLuc ?? null,
      nguoiSuaCuoi: ban ? tenNguoi(d.db, ban.nguoiSuaCuoiId) : null,
      banVi: { trangThai: docBai(d.db, k.baiId)!.trangThai, thungRac: docBai(d.db, k.baiId)!.xoaLuc !== null },
      ...(ban?.nhapTuLuu ? { banNhapTuLuu: ban.nhapTuLuu } : {}),
    });
  });

  r.put('/bai/:id/ban-dich/:ngonNgu', yeuCauQuyen('bai.sua', chuBai), (req, res) => {
    const k = lay(req, res);
    const g = k && lanBody(req, res);
    if (!k || !g) return;
    const hien = doc(k.baiId, k.ma);
    const trangThai = hien?.trangThai ?? 'nhap';
    // Bản dịch đang đăng/hẹn giờ vẫn phải đạt đủ luật khi lưu (không để bản dịch hỏng lọt ra site).
    if (trangThai !== 'nhap') {
      const loi = loiDayDuTuBody(k.baiId, k.ma, g.dich as Record<string, unknown>, g.noiDung);
      if (loi.length) return void res.status(400).json({ loi: 'Bản dịch chưa đạt kiểm tra', chiTiet: loi });
    }
    try {
      const { phienSo } = luuBanDich(d.db, { baiId: k.baiId, ngonNgu: k.ma, dich: g.dich, noiDung: g.noiDung, trangThai, henGio: hien?.henGio ?? undefined, nguoiId: req.nguoiDung!.id, phienSo: g.phienSo }, d.now);
      d.hangDoi.yeuCau();
      ghi(req, 'luu-ban-dich', k.baiId, k.ma);
      res.json({ phienSo });
    } catch (e) {
      if (e instanceof XungDotPhienBan) return void traXungDot(res, e);
      const unique = /UNIQUE/.test((e as Error).message);
      res.status(unique ? 409 : 400).json({ loi: unique ? 'Slug này đã có bản dịch khác dùng trong ngôn ngữ này' : (e as Error).message });
    }
  });

  // Xem trước (Review): lưu như PUT rồi trả URL trang xem trước /<mã>/… + bộ đếm nội dung để trang quản trị chờ build xong rồi mở.
  r.post('/bai/:id/ban-dich/:ngonNgu/xem-truoc', yeuCauQuyen('bai.sua', chuBai), (req, res) => {
    const k = lay(req, res);
    const g = k && lanBody(req, res);
    if (!k || !g) return;
    const hien = doc(k.baiId, k.ma);
    const trangThai = hien?.trangThai ?? 'nhap';
    if (trangThai !== 'nhap') {
      const loi = loiDayDuTuBody(k.baiId, k.ma, g.dich as Record<string, unknown>, g.noiDung);
      if (loi.length) return void res.status(400).json({ loi: 'Bản dịch chưa đạt kiểm tra', chiTiet: loi });
    }
    let phienSo: number;
    try {
      ({ phienSo } = luuBanDich(d.db, { baiId: k.baiId, ngonNgu: k.ma, dich: g.dich, noiDung: g.noiDung, trangThai, henGio: hien?.henGio ?? undefined, nguoiId: req.nguoiDung!.id, phienSo: g.phienSo }, d.now));
    } catch (e) {
      if (e instanceof XungDotPhienBan) return void traXungDot(res, e);
      const unique = /UNIQUE/.test((e as Error).message);
      return void res.status(unique ? 409 : 400).json({ loi: unique ? 'Slug này đã có bản dịch khác dùng trong ngôn ngữ này' : (e as Error).message });
    }
    d.hangDoi.yeuCau();
    const luu = doc(k.baiId, k.ma)!;
    const loi = loiDayDu(luu); // bản nháp còn thiếu/lệch cấu trúc thì không dựng được trang: báo rõ để không chờ vô ích
    let url = '';
    if (loi.length === 0) {
      const tinh = ghepDayDu(d.db, luu).bai.tinh;
      url = `${d.config.previewBaseUrl}/${k.ma}${urlBai({ slug: luu.dich.slug, tinh })}`;
    }
    res.json({
      url,
      noiDungPhien: Number((d.db.prepare("SELECT gia_tri FROM he_thong WHERE khoa = 'noi_dung_phien'").get() as { gia_tri: string }).gia_tri),
      phienSo,
      hopLe: loi.length === 0,
      ...(loi.length ? { loi } : {}),
    });
  });

  r.patch('/bai/:id/ban-dich/:ngonNgu/tu-luu', yeuCauQuyen('bai.sua', chuBai), (req, res) => {
    const k = lay(req, res);
    const g = k && lanBody(req, res);
    const ban = k && doc(k.baiId, k.ma);
    if (!k || !g) return;
    if (!ban) return void res.status(409).json({ loi: 'Hãy lưu bản dịch một lần trước khi tự lưu' });
    if (g.phienSo !== undefined && g.phienSo !== ban.phienSo) return void traXungDot(res, new XungDotPhienBan(tenNguoi(d.db, ban.nguoiSuaCuoiId)?.ten ?? null, ban.suaLuc));
    const t = d.now();
    d.db.transaction(() => {
      d.db.prepare('UPDATE ban_dich SET nhap_tu_luu = ? WHERE bai_id = ? AND ngon_ngu = ?').run(JSON.stringify({ dich: g.dich, noiDung: g.noiDung, luc: t }), k.baiId, k.ma);
      const cuoi = (d.db.prepare('SELECT phien_ban_cuoi_luc AS l FROM ban_dich WHERE bai_id = ? AND ngon_ngu = ?').get(k.baiId, k.ma) as { l: number | null }).l ?? 0;
      if (t - cuoi >= MUOI_PHUT) {
        const { noiDung: _n, ...du } = g.dich as Record<string, unknown>;
        d.db.prepare('INSERT INTO phien_ban (bai_id, ngon_ngu, nguoi_dung_id, luc, du_lieu, noi_dung) VALUES (?,?,?,?,?,?)').run(k.baiId, k.ma, req.nguoiDung!.id, t, JSON.stringify(du), g.noiDung);
        d.db.prepare('UPDATE ban_dich SET phien_ban_cuoi_luc = ? WHERE bai_id = ? AND ngon_ngu = ?').run(t, k.baiId, k.ma);
      }
    })();
    res.json({ ok: true, luc: t });
  });

  /** Chung cho đăng / hẹn giờ: bản dịch phải có; bài vi phải `da-dang` và không ở thùng rác; bản ghép phải đạt đủ luật. */
  const canDangDuoc = (baiId: number, ma: string, res: Response): BanDichDoc | null => {
    const ban = doc(baiId, ma);
    if (!ban) return tra(res, 409, { loi: 'Chưa có bản dịch để đăng' });
    const vi = docBai(d.db, baiId)!;
    if (vi.xoaLuc !== null) return tra(res, 409, { loi: 'Bài tiếng Việt đang trong thùng rác' });
    if (vi.trangThai !== 'da-dang') return tra(res, 409, { loi: 'Phải đăng bản tiếng Việt trước khi đăng bản dịch' });
    const loi = loiDayDu(ban);
    if (loi.length) return tra(res, 400, { loi: 'Bản dịch chưa đạt kiểm tra', chiTiet: loi });
    return ban;
  };

  r.post('/bai/:id/ban-dich/:ngonNgu/dang', yeuCauQuyen('bai.dang', chuBai), (req, res) => {
    const k = lay(req, res);
    const ban = k && canDangDuoc(k.baiId, k.ma, res);
    if (!k || !ban) return;
    datTrangThaiBanDich(d.db, k.baiId, k.ma, 'da-dang', null, req.nguoiDung!.id, d.now);
    ghi(req, 'dang-ban-dich', k.baiId, k.ma);
    d.hangDoi.yeuCau();
    res.json({ ok: true });
  });

  r.post('/bai/:id/ban-dich/:ngonNgu/go', yeuCauQuyen('bai.dang', chuBai), (req, res) => {
    const k = lay(req, res);
    const ban = k && doc(k.baiId, k.ma);
    if (!k) return;
    if (!ban) return void res.status(404).json({ loi: 'Chưa có bản dịch' });
    if (ban.trangThai === 'nhap') return void res.status(409).json({ loi: 'Bản dịch đang là bản nháp, không cần gỡ' });
    datTrangThaiBanDich(d.db, k.baiId, k.ma, 'nhap', null, null, d.now);
    ghi(req, 'go-ban-dich', k.baiId, k.ma);
    d.hangDoi.yeuCau();
    res.json({ ok: true });
  });

  r.post('/bai/:id/ban-dich/:ngonNgu/hen-gio', yeuCauQuyen('bai.dang', chuBai), (req, res) => {
    const k = lay(req, res);
    if (!k) return;
    let luc: number;
    try {
      luc = gioVNSangEpoch(String((req.body as { luc?: unknown } | undefined)?.luc ?? ''));
    } catch (e) {
      return void res.status(400).json({ loi: (e as Error).message });
    }
    if (luc <= d.now()) return void res.status(400).json({ loi: 'Giờ hẹn phải ở tương lai (giờ Việt Nam)' });
    const ban = doc(k.baiId, k.ma);
    if (ban?.trangThai === 'da-dang') return void res.status(409).json({ loi: 'Bản dịch đã đăng. Hãy gỡ trước nếu muốn hẹn giờ đăng lại' });
    // Hẹn giờ: bản dịch phải đạt luật như khi đăng (bài vi có thể còn đang hẹn giờ — lúc tới hạn chỉ đăng khi bài vi đã đăng).
    if (!ban) return void res.status(409).json({ loi: 'Chưa có bản dịch để hẹn giờ' });
    const loi = loiDayDu(ban);
    if (loi.length) return void res.status(400).json({ loi: 'Bản dịch chưa đạt kiểm tra', chiTiet: loi });
    datTrangThaiBanDich(d.db, k.baiId, k.ma, 'hen-gio', luc, req.nguoiDung!.id, d.now);
    ghi(req, 'hen-gio-ban-dich', k.baiId, k.ma, { luc: epochSangGioVN(luc) });
    d.hangDoi.yeuCau();
    res.json({ ok: true, henGio: luc, gioVN: epochSangGioVN(luc) });
  });

  r.post('/bai/:id/ban-dich/:ngonNgu/huy-hen-gio', yeuCauQuyen('bai.dang', chuBai), (req, res) => {
    const k = lay(req, res);
    const ban = k && doc(k.baiId, k.ma);
    if (!k) return;
    if (ban?.trangThai !== 'hen-gio') return void res.status(409).json({ loi: 'Bản dịch không có hẹn giờ' });
    datTrangThaiBanDich(d.db, k.baiId, k.ma, 'nhap', null, null, d.now);
    ghi(req, 'huy-hen-gio-ban-dich', k.baiId, k.ma);
    d.hangDoi.yeuCau();
    res.json({ ok: true });
  });

  // "Bản dịch đã kiểm tra": ai cũng đánh dấu được, trên mọi bài (người dịch/người đọc lại không nhất thiết là tác giả bài).
  r.post('/bai/:id/ban-dich/:ngonNgu/kiem-tra', yeuCauQuyen('ban-dich.kiem-tra'), (req, res) => {
    const k = lay(req, res);
    const ban = k && doc(k.baiId, k.ma);
    if (!k) return;
    if (!ban) return void res.status(404).json({ loi: 'Chưa có bản dịch' });
    const b = (req.body ?? {}) as { daKiemTra?: unknown; ghiChu?: unknown };
    if (typeof b.daKiemTra !== 'boolean') return void res.status(400).json({ loi: 'daKiemTra phải là true/false' });
    const ghiChu = typeof b.ghiChu === 'string' ? b.ghiChu.trim().slice(0, 1000) : '';
    if (b.ghiChu !== undefined && typeof b.ghiChu !== 'string') return void res.status(400).json({ loi: 'ghiChu phải là chuỗi' });
    d.db
      .prepare('UPDATE ban_dich SET da_kiem_tra = ?, ghi_chu_kiem_tra = ?, nguoi_kiem_tra_id = ?, kiem_tra_luc = ? WHERE bai_id = ? AND ngon_ngu = ?')
      .run(b.daKiemTra ? 1 : 0, b.daKiemTra ? ghiChu || null : null, b.daKiemTra ? req.nguoiDung!.id : null, b.daKiemTra ? d.now() : null, k.baiId, k.ma);
    ghi(req, 'kiem-tra-ban-dich', k.baiId, k.ma, { daKiemTra: b.daKiemTra });
    res.json({ ok: true });
  });

  r.get('/bai/:id/ban-dich/:ngonNgu/phien-ban', yeuCauQuyen('bai.xem'), (req, res) => {
    const k = lay(req, res);
    if (!k) return;
    const ds = d.db.prepare('SELECT id, luc, nguoi_dung_id FROM phien_ban WHERE bai_id = ? AND ngon_ngu = ? ORDER BY luc DESC, id DESC').all(k.baiId, k.ma) as { id: number; luc: number; nguoi_dung_id: number | null }[];
    res.json(ds.map((p) => ({ id: p.id, luc: p.luc, nguoiSua: tenNguoi(d.db, p.nguoi_dung_id) })));
  });

  r.get('/bai/:id/ban-dich/:ngonNgu/phien-ban/:pid', yeuCauQuyen('bai.xem'), (req, res) => {
    const k = lay(req, res);
    if (!k) return;
    const pid = idTuUrl(String(req.params.pid));
    const pb = Number.isNaN(pid) ? undefined : (d.db.prepare('SELECT du_lieu, noi_dung FROM phien_ban WHERE id = ? AND bai_id = ? AND ngon_ngu = ?').get(pid, k.baiId, k.ma) as { du_lieu: string; noi_dung: string } | undefined);
    if (!pb) return void res.status(404).json({ loi: 'Không tìm thấy phiên bản này' });
    res.json({ dich: { ...JSON.parse(pb.du_lieu), noiDung: pb.noi_dung } });
  });

  return r;
}
