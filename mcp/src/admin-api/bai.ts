// API bài viết của trang quản trị: danh sách, đọc, tạo, sửa (kiểm tra phiên bản), tự lưu.
// Hai người cùng sửa một bài: người lưu sau nhận 409 kèm tên người sửa trước, không ghi đè im lặng.
import { Router, type Request, type Response } from 'express';
import type { HangDoiBuild } from '../build/hang-doi';
import type { Config } from '../config';
import type { Db } from '../db/ket-noi';
import { gioVN } from '../mail/ngay-vn';
import { taoSlug } from '@vntraveltips/schema';
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

  return r;
}
