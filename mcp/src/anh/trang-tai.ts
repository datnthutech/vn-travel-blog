// Trang tải ảnh /tai-anh/:token — đường vào DUY NHẤT để ảnh gốc vào hệ thống
// (Claude trên claude.ai/iOS không chuyển được file ảnh vào tool MCP, nên chủ blog mở link này trên điện thoại/máy tính).
// Luồng: GET trang → JS gửi từng ảnh qua POST → xử lý bằng sharp → POST /xong đóng phiên.
import { mkdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import express, { type RequestHandler } from 'express';
import multer from 'multer';
import type { Config } from '../config';
import type { Db } from '../db/ket-noi';
import { conDungLuong as conDungLuongThat } from './dung-luong';
import { ghiNhanAnh } from './gan-day';
import { dungLuongThuMuc } from '../admin-api/anh';
import { dongToken, nguoiDungCuaToken, trangThaiToken } from './token';
import { AnhKhongHopLe, xuLyAnh } from './xu-ly';

export interface TaiAnhDeps {
  now?: () => number;
  conDungLuong?: (anhDir: string) => Promise<boolean>;
  /** Giới hạn mỗi ảnh (byte) và số ảnh mỗi lần gửi; test truyền số nhỏ. */
  toiDaByte?: number;
  toiDaFile?: number;
}

const TRANG_HTML = `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>Tải ảnh — VNTravelTips</title>
<link rel="stylesheet" href="/tai-anh/app.css"></head>
<body><main>
<h1>Tải ảnh</h1>
<p>Chọn một hoặc nhiều ảnh. Ảnh được nén tự động và xoá vị trí GPS.</p>
<input id="chon" type="file" accept="image/*" multiple>
<button id="gui" disabled>Tải lên</button>
<ul id="ds"></ul>
<p id="ketthuc" hidden>Xong rồi! Quay lại Claude và nhắn “đã tải xong”.</p>
</main><script src="/tai-anh/app.js"></script></body></html>`;

const CSS = `body{font-family:system-ui,sans-serif;margin:0;background:#f7fbfc;color:#17323a}
main{max-width:640px;margin:0 auto;padding:16px}button{font-size:1rem;padding:10px 18px;margin-left:8px;border:0;border-radius:8px;background:#14a79d;color:#fff}
button:disabled{opacity:.5}li{margin:6px 0}.ok{color:#1a7f37}.loi{color:#b42318}`;

// Chạy ở trình duyệt: gửi lần lượt từng ảnh (có tiến trình), rồi đóng phiên.
const JS = `const token = location.pathname.split('/').filter(Boolean)[1];
const chon = document.getElementById('chon'), gui = document.getElementById('gui'), ds = document.getElementById('ds');
chon.onchange = () => { gui.disabled = !chon.files.length; };
gui.onclick = async () => {
  gui.disabled = true; chon.disabled = true;
  for (const f of chon.files) {
    const li = document.createElement('li'); li.textContent = f.name + ' — đang tải…'; ds.append(li);
    try {
      const fd = new FormData(); fd.append('anh', f);
      const r = await fetch('/tai-anh/' + token, { method: 'POST', body: fd });
      const d = await r.json().catch(() => ({}));
      const k = d.ketQua && d.ketQua[0];
      if (r.ok && k && k.ok) { li.textContent = f.name + ' — xong (mã ' + k.ma + ')'; li.className = 'ok'; }
      else { li.textContent = f.name + ' — lỗi: ' + ((k && k.loi) || d.loi || r.status); li.className = 'loi'; if (r.status >= 400 && !k) break; }
    } catch (e) { li.textContent = f.name + ' — lỗi mạng'; li.className = 'loi'; }
  }
  await fetch('/tai-anh/' + token + '/xong', { method: 'POST' }).catch(() => {});
  document.getElementById('ketthuc').hidden = false;
};`;

const MAX_BYTES = 30 * 1024 * 1024;
const MAX_FILES = 40;

export function taiAnhRouter(config: Config, db: Db, deps: TaiAnhDeps = {}) {
  const maxBytes = deps.toiDaByte ?? MAX_BYTES;
  const maxFiles = deps.toiDaFile ?? MAX_FILES;
  const now = deps.now ?? Date.now;
  const conDungLuong = deps.conDungLuong ?? ((d: string) => conDungLuongThat(d));
  const tmpDir = join(config.anhDir, '.upload-tmp');
  // destination dạng hàm: không tạo thư mục lúc khởi động; middleware POST bên dưới mkdir trước khi nhận file.
  const upload = multer({ storage: multer.diskStorage({ destination: (_r, _f, cb) => cb(null, tmpDir) }), limits: { fileSize: maxBytes, files: maxFiles }, defParamCharset: 'utf8' });
  const router = express.Router();

  // Tài nguyên tĩnh của trang (CSP chỉ cho phép script/style từ chính domain, không inline).
  router.get('/tai-anh/app.js', (_req, res) => res.type('js').send(JS));
  router.get('/tai-anh/app.css', (_req, res) => res.type('css').send(CSS));

  const kiemTraToken: RequestHandler = (req, res, next) => {
    const tt = trangThaiToken(String(req.params.token), now);
    if (tt === 'ok') return next();
    if (tt === 'khong-co') return void res.status(404).json({ loi: 'Link không đúng.' });
    return void res.status(410).json({ loi: 'Link đã dùng xong hoặc hết hạn. Hãy nhờ Claude tạo link mới.' });
  };

  router.get('/tai-anh/:token', kiemTraToken, (_req, res) => {
    res.set({
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy':
        "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'",
    });
    res.type('html').send(TRANG_HTML);
  });

  router.post('/tai-anh/:token/xong', kiemTraToken, (req, res) => {
    dongToken(String(req.params.token));
    res.json({ ok: true });
  });

  router.post(
    '/tai-anh/:token',
    kiemTraToken,
    async (_req, res, next) => {
      // Kiểm tra ổ đĩa TRƯỚC khi nhận file để khỏi tốn công xử lý khi sắp hết chỗ.
      try {
        await mkdir(tmpDir, { recursive: true });
        if (!(await conDungLuong(config.anhDir))) {
          return void res.status(507).json({ loi: 'Ổ đĩa trên VPS gần đầy (dưới 2 GB), tạm không nhận thêm ảnh.' });
        }
        next();
      } catch (e) {
        next(e);
      }
    },
    upload.array('anh', maxFiles),
    async (req, res, next) => {
      try {
        const nguoiId = nguoiDungCuaToken(String(req.params.token));
        const files = (req.files as Express.Multer.File[] | undefined) ?? [];
        if (!files.length) return void res.status(400).json({ loi: 'Chưa chọn ảnh nào.' });
        const ketQua: { ten: string; ok: boolean; ma?: string; loi?: string }[] = [];
        // Tuần tự từng ảnh để không vượt giới hạn RAM của container.
        for (const f of files) {
          try {
            const kq = await xuLyAnh(await readFile(f.path), config.anhDir, {});
            const { ma } = kq;
            // Vào cả thư viện ảnh của trang quản trị (cùng bảng `anh`, người tải = người đã xin link qua Claude).
            db.prepare('INSERT INTO anh (ma, ten_goc, rong, cao, byte, tai_len_luc, nguoi_dung_id) VALUES (?,?,?,?,?,?,?) ON CONFLICT(ma) DO UPDATE SET byte = excluded.byte').run(ma, f.originalname, kq.rong, kq.cao, dungLuongThuMuc(join(config.anhDir, ma)), now(), nguoiId);
            await ghiNhanAnh(config.anhDir, { ma, ten: f.originalname, luc: now() });
            ketQua.push({ ten: f.originalname, ok: true, ma });
          } catch (e) {
            if (!(e instanceof AnhKhongHopLe)) console.error('Lỗi xử lý ảnh:', (e as Error).message);
            ketQua.push({
              ten: f.originalname,
              ok: false,
              loi: e instanceof AnhKhongHopLe ? e.message : 'Lỗi khi xử lý ảnh, thử lại sau.',
            });
          } finally {
            await rm(f.path, { force: true });
          }
        }
        res.json({ ketQua });
      } catch (e) {
        next(e);
      }
    },
  );

  // Lỗi từ multer (file quá lớn, quá nhiều file) → thông báo tiếng Việt thay vì stack trace.
  router.use(((err, _req, res, next) => {
    if (err instanceof multer.MulterError) {
      const loi =
        err.code === 'LIMIT_FILE_SIZE'
          ? `ảnh quá lớn (tối đa ${Math.max(1, Math.round(maxBytes / 1024 / 1024))} MB mỗi ảnh)`
          : `quá nhiều file (tối đa ${maxFiles} ảnh mỗi lần)`;
      return void res.status(413).json({ loi: `Không nhận được file: ${loi}.` });
    }
    next(err);
  }) as express.ErrorRequestHandler);

  return router;
}
