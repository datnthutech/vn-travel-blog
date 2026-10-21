// API redirect 301: xem (tự động + thủ công), thêm thủ công, xoá. Kiểm tra bằng đúng luật build (`kiemTraRedirects`).
import { duongDanRedirectHopLe } from '@vntraveltips/schema';
import { Router } from 'express';
import type { HangDoiBuild } from '../build/hang-doi';
import type { Db } from '../db/ket-noi';
import { danhDauNoiDungDoi } from '../noi-dung/phien-noi-dung';
import { urlTonTaiProduction } from '../noi-dung/url-ton-tai';
import { ghiNhatKy } from '../tai-khoan/nhat-ky';

export function redirectRouter(d: { db: Db; hangDoi: HangDoiBuild; now: () => number }): Router {
  const r = Router();

  r.get('/redirect', (_req, res) => {
    const ds = d.db.prepare('SELECT tu, den, tu_dong FROM redirect ORDER BY tu').all() as { tu: string; den: string; tu_dong: number }[];
    res.json(ds.map((x) => ({ tu: x.tu, den: x.den, tuDong: x.tu_dong === 1 })));
  });

  r.post('/redirect', (req, res) => {
    const { tu, den } = (req.body ?? {}) as { tu?: unknown; den?: unknown };
    if (typeof tu !== 'string' || typeof den !== 'string') return void res.status(400).json({ loi: 'Cần gửi tu và den (đường dẫn)' });
    for (const p of [tu, den]) {
      if (!duongDanRedirectHopLe(p)) return void res.status(400).json({ loi: `Đường dẫn không hợp lệ: "${p}" (phải bắt đầu và kết thúc bằng /, chỉ gồm a-z, 0-9, dấu chấm, gạch ngang)` });
    }
    const tonTai = urlTonTaiProduction(d.db);
    if (!tonTai.has(den)) return void res.status(400).json({ loi: `Đích "${den}" không có trang nào (chỉ chuyển hướng tới trang đang đăng)` });
    if (tonTai.has(tu)) return void res.status(400).json({ loi: `"${tu}" đang là một trang có thật nên không thể chuyển hướng đi chỗ khác` });
    if (tu === den) return void res.status(400).json({ loi: 'Nguồn và đích không được trùng nhau' });
    if (d.db.prepare('SELECT 1 FROM redirect WHERE tu = ?').get(tu)) return void res.status(409).json({ loi: `"${tu}" đã có chuyển hướng` });
    d.db.transaction(() => {
      d.db.prepare('INSERT INTO redirect (tu, den, tu_dong) VALUES (?, ?, 0)').run(tu, den);
      danhDauNoiDungDoi(d.db);
    })();
    ghiNhatKy(d.db, { nguoiDungId: req.nguoiDung!.id, loai: 'them-redirect', ip: req.ip, chiTiet: { tu, den } }, d.now);
    d.hangDoi.yeuCau();
    res.status(201).json({ tu, den, tuDong: false });
  });

  r.delete('/redirect', (req, res) => {
    const tu = String(req.query.tu ?? '');
    const xoa = d.db.transaction(() => {
      const n = d.db.prepare('DELETE FROM redirect WHERE tu = ?').run(tu).changes;
      if (n > 0) danhDauNoiDungDoi(d.db);
      return n;
    })();
    if (!xoa) return void res.status(404).json({ loi: 'Không có chuyển hướng này' });
    ghiNhatKy(d.db, { nguoiDungId: req.nguoiDung!.id, loai: 'xoa-redirect', ip: req.ip, chiTiet: { tu } }, d.now);
    d.hangDoi.yeuCau();
    res.json({ ok: true });
  });

  return r;
}
