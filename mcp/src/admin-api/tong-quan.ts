// Bảng tổng quan: số bài theo trạng thái, build, sao lưu (trong/ngoài VPS), ổ đĩa, mail hôm nay, lần chuyển nhà cung cấp mail gần nhất.
import { statfs } from 'node:fs/promises';
import { yeuCauQuyen } from '../tai-khoan/quyen';
import { Router } from 'express';
import type { HangDoiBuild } from '../build/hang-doi';
import type { Config } from '../config';
import type { Db } from '../db/ket-noi';
import type { DichVuMail } from '../mail/dich-vu';
import { guiCanhBaoSaoLuu, trangThaiSaoLuu } from '../noi-dung/sao-luu-ngoai';
import { docBuildJson } from './build';

export function tongQuanRouter(d: { config: Config; db: Db; hangDoi: HangDoiBuild; mail: DichVuMail; now: () => number }): Router {
  const r = Router();
  r.get('/tong-quan', yeuCauQuyen('cau-truc.sua'), async (_req, res) => {
    const dem = (dk: string) => (d.db.prepare(`SELECT count(*) AS n FROM bai b JOIN ban_dich x ON x.bai_id = b.id WHERE x.ngon_ngu = 'vi' AND ${dk}`).get() as { n: number }).n;
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
      banDichThieuHoacCu: 0, // có số liệu thật từ giai đoạn 7
      build: { ...d.hangDoi.trangThai(), previewNoiDungPhien: await docBuildJson(d.config.previewDir), productionNoiDungPhien: await docBuildJson(d.config.siteDir) },
      saoLuu,
      oDia: { daDungByte: (d.db.prepare('SELECT coalesce(sum(byte), 0) AS n FROM anh').get() as { n: number }).n, conTrongByte: conTrong },
      mail: d.mail.thongKeHomNay(),
      ...(chuyen && ct ? { chuyenNhaCungCapGanNhat: { luc: chuyen.luc, tu: ct.tu ?? '', den: ct.sang ?? '' } } : {}),
      binhLuanMoi: 0, // có số liệu thật từ giai đoạn 5
    });
  });
  return r;
}
