// Thư viện ảnh của trang quản trị: tải nhiều ảnh (xử lý TUẦN TỰ vì VPS yếu), liệt kê, sửa alt mặc định, xem "đang dùng ở", xoá.
// Ảnh gốc được nén bằng `xuLyAnh` (xoay theo EXIF rồi xoá EXIF/GPS) — cùng đường xử lý với trang /tai-anh của MCP.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { mkdir, readFile, rm, statfs } from 'node:fs/promises';
import { join } from 'node:path';
import { Router, type ErrorRequestHandler } from 'express';
import multer from 'multer';
import { conDungLuong as conDungLuongThat } from '../anh/dung-luong';
import { AnhKhongHopLe, xuLyAnh } from '../anh/xu-ly';
import type { Config } from '../config';
import type { Db } from '../db/ket-noi';
import { timAnhDungO } from '../noi-dung/anh-dung-o-dau';
import { ghiNhatKy } from '../tai-khoan/nhat-ky';
import { yeuCauQuyen } from '../tai-khoan/quyen';

export interface DepsAnh {
  config: Config;
  db: Db;
  now: () => number;
  conDungLuong?: (anhDir: string) => Promise<boolean>;
  /** Test truyền số nhỏ hơn. */
  toiDaByte?: number;
  toiDaFile?: number;
}

const MA_ANH = /^[A-Za-z0-9]{1,64}$/;
const MOI_TRANG = 24;
const TOI_DA_BYTE = 25 * 1024 * 1024;
const TOI_DA_FILE = 20;
const THONG_BAO_DAY = 'Ổ đĩa trên VPS gần đầy (dưới 2 GB), tạm không nhận thêm ảnh.';

export const dungLuongThuMuc = (duong: string): number => {
  let t = 0;
  for (const f of readdirSync(duong)) t += statSync(join(duong, f)).size;
  return t;
};

/** Thêm vào bảng `anh` các thư mục ảnh đã có trên đĩa mà chưa có trong bảng (vd ảnh tải qua /tai-anh của MCP). Idempotent. */
export function dongBoAnh(db: Db, anhDir: string): number {
  if (!existsSync(anhDir)) return 0;
  const co = db.prepare('SELECT 1 FROM anh WHERE ma = ?');
  const them = db.prepare('INSERT OR IGNORE INTO anh (ma, ten_goc, rong, cao, byte, tai_len_luc) VALUES (?,?,?,?,?,?)');
  let n = 0;
  for (const ma of readdirSync(anhDir)) {
    if (ma.startsWith('.') || !MA_ANH.test(ma) || co.get(ma)) continue;
    const meta = join(anhDir, ma, 'meta.json');
    if (!existsSync(meta)) continue;
    try {
      const m = JSON.parse(readFileSync(meta, 'utf8')) as { rong?: number; cao?: number };
      them.run(ma, '', Number(m.rong) || 0, Number(m.cao) || 0, dungLuongThuMuc(join(anhDir, ma)), Math.floor(statSync(join(anhDir, ma)).mtimeMs));
      n++;
    } catch {
      /* meta hỏng: bỏ qua thư mục này */
    }
  }
  return n;
}

export function anhRouter(d: DepsAnh): Router {
  const r = Router();
  const conDungLuong = d.conDungLuong ?? ((dir: string) => conDungLuongThat(dir));
  const maxByte = d.toiDaByte ?? TOI_DA_BYTE;
  const maxFile = d.toiDaFile ?? TOI_DA_FILE;
  const tmpDir = join(d.config.anhDir, '.upload-tmp');
  const upload = multer({
    storage: multer.diskStorage({ destination: (_r, _f, cb) => cb(null, tmpDir) }),
    limits: { fileSize: maxByte, files: maxFile },
    defParamCharset: 'utf8',
  });

  const url = (ma: string) => `${d.config.publicBaseUrl}/anh/${ma}/480.webp`;
  const tieuDeBai = (ids: number[]) =>
    ids.map((id) => ({ id, tieuDe: (d.db.prepare("SELECT json_extract(du_lieu, '$.tieuDe') AS t FROM ban_dich WHERE bai_id = ? AND ngon_ngu = 'vi'").get(id) as { t: string | null } | undefined)?.t ?? '' }));

  r.post(
    '/anh',
    yeuCauQuyen('anh.tai-len'),
    async (_req, res, next) => {
      try {
        await mkdir(tmpDir, { recursive: true });
        if (!(await conDungLuong(d.config.anhDir))) return void res.status(507).json({ loi: THONG_BAO_DAY });
        next();
      } catch (e) {
        next(e);
      }
    },
    upload.fields([{ name: 'files', maxCount: maxFile }, { name: 'files[]', maxCount: maxFile }]),
    async (req, res, next) => {
      const nhom = (req.files ?? {}) as Record<string, Express.Multer.File[]>;
      const files = Object.values(nhom).flat();
      try {
        if (!files.length) return void res.status(400).json({ loi: 'Chưa chọn ảnh nào.' });
        const ok: { ma: string; rong: number; cao: number }[] = [];
        const loi: { ten: string; loi: string }[] = [];
        for (const f of files) {
          try {
            const kq = await xuLyAnh(await readFile(f.path), d.config.anhDir, {});
            d.db.prepare('INSERT INTO anh (ma, ten_goc, rong, cao, byte, tai_len_luc, nguoi_dung_id) VALUES (?,?,?,?,?,?,?) ON CONFLICT(ma) DO UPDATE SET byte = excluded.byte').run(
              kq.ma, f.originalname, kq.rong, kq.cao, dungLuongThuMuc(join(d.config.anhDir, kq.ma)), d.now(), req.nguoiDung!.id,
            );
            ok.push(kq);
          } catch (e) {
            if (!(e instanceof AnhKhongHopLe)) console.error('Lỗi xử lý ảnh:', (e as Error).message);
            loi.push({ ten: f.originalname, loi: e instanceof AnhKhongHopLe ? e.message : 'Lỗi khi xử lý ảnh, thử lại sau.' });
          } finally {
            await rm(f.path, { force: true });
          }
        }
        res.json({ ok, loi });
      } catch (e) {
        next(e);
      }
    },
  );

  r.get('/anh', (req, res) => {
    dongBoAnh(d.db, d.config.anhDir);
    const q = String(req.query.q ?? '').trim();
    const baiId = /^\d+$/.test(String(req.query.baiId ?? '')) ? Number(req.query.baiId) : null;
    const trang = Math.max(1, Number.parseInt(String(req.query.trang ?? '1'), 10) || 1);
    const dung = timAnhDungO(d.db);
    let ds = d.db.prepare('SELECT ma, ten_goc, rong, cao, byte, tai_len_luc, alt_mac_dinh FROM anh ORDER BY tai_len_luc DESC, ma').all() as {
      ma: string; ten_goc: string; rong: number; cao: number; byte: number; tai_len_luc: number; alt_mac_dinh: string;
    }[];
    if (q) ds = ds.filter((a) => a.ten_goc.toLowerCase().includes(q.toLowerCase()) || a.ma.includes(q) || a.alt_mac_dinh.toLowerCase().includes(q.toLowerCase()));
    if (baiId !== null) ds = ds.filter((a) => dung.bai.get(a.ma)?.includes(baiId));
    res.json({
      anh: ds.slice((trang - 1) * MOI_TRANG, trang * MOI_TRANG).map((a) => ({
        ma: a.ma, url: url(a.ma), tenGoc: a.ten_goc, rong: a.rong, cao: a.cao, byte: a.byte, taiLenLuc: a.tai_len_luc, altMacDinh: a.alt_mac_dinh,
        soBaiDung: (dung.bai.get(a.ma)?.length ?? 0) + (dung.tinh.get(a.ma)?.length ?? 0),
      })),
      tong: ds.length,
    });
  });

  r.get('/o-dia', async (_req, res) => {
    const daDung = (d.db.prepare('SELECT coalesce(sum(byte), 0) AS n FROM anh').get() as { n: number }).n;
    let conTrong: number | null = null;
    try {
      const s = await statfs(d.config.anhDir);
      conTrong = Number(s.bavail) * Number(s.bsize);
    } catch {
      /* không đọc được ổ đĩa (vd thư mục chưa có) */
    }
    res.json({ daDungByte: daDung, conTrongByte: conTrong });
  });

  const layMa = (ma: string): string | null => (MA_ANH.test(ma) ? ma : null);

  // Writer chỉ xoá được ảnh do chính mình tải lên (nguoi_dung_id); ảnh cũ không rõ người tải thì chỉ quản trị/quản lý xoá.
  const chuAnh = (req: import('express').Request) => {
    const r = d.db.prepare('SELECT nguoi_dung_id FROM anh WHERE ma = ?').get(String(req.params.ma)) as { nguoi_dung_id: number | null } | undefined;
    return r ? { tacGiaId: r.nguoi_dung_id } : ('khong-ton-tai' as const);
  };
  r.patch('/anh/:ma', yeuCauQuyen('anh.xoa', chuAnh), (req, res) => {
    const ma = layMa(String(req.params.ma));
    const alt = (req.body as { altMacDinh?: unknown } | undefined)?.altMacDinh;
    if (typeof alt !== 'string' || alt.length > 300) return void res.status(400).json({ loi: 'altMacDinh phải là chuỗi (tối đa 300 ký tự)' });
    if (!ma || d.db.prepare('UPDATE anh SET alt_mac_dinh = ? WHERE ma = ?').run(alt, ma).changes === 0) return void res.status(404).json({ loi: 'Không tìm thấy ảnh' });
    res.json({ ok: true });
  });

  r.get('/anh/:ma/dung-o', (req, res) => {
    const ma = layMa(String(req.params.ma));
    if (!ma || !d.db.prepare('SELECT 1 FROM anh WHERE ma = ?').get(ma)) return void res.status(404).json({ loi: 'Không tìm thấy ảnh' });
    const dung = timAnhDungO(d.db);
    res.json({ bai: tieuDeBai(dung.bai.get(ma) ?? []), tinh: dung.tinh.get(ma) ?? [] });
  });

  r.delete('/anh/:ma', yeuCauQuyen('anh.xoa', chuAnh), async (req, res) => {
    const ma = layMa(String(req.params.ma));
    if (!ma || !d.db.prepare('SELECT 1 FROM anh WHERE ma = ?').get(ma)) return void res.status(404).json({ loi: 'Không tìm thấy ảnh' });
    const dung = timAnhDungO(d.db);
    const bai = dung.bai.get(ma) ?? [];
    const tinh = dung.tinh.get(ma) ?? [];
    if (bai.length || tinh.length) {
      return void res.status(409).json({ loi: 'Ảnh đang được dùng nên chưa xoá được. Hãy gỡ ảnh khỏi bài/tỉnh trước.', baiDung: tieuDeBai(bai), tinhDung: tinh });
    }
    await rm(join(d.config.anhDir, ma), { recursive: true, force: true });
    d.db.prepare('DELETE FROM anh WHERE ma = ?').run(ma);
    ghiNhatKy(d.db, { nguoiDungId: req.nguoiDung!.id, loai: 'xoa-anh', ip: req.ip, chiTiet: { ma } }, d.now);
    res.json({ ok: true });
  });

  // Lỗi của multer (file quá lớn / quá nhiều file) → thông báo tiếng Việt.
  r.use(((err, _req, res, next) => {
    if (err instanceof multer.MulterError) {
      const loi = err.code === 'LIMIT_FILE_SIZE' ? `ảnh quá lớn (tối đa ${Math.round(maxByte / 1024 / 1024)} MB mỗi ảnh)` : `quá nhiều file (tối đa ${maxFile} ảnh mỗi lần)`;
      return void res.status(413).json({ loi: `Không nhận được file: ${loi}.` });
    }
    next(err);
  }) as ErrorRequestHandler);

  return r;
}
