// Kiểm duyệt bình luận: xem, ẩn/hiện, xoá, trả lời với nhãn "Tác giả", chặn email/IP. Quyền `binh-luan.an-xoa` tính theo TÁC GIẢ BÀI:
// quản trị/quản lý làm với mọi bài, người viết chỉ với bài của mình. Người viết cũng chỉ THẤY bình luận ở bài của mình.
import { Router, type Request } from 'express';
import type { HangDoiBuild } from '../build/hang-doi';
import type { Db } from '../db/ket-noi';
import { thongBaoBinhLuanMoi } from '../binh-luan/bao-mail';
import { bamGiaTri, doiTrangThai, themBinhLuan, xoa } from '../binh-luan/kho';
import type { Config } from '../config';
import type { DichVuMail } from '../mail/dich-vu';
import { ghiNhatKy } from '../tai-khoan/nhat-ky';
import { yeuCauQuyen } from '../tai-khoan/quyen';

const MOI_TRANG = 30;
const TRANG_THAI = ['hien', 'an', 'cho-xem'];

interface Dong { id: number; bai_id: number; cha_id: number | null; ten: string; email: string; noi_dung: string; ip_bam: string; trang_thai: 'hien' | 'an' | 'cho-xem'; ly_do_cho_xem: string | null; la_tac_gia: number; tao_luc: number; ngon_ngu: string; tac_gia_id: number | null; tieu_de: string | null }

export function binhLuanRouter(d: { config: Config; db: Db; mail: DichVuMail; hangDoi: HangDoiBuild; now: () => number }): Router {
  const r = Router();
  const doc = (id: number) =>
    d.db
      .prepare(
        `SELECT c.id, c.bai_id, c.cha_id, c.ten, c.email, c.noi_dung, c.ip_bam, c.trang_thai, c.ly_do_cho_xem, c.la_tac_gia, c.tao_luc, c.ngon_ngu, b.tac_gia_id, json_extract(x.du_lieu, '$.tieuDe') AS tieu_de
         FROM binh_luan c JOIN bai b ON b.id = c.bai_id LEFT JOIN ban_dich x ON x.bai_id = b.id AND x.ngon_ngu = 'vi' WHERE c.id = ?`,
      )
      .get(id) as Dong | undefined;
  const idTuUrl = (req: Request) => (/^\d+$/.test(String(req.params.id)) ? Number(req.params.id) : NaN);
  // Chủ sở hữu = tác giả của bài chứa bình luận. Không có bình luận → route trả 404.
  const chuBinhLuan = (req: Request) => {
    const c = doc(idTuUrl(req));
    return c ? { tacGiaId: c.tac_gia_id } : ('khong-ton-tai' as const);
  };
  const nhatKy = (req: Request, loai: string, chiTiet: object) => ghiNhatKy(d.db, { nguoiDungId: req.nguoiDung!.id, loai, ip: req.ip, chiTiet }, d.now);
  // Bình luận hiện/ẩn thay đổi nội dung bài trên site nhưng site nạp bằng JS, không cần build lại.

  r.get('/binh-luan', (req, res) => {
    const u = req.nguoiDung!;
    const dk: string[] = [];
    const tham: unknown[] = [];
    const tt = String(req.query.trangThai ?? '');
    if (tt) {
      if (!TRANG_THAI.includes(tt)) return void res.status(400).json({ loi: 'trangThai không hợp lệ' });
      dk.push('c.trang_thai = ?');
      tham.push(tt);
    }
    const nn = String(req.query.ngonNgu ?? '');
    if (nn) {
      if (!/^[a-z]{2}(-[a-z]{2})?$/.test(nn)) return void res.status(400).json({ loi: 'ngonNgu không hợp lệ' });
      dk.push('c.ngon_ngu = ?');
      tham.push(nn);
    }
    if (/^\d+$/.test(String(req.query.baiId ?? ''))) (dk.push('c.bai_id = ?'), tham.push(Number(req.query.baiId)));
    if (u.vaiTro === 'writer') (dk.push('b.tac_gia_id = ?'), tham.push(u.id)); // người viết chỉ thấy bình luận ở bài của mình
    const where = dk.length ? `WHERE ${dk.join(' AND ')}` : '';
    const trang = Math.max(1, Number.parseInt(String(req.query.trang ?? '1'), 10) || 1);
    const tu = `FROM binh_luan c JOIN bai b ON b.id = c.bai_id LEFT JOIN ban_dich x ON x.bai_id = b.id AND x.ngon_ngu = 'vi' ${where}`;
    const tong = (d.db.prepare(`SELECT count(*) AS n ${tu}`).get(...tham) as { n: number }).n;
    const ds = d.db
      .prepare(`SELECT c.id, c.bai_id, c.cha_id, c.ten, c.email, c.noi_dung, c.trang_thai, c.ly_do_cho_xem, c.la_tac_gia, c.tao_luc, json_extract(x.du_lieu, '$.tieuDe') AS tieu_de ${tu} ORDER BY (c.trang_thai = 'cho-xem') DESC, c.tao_luc DESC, c.id DESC LIMIT ? OFFSET ?`)
      .all(...tham, MOI_TRANG, (trang - 1) * MOI_TRANG) as Dong[];
    res.json({
      tong,
      trang,
      binhLuan: ds.map((c) => ({ id: c.id, baiId: c.bai_id, baiTieuDe: c.tieu_de ?? '', chaId: c.cha_id, ten: c.ten, email: c.email, noiDung: c.noi_dung, trangThai: c.trang_thai, lyDoChoXem: c.ly_do_cho_xem, laTacGia: c.la_tac_gia === 1, taoLuc: c.tao_luc })),
    });
  });

  r.put('/binh-luan/:id', yeuCauQuyen('binh-luan.an-xoa', chuBinhLuan), (req, res) => {
    const c = doc(idTuUrl(req));
    const tt = (req.body as { trangThai?: unknown } | undefined)?.trangThai;
    if (!c) return void res.status(404).json({ loi: 'Không tìm thấy bình luận' });
    if (tt !== 'hien' && tt !== 'an') return void res.status(400).json({ loi: "trangThai phải là 'hien' hoặc 'an'" });
    doiTrangThai(d.db, c.id, tt);
    nhatKy(req, tt === 'an' ? 'an-binh-luan' : 'hien-binh-luan', { id: c.id, baiId: c.bai_id });
    res.json({ ok: true });
  });

  r.delete('/binh-luan/:id', yeuCauQuyen('binh-luan.an-xoa', chuBinhLuan), (req, res) => {
    const c = doc(idTuUrl(req));
    if (!c) return void res.status(404).json({ loi: 'Không tìm thấy bình luận' });
    xoa(d.db, c.id); // xoá luôn các trả lời con
    nhatKy(req, 'xoa-binh-luan', { id: c.id, baiId: c.bai_id });
    res.json({ ok: true });
  });

  r.post('/binh-luan/:id/tra-loi', yeuCauQuyen('binh-luan.an-xoa', chuBinhLuan), (req, res) => {
    const c = doc(idTuUrl(req));
    const noiDung = typeof (req.body as { noiDung?: unknown } | undefined)?.noiDung === 'string' ? ((req.body as { noiDung: string }).noiDung).trim() : '';
    if (!c) return void res.status(404).json({ loi: 'Không tìm thấy bình luận' });
    if (noiDung.length < 1 || noiDung.length > 2000) return void res.status(400).json({ loi: 'Câu trả lời cần từ 1 đến 2000 ký tự' });
    const u = req.nguoiDung!;
    // Chỉ trả lời bình luận ĐANG HIỆN (trả lời một bình luận ẩn/chờ xem sẽ làm nó lộ ra qua câu trả lời).
    if (c.trang_thai !== 'hien') return void res.status(400).json({ loi: 'Chỉ trả lời được bình luận đang hiện. Hãy cho hiện bình luận này trước.' });
    let kq: { id: number };
    try {
      kq = themBinhLuan(d.db, { baiId: c.bai_id, ngonNgu: c.ngon_ngu, chaId: c.id, ten: u.ten, email: u.email, noiDung, ipBam: 'noi-bo', trangThai: 'hien', nguoiDungId: u.id, laTacGia: true }, d.now);
    } catch (e) {
      // Trả lời của trả lời được gắn vào bình luận gốc cấp 1 — gốc đó có thể không còn hiện.
      return void res.status(400).json({ loi: e instanceof Error ? e.message : 'Không trả lời được bình luận này' });
    }
    nhatKy(req, 'tra-loi-binh-luan', { id: kq.id, cha: c.id, baiId: c.bai_id });
    thongBaoBinhLuanMoi(d.db, d.mail, { baiId: c.bai_id, binhLuanId: kq.id, nguoiTraLoiId: u.id, ten: u.ten, noiDung, trangThai: 'hien', publicBaseUrl: d.config.publicBaseUrl });
    res.status(201).json({ id: kq.id });
  });

  // Chặn người bình luận: dùng giá trị BĂM đã lưu sẵn (IP thô không được lưu), rồi ẩn bình luận này.
  r.post('/binh-luan/:id/chan', yeuCauQuyen('binh-luan.an-xoa', chuBinhLuan), (req, res) => {
    const c = doc(idTuUrl(req));
    const loai = (req.body as { loai?: unknown } | undefined)?.loai;
    if (!c) return void res.status(404).json({ loi: 'Không tìm thấy bình luận' });
    if (loai !== 'email' && loai !== 'ip') return void res.status(400).json({ loi: "loai phải là 'email' hoặc 'ip'" });
    if (loai === 'ip' && c.ip_bam === 'noi-bo') return void res.status(400).json({ loi: 'Đây là câu trả lời nội bộ, không có IP để chặn' });
    const giaTri = loai === 'ip' ? c.ip_bam : bamGiaTri(d.config.khoaBiMat, 'email', c.email);
    d.db.prepare('INSERT OR IGNORE INTO chan_binh_luan (loai, gia_tri_bam) VALUES (?, ?)').run(loai, giaTri);
    doiTrangThai(d.db, c.id, 'an');
    nhatKy(req, 'chan-binh-luan', { id: c.id, loai });
    res.json({ ok: true });
  });

  // Tuỳ chọn cá nhân: nhận mail khi có bình luận mới ở bài của mình.
  r.get('/toi/tuy-chon', (req, res) => {
    const x = d.db.prepare('SELECT nhan_mail_binh_luan AS n FROM nguoi_dung WHERE id = ?').get(req.nguoiDung!.id) as { n: number };
    res.json({ nhanMailBinhLuan: x.n === 1 });
  });
  r.put('/toi/tuy-chon', (req, res) => {
    const v = (req.body as { nhanMailBinhLuan?: unknown } | undefined)?.nhanMailBinhLuan;
    if (typeof v !== 'boolean') return void res.status(400).json({ loi: 'nhanMailBinhLuan phải là true/false' });
    d.db.prepare('UPDATE nguoi_dung SET nhan_mail_binh_luan = ? WHERE id = ?').run(v ? 1 : 0, req.nguoiDung!.id);
    res.json({ nhanMailBinhLuan: v });
  });

  return r;
}
