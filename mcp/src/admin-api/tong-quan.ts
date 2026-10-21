// Bảng tổng quan: số bài theo trạng thái, build, sao lưu (trong/ngoài VPS), ổ đĩa, mail hôm nay, lần chuyển nhà cung cấp mail gần nhất.
import { statfs } from 'node:fs/promises';
import { yeuCauQuyen } from '../tai-khoan/quyen';
import { Router } from 'express';
import type { HangDoiBuild } from '../build/hang-doi';
import type { Config } from '../config';
import type { Db } from '../db/ket-noi';
import type { DichVuMail } from '../mail/dich-vu';
import { guiCanhBaoSaoLuu, trangThaiSaoLuu } from '../noi-dung/sao-luu-ngoai';
import { demDaXacNhan } from '../ban-tin/kho';
import { thongKeBanDich } from '../noi-dung/ban-dich';
import { lietKeNgonNgu } from '../noi-dung/ngon-ngu';
import { docBuildJson, docGiaoDienThieu } from './build';

export function tongQuanRouter(d: { config: Config; db: Db; hangDoi: HangDoiBuild; mail: DichVuMail; now: () => number }): Router {
  const r = Router();
  r.get('/tong-quan', yeuCauQuyen('cau-truc.sua'), async (_req, res) => {
    const dem = (dk: string) => (d.db.prepare(`SELECT count(*) AS n FROM bai b JOIN ban_dich x ON x.bai_id = b.id WHERE x.ngon_ngu = 'vi' AND ${dk}`).get() as { n: number }).n;
    const banDich = lietKeNgonNgu(d.db).filter((n) => n.bat && n.ma !== 'vi').map((n) => ({ ma: n.ma, ten: n.ten, ...thongKeBanDich(d.db, n.ma) }));
    const saoLuu = trangThaiSaoLuu(d.db, d.config.dataDir, d.now());
    guiCanhBaoSaoLuu(d.db, d.mail, d.config.dataDir, d.now()); // tối đa 1 lần/ngày, chỉ khi có file đánh dấu quá hạn
    let conTrong: number | null = null;
    try {
      const s = await statfs(d.config.anhDir);
      conTrong = Number(s.bavail) * Number(s.bsize);
    } catch {
      /* thư mục ảnh chưa có */
    }
    const chuyen = d.db.prepare("SELECT luc, chi_tiet FROM nhat_ky WHERE loai = 'mail-chuyen-nha-cung-cap' ORDER BY id DESC LIMIT 1").get() as { luc: number; chi_tiet: string | null } | undefined;
    const ct = chuyen?.chi_tiet ? (JSON.parse(chuyen.chi_tiet) as { tu?: string; sang?: string }) : null;
    res.json({
      bai: {
        daDang: dem("b.xoa_luc IS NULL AND x.trang_thai = 'da-dang'"),
        nhap: dem("b.xoa_luc IS NULL AND x.trang_thai = 'nhap'"),
        henGio: dem("b.xoa_luc IS NULL AND x.trang_thai = 'hen-gio'"),
        thungRac: dem('b.xoa_luc IS NOT NULL'),
      },
      banDichThieuHoacCu: banDich.reduce((t, x) => t + x.chua + x.cu, 0),
      banDich: Object.fromEntries(banDich.map((x) => [x.ma, { ten: x.ten, chua: x.chua, cu: x.cu }])),
      giaoDienThieu: await docGiaoDienThieu(d.config.previewDir),
      build: { ...d.hangDoi.trangThai(), previewNoiDungPhien: await docBuildJson(d.config.previewDir), productionNoiDungPhien: await docBuildJson(d.config.siteDir) },
      saoLuu,
      oDia: { daDungByte: (d.db.prepare('SELECT coalesce(sum(byte), 0) AS n FROM anh').get() as { n: number }).n, conTrongByte: conTrong },
      mail: d.mail.thongKeHomNay(),
      ...(chuyen && ct ? { chuyenNhaCungCapGanNhat: { luc: chuyen.luc, tu: ct.tu ?? '', den: ct.sang ?? '' } } : {}),
      // Bình luận cần để ý: tạo trong 24 giờ qua HOẶC đang chờ xem (mỗi bình luận đếm một lần).
      binhLuanMoi: (d.db.prepare("SELECT count(*) AS n FROM binh_luan WHERE la_tac_gia = 0 AND ((tao_luc > ? AND trang_thai = 'hien') OR trang_thai = 'cho-xem')").get(d.now() - 86_400_000) as { n: number }).n,
      nguoiDangKyBanTin: demDaXacNhan(d.db),
      binhLuanChoXem: (d.db.prepare("SELECT count(*) AS n FROM binh_luan WHERE trang_thai = 'cho-xem'").get() as { n: number }).n,
    });
  });
  return r;
}
