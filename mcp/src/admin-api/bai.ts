// API bài viết của trang quản trị: danh sách, đọc, tạo, sửa (kiểm tra phiên bản), tự lưu.
// Hai người cùng sửa một bài: người lưu sau nhận 409 kèm tên người sửa trước, không ghi đè im lặng.
import { urlBai } from '@vntraveltips/schema';
import { diffLines } from 'diff';
import { Router, type Request, type Response } from 'express';
import type { HangDoiBuild } from '../build/hang-doi';
import type { Config } from '../config';
import type { Db } from '../db/ket-noi';
import { gioVN, ngayVN } from '../mail/ngay-vn';
import { epochSangGioVN, gioVNSangEpoch } from '../noi-dung/hen-gio';
import { danhDauNoiDungDoi } from '../noi-dung/phien-noi-dung';
import { ghiNhatKy } from '../tai-khoan/nhat-ky';
import { baiVietSchema, taoSlug } from '@vntraveltips/schema';
import { docBai, luuBai, slugKhongTrung, XungDotPhienBan, type BaiDoc } from '../noi-dung/bai';
import { kiemTraDayDu, layDanhSachTinh } from '../noi-dung/kiem-tra';

export interface DepsBai {
  config: Config;
  db: Db;
  now: () => number;
  hangDoi: HangDoiBuild;
}

const MOI_TRANG = 20;
const TRANG_THAI_LOC = ['nhap', 'da-dang', 'hen-gio', 'thung-rac'];
const MUOI_PHUT = 10 * 60_000;

export const tenNguoi = (db: Db, id: number | null): { id: number; ten: string } | null => {
  if (id === null) return null;
  const r = db.prepare('SELECT id, ten FROM nguoi_dung WHERE id = ?').get(id) as { id: number; ten: string } | undefined;
  return r ?? null;
};

export function idTuUrl(v: string): number {
  return /^\d+$/.test(v) ? Number(v) : NaN;
}

export function baiRouter(d: DepsBai): Router {
  const r = Router();

  /** Lấy bài theo :id; trả null (đã trả 404) nếu không có. */
  const layBai = (req: Request, res: Response): BaiDoc | null => {
    const id = idTuUrl(String(req.params.id));
    const doc = Number.isNaN(id) ? null : docBai(d.db, id);
    if (!doc) {
      res.status(404).json({ loi: 'Không tìm thấy bài viết' });
      return null;
    }
    return doc;
  };

  const lay = (req: Request, res: Response): { bai: unknown; noiDung: string; phienSo?: number } | null => {
    const b = req.body as { bai?: unknown; noiDung?: unknown; phienSo?: unknown } | undefined;
    if (!b || typeof b.bai !== 'object' || b.bai === null || typeof b.noiDung !== 'string' || b.noiDung.length > 500_000) {
      res.status(400).json({ loi: 'Cần gửi bai (đối tượng) và noiDung (chuỗi)' });
      return null;
    }
    if (b.phienSo !== undefined && !Number.isInteger(b.phienSo)) {
      res.status(400).json({ loi: 'phienSo phải là số nguyên' });
      return null;
    }
    return { bai: b.bai, noiDung: b.noiDung, phienSo: b.phienSo as number | undefined };
  };

  const traXungDot = (res: Response, e: XungDotPhienBan) => {
    res.status(409).json({
      loi: `Bài đã được ${e.nguoiSua ?? 'một người khác'} sửa lúc ${gioVN(e.luc)}. Tải lại để xem bản mới.`,
      nguoiSua: e.nguoiSua,
      luc: e.luc,
    });
  };

  const traLoiLuat = (res: Response, loi: string[]) => res.status(400).json({ loi: 'Bài chưa đạt kiểm tra', chiTiet: loi });

  r.get('/tinh', (_req, res) => {
    res.json({ tinh: layDanhSachTinh(d.db).map((t) => ({ slug: t.slug, ten: t.ten })) });
  });

  r.get('/bai', (req, res) => {
    const q = String(req.query.q ?? '').trim();
    const trangThai = String(req.query.trangThai ?? '');
    const tinh = String(req.query.tinh ?? '');
    const chuyenMuc = String(req.query.chuyenMuc ?? '');
    const tacGia = String(req.query.tacGia ?? '');
    const trang = Math.max(1, Number.parseInt(String(req.query.trang ?? '1'), 10) || 1);
    if (trangThai && !TRANG_THAI_LOC.includes(trangThai)) {
      res.status(400).json({ loi: 'trangThai không hợp lệ' });
      return;
    }
    const dieuKien: string[] = ["d.ngon_ngu = 'vi'"];
    const tham: unknown[] = [];
    if (trangThai === 'thung-rac') dieuKien.push('b.xoa_luc IS NOT NULL');
    else {
      dieuKien.push('b.xoa_luc IS NULL');
      if (trangThai) (dieuKien.push('d.trang_thai = ?'), tham.push(trangThai));
    }
    if (q) {
      dieuKien.push("(json_extract(d.du_lieu, '$.tieuDe') LIKE ? ESCAPE '\\' OR d.slug LIKE ? ESCAPE '\\')");
      const mau = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      tham.push(mau, mau);
    }
    if (tinh) (dieuKien.push('b.tinh = ?'), tham.push(tinh));
    if (chuyenMuc) (dieuKien.push("EXISTS (SELECT 1 FROM json_each(d.du_lieu, '$.chuyenMuc') WHERE value = ?)"), tham.push(chuyenMuc));
    if (/^\d+$/.test(tacGia)) (dieuKien.push('b.tac_gia_id = ?'), tham.push(Number(tacGia)));
    const tu = `FROM bai b JOIN ban_dich d ON d.bai_id = b.id WHERE ${dieuKien.join(' AND ')}`;
    const tong = (d.db.prepare(`SELECT count(*) AS n ${tu}`).get(...tham) as { n: number }).n;
    const dong = d.db
      .prepare(
        `SELECT b.id, json_extract(d.du_lieu, '$.tieuDe') AS tieuDe, d.slug, d.trang_thai AS trangThai, d.hen_gio AS henGio, b.tinh,
                b.tac_gia_id AS tacGiaId, b.nguoi_sua_cuoi_id AS nguoiSuaCuoiId, d.sua_luc AS suaLuc, d.dang_luc AS dangLuc ${tu}
         ORDER BY d.sua_luc DESC, b.id DESC LIMIT ? OFFSET ?`,
      )
      .all(...tham, MOI_TRANG, (trang - 1) * MOI_TRANG) as Record<string, unknown>[];
    res.json({
      bai: dong.map(({ tacGiaId, nguoiSuaCuoiId, henGio, tinh: t, dangLuc, ...con }) => ({
        ...con,
        ...(henGio !== null ? { henGio } : {}),
        ...(t !== null ? { tinh: t } : {}),
        ...(dangLuc !== null ? { dangLuc } : {}),
        tacGia: tenNguoi(d.db, tacGiaId as number | null),
        nguoiSuaCuoi: tenNguoi(d.db, nguoiSuaCuoiId as number | null),
      })),
      tong,
    });
  });

  r.get('/bai/:id', (req, res) => {
    const doc = layBai(req, res);
    if (!doc) return;
    res.json({
      id: doc.id,
      bai: doc.bai,
      noiDung: doc.noiDung,
      trangThai: doc.trangThai,
      ...(doc.henGio !== null ? { henGio: doc.henGio } : {}),
      phienSo: doc.phienSo,
      thungRac: doc.xoaLuc !== null,
      tacGia: tenNguoi(d.db, doc.tacGiaId),
      nguoiSuaCuoi: tenNguoi(d.db, doc.nguoiSuaCuoiId),
      nguoiDang: tenNguoi(d.db, doc.nguoiDangId),
      taoLuc: doc.taoLuc,
      suaLuc: doc.suaLuc,
      ...(doc.dangLuc !== null ? { dangLuc: doc.dangLuc } : {}),
      ...(doc.nhapTuLuu ? { banNhapTuLuu: doc.nhapTuLuu } : {}),
    });
  });

  // Tạo bản nháp: chỉ kiểm tra cơ bản (nháp được thiếu trường).
  r.post('/bai', (req, res) => {
    const g = lay(req, res);
    if (!g) return;
    // Không gửi slug → gợi ý từ tiêu đề (bỏ dấu, đ→d) và tự thêm -2, -3… nếu trùng.
    const b0 = g.bai as { slug?: unknown; tieuDe?: unknown };
    if ((b0.slug === undefined || b0.slug === '') && typeof b0.tieuDe === 'string') {
      b0.slug = slugKhongTrung(d.db, 'vi', taoSlug(b0.tieuDe));
    }
    try {
      const { id, phienSo } = luuBai(d.db, { ngonNgu: 'vi', bai: g.bai as never, noiDung: g.noiDung, trangThai: 'nhap', nguoiId: req.nguoiDung!.id, kiemTra: 'co-ban' }, d.now);
      d.hangDoi.yeuCau();
      res.status(201).json({ id, phienSo });
    } catch (e) {
      res.status(/UNIQUE/.test((e as Error).message) ? 409 : 400).json({ loi: /UNIQUE/.test((e as Error).message) ? 'Slug này đã có bài khác dùng' : (e as Error).message });
    }
  });

  r.put('/bai/:id', (req, res) => {
    const doc = layBai(req, res);
    const g = doc && lay(req, res);
    if (!doc || !g) return;
    if (doc.trangThai !== 'nhap') {
      const kt = kiemTraDayDu(d.db, d.config.anhDir, g.bai, g.noiDung, doc.bai.slug);
      if (!kt.dat) return void traLoiLuat(res, kt.loi);
    }
    try {
      const { phienSo } = luuBai(
        d.db,
        { id: doc.id, ngonNgu: 'vi', bai: g.bai as never, noiDung: g.noiDung, trangThai: doc.trangThai, henGio: doc.henGio ?? undefined, nguoiId: req.nguoiDung!.id, phienSo: g.phienSo, kiemTra: doc.trangThai === 'nhap' ? 'co-ban' : 'day-du' },
        d.now,
      );
      d.hangDoi.yeuCau();
      res.json({ id: doc.id, phienSo });
    } catch (e) {
      if (e instanceof XungDotPhienBan) return void traXungDot(res, e);
      res.status(/UNIQUE/.test((e as Error).message) ? 409 : 400).json({ loi: /UNIQUE/.test((e as Error).message) ? 'Slug này đã có bài khác dùng' : (e as Error).message });
    }
  });

  // Tự lưu: chỉ ghi nhap_tu_luu (không bump phiên, không build). Cứ ≥ 10 phút lại chốt thành một phiên bản trong lịch sử.
  r.patch('/bai/:id/tu-luu', (req, res) => {
    const doc = layBai(req, res);
    const g = doc && lay(req, res);
    if (!doc || !g) return;
    if (g.phienSo !== undefined && g.phienSo !== doc.phienSo) {
      return void traXungDot(res, new XungDotPhienBan(tenNguoi(d.db, doc.nguoiSuaCuoiId)?.ten ?? null, doc.suaLuc));
    }
    const t = d.now();
    d.db.transaction(() => {
      d.db.prepare("UPDATE ban_dich SET nhap_tu_luu = ? WHERE bai_id = ? AND ngon_ngu = 'vi'").run(JSON.stringify({ bai: g.bai, noiDung: g.noiDung, luc: t }), doc.id);
      const cuoi = (d.db.prepare("SELECT phien_ban_cuoi_luc AS l FROM ban_dich WHERE bai_id = ? AND ngon_ngu = 'vi'").get(doc.id) as { l: number | null }).l ?? 0;
      if (t - cuoi >= MUOI_PHUT) {
        const { draft: _d, ...du } = g.bai as Record<string, unknown>;
        d.db.prepare("INSERT INTO phien_ban (bai_id, ngon_ngu, nguoi_dung_id, luc, du_lieu, noi_dung) VALUES (?, 'vi', ?, ?, ?, ?)").run(doc.id, req.nguoiDung!.id, t, JSON.stringify(du), g.noiDung);
        d.db.prepare("UPDATE ban_dich SET phien_ban_cuoi_luc = ? WHERE bai_id = ? AND ngon_ngu = 'vi'").run(t, doc.id);
      }
    })();
    res.json({ ok: true, luc: t });
  });


  // ---- Trạng thái: đăng, gỡ, thùng rác, khôi phục, xoá hẳn, nhân bản ----
  const ghi = (req: Request, loai: string, id: number, chiTiet?: object) =>
    ghiNhatKy(d.db, { nguoiDungId: req.nguoiDung!.id, loai, ip: req.ip, chiTiet: { baiId: id, ...chiTiet } }, d.now);
  const baoDoi = () => d.hangDoi.yeuCau();
  const luuThat = (req: Request, doc: BaiDoc, trangThai: 'nhap' | 'da-dang', bai: unknown, phienSo?: number) =>
    luuBai(d.db, { id: doc.id, ngonNgu: 'vi', bai: bai as never, noiDung: doc.noiDung, trangThai, nguoiId: req.nguoiDung!.id, phienSo, kiemTra: trangThai === 'nhap' ? 'co-ban' : 'day-du' }, d.now);

  r.post('/bai/:id/dang', (req, res) => {
    const doc = layBai(req, res);
    if (!doc) return;
    if (doc.xoaLuc !== null) return void res.status(409).json({ loi: 'Bài đang trong thùng rác, hãy khôi phục trước khi đăng' });
    // Ngày đăng trống → hôm nay theo giờ Việt Nam.
    const bai = { ...doc.bai, ngayDang: doc.bai.ngayDang ?? ngayVN(d.now()) };
    const kt = kiemTraDayDu(d.db, d.config.anhDir, bai, doc.noiDung, doc.bai.slug);
    if (!kt.dat) return void traLoiLuat(res, kt.loi);
    try {
      luuThat(req, doc, 'da-dang', bai, (req.body as { phienSo?: number } | undefined)?.phienSo);
    } catch (e) {
      if (e instanceof XungDotPhienBan) return void traXungDot(res, e);
      return void res.status(400).json({ loi: (e as Error).message });
    }
    ghi(req, 'dang-bai', doc.id);
    baoDoi();
    res.json({ ok: true });
  });

  r.post('/bai/:id/go', (req, res) => {
    const doc = layBai(req, res);
    if (!doc) return;
    if (doc.trangThai === 'nhap') return void res.status(409).json({ loi: 'Bài đang là bản nháp, không cần gỡ' });
    luuThat(req, doc, 'nhap', doc.bai);
    ghi(req, 'go-bai', doc.id);
    baoDoi();
    res.json({ ok: true });
  });

  r.post('/bai/:id/thung-rac', (req, res) => {
    const doc = layBai(req, res);
    if (!doc) return;
    if (doc.xoaLuc !== null) return void res.status(409).json({ loi: 'Bài đã ở trong thùng rác' });
    d.db.transaction(() => {
      d.db.prepare('UPDATE bai SET xoa_luc = ? WHERE id = ?').run(d.now(), doc.id);
      danhDauNoiDungDoi(d.db);
    })();
    ghi(req, 'thung-rac', doc.id);
    baoDoi();
    res.json({ ok: true });
  });

  r.post('/bai/:id/khoi-phuc', (req, res) => {
    const doc = layBai(req, res);
    if (!doc) return;
    if (doc.xoaLuc === null) return void res.status(409).json({ loi: 'Bài không ở trong thùng rác' });
    d.db.transaction(() => {
      d.db.prepare('UPDATE bai SET xoa_luc = NULL WHERE id = ?').run(doc.id);
      danhDauNoiDungDoi(d.db);
    })();
    ghi(req, 'khoi-phuc-bai', doc.id);
    baoDoi();
    res.json({ ok: true });
  });

  // Xoá hẳn: chỉ khi đã ở thùng rác (GĐ4 giới hạn cho quản trị). Ảnh không bị xoá (có thể bài khác dùng).
  r.delete('/bai/:id', (req, res) => {
    const doc = layBai(req, res);
    if (!doc) return;
    if (doc.xoaLuc === null) return void res.status(409).json({ loi: 'Chỉ xoá hẳn được bài đã ở trong thùng rác' });
    d.db.transaction(() => {
      d.db.prepare('DELETE FROM bai WHERE id = ?').run(doc.id);
      danhDauNoiDungDoi(d.db);
    })();
    ghi(req, 'xoa-han', doc.id, { slug: doc.bai.slug });
    baoDoi();
    res.json({ ok: true });
  });

  r.post('/bai/:id/nhan-ban', (req, res) => {
    const doc = layBai(req, res);
    if (!doc) return;
    const tieuDe = `${doc.bai.tieuDe ?? ''} (bản sao)`;
    const { draft: _d, ...goc } = doc.bai as unknown as Record<string, unknown>;
    const moi = luuBai(
      d.db,
      { ngonNgu: 'vi', bai: { ...goc, tieuDe, slug: slugKhongTrung(d.db, 'vi', doc.bai.slug) } as never, noiDung: doc.noiDung, trangThai: 'nhap', nguoiId: req.nguoiDung!.id, kiemTra: 'co-ban' },
      d.now,
    );
    ghi(req, 'nhan-ban', moi.id, { tu: doc.id });
    baoDoi();
    res.status(201).json({ id: moi.id, phienSo: moi.phienSo });
  });


  // ---- Lịch sử phiên bản ----
  interface DongPb { id: number; luc: number; nguoi_dung_id: number | null; du_lieu: string; noi_dung: string }
  const layPb = (req: Request, res: Response, doc: BaiDoc): DongPb | null => {
    const pid = idTuUrl(String(req.params.pid));
    const pb = Number.isNaN(pid) ? undefined : (d.db.prepare("SELECT id, luc, nguoi_dung_id, du_lieu, noi_dung FROM phien_ban WHERE id = ? AND bai_id = ? AND ngon_ngu = 'vi'").get(pid, doc.id) as DongPb | undefined);
    if (!pb) {
      res.status(404).json({ loi: 'Không tìm thấy phiên bản này' });
      return null;
    }
    return pb;
  };

  r.get('/bai/:id/phien-ban', (req, res) => {
    const doc = layBai(req, res);
    if (!doc) return;
    const ds = d.db.prepare("SELECT id, luc, nguoi_dung_id FROM phien_ban WHERE bai_id = ? AND ngon_ngu = 'vi' ORDER BY luc DESC, id DESC").all(doc.id) as { id: number; luc: number; nguoi_dung_id: number | null }[];
    res.json(ds.map((p) => ({ id: p.id, luc: p.luc, nguoiSua: tenNguoi(d.db, p.nguoi_dung_id) })));
  });

  r.get('/bai/:id/phien-ban/:pid', (req, res) => {
    const doc = layBai(req, res);
    const pb = doc && layPb(req, res, doc);
    if (!doc || !pb) return;
    res.json({ bai: JSON.parse(pb.du_lieu), noiDung: pb.noi_dung });
  });

  // So phiên bản đã chọn ("trước") với bản hiện tại ("sau"): các trường frontmatter khác nhau + diff thân bài theo dòng.
  r.get('/bai/:id/phien-ban/:pid/so-sanh', (req, res) => {
    const doc = layBai(req, res);
    const pb = doc && layPb(req, res, doc);
    if (!doc || !pb) return;
    // Chuẩn hoá cả hai bản qua schema (điền giá trị mặc định) để không báo khác biệt giả giữa "thiếu trường" và "mảng rỗng".
    const kq = baiVietSchema.safeParse({ ...JSON.parse(pb.du_lieu), draft: false });
    const { draft: _c, ...cuChuan } = (kq.success ? kq.data : JSON.parse(pb.du_lieu)) as Record<string, unknown>;
    const cu = JSON.parse(JSON.stringify(cuChuan)) as Record<string, unknown>;
    const { draft: _d, ...hienTai } = doc.bai as unknown as Record<string, unknown>;
    const hienTaiJson = JSON.parse(JSON.stringify(hienTai)) as Record<string, unknown>;
    const thayDoi = [...new Set([...Object.keys(cu), ...Object.keys(hienTaiJson)])]
      .filter((k) => JSON.stringify(cu[k]) !== JSON.stringify(hienTaiJson[k]))
      .map((truong) => ({ truong, truoc: cu[truong] ?? null, sau: hienTaiJson[truong] ?? null }));
    const noiDung = diffLines(pb.noi_dung, doc.noiDung).map((p) => ({ them: p.added === true, xoa: p.removed === true, giaTri: p.value }));
    res.json({ thayDoi, noiDung });
  });

  // Khôi phục = tạo phiên bản MỚI từ bản cũ (không xoá lịch sử), giữ nguyên trạng thái đăng.
  r.post('/bai/:id/phien-ban/:pid/khoi-phuc', (req, res) => {
    const doc = layBai(req, res);
    const pb = doc && layPb(req, res, doc);
    if (!doc || !pb) return;
    const bai = JSON.parse(pb.du_lieu) as Record<string, unknown>;
    if (doc.trangThai !== 'nhap') {
      const kt = kiemTraDayDu(d.db, d.config.anhDir, bai, pb.noi_dung, bai.slug as string);
      if (!kt.dat) return void traLoiLuat(res, kt.loi);
    }
    try {
      const { phienSo } = luuBai(
        d.db,
        { id: doc.id, ngonNgu: 'vi', bai: bai as never, noiDung: pb.noi_dung, trangThai: doc.trangThai, henGio: doc.henGio ?? undefined, nguoiId: req.nguoiDung!.id, kiemTra: doc.trangThai === 'nhap' ? 'co-ban' : 'day-du' },
        d.now,
      );
      ghi(req, 'khoi-phuc-phien-ban', doc.id, { phienBanId: pb.id });
      baoDoi();
      res.json({ ok: true, phienSo });
    } catch (e) {
      res.status(/UNIQUE/.test((e as Error).message) ? 409 : 400).json({ loi: /UNIQUE/.test((e as Error).message) ? 'Slug của phiên bản này đã có bài khác dùng' : (e as Error).message });
    }
  });


  // ---- Hẹn giờ đăng (giờ Việt Nam) ----
  r.post('/bai/:id/hen-gio', (req, res) => {
    const doc = layBai(req, res);
    if (!doc) return;
    if (doc.xoaLuc !== null) return void res.status(409).json({ loi: 'Bài đang trong thùng rác' });
    let luc: number;
    try {
      luc = gioVNSangEpoch(String((req.body as { luc?: unknown } | undefined)?.luc ?? ''));
    } catch (e) {
      return void res.status(400).json({ loi: (e as Error).message });
    }
    if (luc <= d.now()) return void res.status(400).json({ loi: 'Giờ hẹn phải ở tương lai (giờ Việt Nam)' });
    const bai = { ...doc.bai, ngayDang: doc.bai.ngayDang ?? epochSangGioVN(luc).slice(0, 10) };
    const kt = kiemTraDayDu(d.db, d.config.anhDir, bai, doc.noiDung, doc.bai.slug);
    if (!kt.dat) return void traLoiLuat(res, kt.loi);
    try {
      luuBai(d.db, { id: doc.id, ngonNgu: 'vi', bai: bai as never, noiDung: doc.noiDung, trangThai: 'hen-gio', henGio: luc, nguoiId: req.nguoiDung!.id }, d.now);
    } catch (e) {
      return void res.status(400).json({ loi: (e as Error).message });
    }
    d.db.prepare("UPDATE ban_dich SET hen_gio_nguoi_id = ? WHERE bai_id = ? AND ngon_ngu = 'vi'").run(req.nguoiDung!.id, doc.id);
    ghi(req, 'hen-gio', doc.id, { luc: epochSangGioVN(luc) });
    baoDoi();
    res.json({ ok: true, henGio: luc, gioVN: epochSangGioVN(luc) });
  });

  r.post('/bai/:id/huy-hen-gio', (req, res) => {
    const doc = layBai(req, res);
    if (!doc) return;
    if (doc.trangThai !== 'hen-gio') return void res.status(409).json({ loi: 'Bài không có hẹn giờ' });
    luuThat(req, doc, 'nhap', doc.bai);
    ghi(req, 'huy-hen-gio', doc.id);
    baoDoi();
    res.json({ ok: true });
  });


  // ---- Xem trước (Review) ----
  // Lưu như PUT (409 nếu xung đột), xếp lượt build, trả URL trang xem trước + bộ đếm nội dung. Trang quản trị chờ tới khi
  // GET /build báo previewNoiDungPhien ≥ noiDungPhien này rồi mới mở URL.
  r.post('/bai/:id/xem-truoc', (req, res) => {
    const doc = layBai(req, res);
    const g = doc && lay(req, res);
    if (!doc || !g) return;
    let phienSo: number;
    try {
      ({ phienSo } = luuBai(
        d.db,
        { id: doc.id, ngonNgu: 'vi', bai: g.bai as never, noiDung: g.noiDung, trangThai: doc.trangThai, henGio: doc.henGio ?? undefined, nguoiId: req.nguoiDung!.id, phienSo: g.phienSo, kiemTra: 'co-ban' },
        d.now,
      ));
    } catch (e) {
      if (e instanceof XungDotPhienBan) return void traXungDot(res, e);
      return void res.status(/UNIQUE/.test((e as Error).message) ? 409 : 400).json({ loi: /UNIQUE/.test((e as Error).message) ? 'Slug này đã có bài khác dùng' : (e as Error).message });
    }
    baoDoi();
    const luu = docBai(d.db, doc.id)!;
    // Bản nháp còn thiếu trường không dựng được trang: báo rõ để người dùng không chờ vô ích.
    const kt = kiemTraDayDu(d.db, d.config.anhDir, luu.bai, luu.noiDung, luu.bai.slug);
    res.json({
      url: `${d.config.previewBaseUrl}${urlBai(luu.bai)}`,
      noiDungPhien: Number((d.db.prepare("SELECT gia_tri FROM he_thong WHERE khoa = 'noi_dung_phien'").get() as { gia_tri: string }).gia_tri),
      phienSo,
      hopLe: kt.dat,
      ...(kt.dat ? {} : { loi: kt.loi }),
    });
  });

  return r;
}
