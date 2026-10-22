// GET/PUT /dich/:loai/:khoa/:ngonNgu — bản dịch chuyên mục, tỉnh, trang, menu (cau-truc.sua), cài đặt site và chuỗi giao diện (cai-dat.sua).
// "Dịch bằng AI" cho các loại này dùng POST /dich-ai/chuoi (chỉ điền form, không lưu).
import { Router, type Request } from 'express';
import type { HangDoiBuild } from '../build/hang-doi';
import type { Db } from '../db/ket-noi';
import { coQuyen } from '@vntraveltips/schema';
import { banGocDich, docDich, LOAI_CAI_DAT, LOAI_DICH, luuDich, type LoaiDich } from '../noi-dung/dich-cau-truc';
import { maNgonNguDaCo } from '../noi-dung/ngon-ngu';
import { ghiNhatKy } from '../tai-khoan/nhat-ky';
import { yeuCauQuyen } from '../tai-khoan/quyen';
import { traLoiNghiepVu } from './chuyen-muc';

export function dichCauTrucRouter(d: { db: Db; hangDoi: HangDoiBuild; now: () => number }): Router {
  const r = Router();
  // Khai báo chung `cau-truc.sua` (quản lý trở lên); loại site/giao-dien cần thêm `cai-dat.sua` (chỉ quản trị) — kiểm ngay trong handler.
  const thamSo = (req: Request) => ({ loai: String(req.params.loai) as LoaiDich, khoa: String(req.params.khoa), ma: String(req.params.ngonNgu) });
  const duocPhep = (req: Request, loai: LoaiDich) => coQuyen(req.nguoiDung!, LOAI_CAI_DAT.includes(loai) ? 'cai-dat.sua' : 'cau-truc.sua');

  r.get('/dich/:loai/:khoa/:ngonNgu', yeuCauQuyen('cau-truc.sua'), (req, res) => {
    const { loai, khoa, ma } = thamSo(req);
    if (!(LOAI_DICH as readonly string[]).includes(loai)) return void res.status(400).json({ loi: `loai phải là một trong: ${LOAI_DICH.join(', ')}` });
    if (!duocPhep(req, loai)) return void res.status(403).json({ loi: 'Bạn không có quyền làm việc này' });
    if (ma === 'vi' || !maNgonNguDaCo(d.db).includes(ma)) return void res.status(404).json({ loi: 'Không có ngôn ngữ này' });
    const goc = banGocDich(d.db, loai, khoa);
    if (goc === null) return void res.status(404).json({ loi: 'Không tìm thấy đối tượng cần dịch' });
    const dich = docDich(d.db, loai, khoa, ma);
    res.json({ loai, khoa, ngonNgu: ma, banGoc: goc, duLieu: dich?.duLieu ?? null, suaLuc: dich?.suaLuc ?? null });
  });

  r.put('/dich/:loai/:khoa/:ngonNgu', yeuCauQuyen('cau-truc.sua'), (req, res) => {
    const { loai, khoa, ma } = thamSo(req);
    if (!(LOAI_DICH as readonly string[]).includes(loai)) return void res.status(400).json({ loi: `loai phải là một trong: ${LOAI_DICH.join(', ')}` });
    if (!duocPhep(req, loai)) return void res.status(403).json({ loi: 'Bạn không có quyền làm việc này' });
    try {
      const sach = luuDich(d.db, loai, khoa, ma, req.body, d.now);
      ghiNhatKy(d.db, { nguoiDungId: req.nguoiDung!.id, loai: 'luu-dich-cau-truc', ip: req.ip, chiTiet: { loai, khoa, ngonNgu: ma } }, d.now);
      d.hangDoi.yeuCau();
      res.json({ loai, khoa, ngonNgu: ma, duLieu: sach });
    } catch (e) {
      traLoiNghiepVu(res, e);
    }
  });
  return r;
}
