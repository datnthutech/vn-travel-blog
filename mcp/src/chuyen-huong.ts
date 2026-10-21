// Trả 301 cho URL bài đã đổi (vd đổi tỉnh) và 404 cho mọi URL khác không có file.
// nginx phục vụ file tĩnh trước; chỉ khi `try_files` không thấy file mới chuyển yêu cầu sang đây (xem deploy/web/nginx.conf).
// Danh sách redirect lấy từ <DATA_DIR>/site/redirects.json (site ghi lúc build; site/ là symlink tới bản production đang phục vụ).
// Đọc lại mỗi khi file đổi → không cần reload nginx hay khởi động lại container. Mọi mục được kiểm tra lại bằng cùng luật
// đường dẫn an toàn với lúc build, nên dù file bị sửa trái phép cũng không thể chèn header hay chuyển hướng ra ngoài site.
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { duongDanRedirectHopLe } from '@vntraveltips/schema';
import type { RequestHandler } from 'express';
import type { Config } from './config';

export function chuyenHuongHandler(config: Config): RequestHandler {
  const tep = join(config.siteDir, 'redirects.json');
  let cache: { mtimeMs: number; size: number; map: Map<string, string> } | null = null;

  async function layBang(): Promise<Map<string, string>> {
    try {
      const s = await stat(tep);
      if (cache && cache.mtimeMs === s.mtimeMs && cache.size === s.size) return cache.map;
      const map = new Map<string, string>();
      const d = JSON.parse(await readFile(tep, 'utf8'));
      if (Array.isArray(d)) {
        for (const r of d) {
          if (r && typeof r.tu === 'string' && typeof r.den === 'string' && duongDanRedirectHopLe(r.tu) && duongDanRedirectHopLe(r.den)) {
            map.set(r.tu, r.den);
          }
        }
      }
      cache = { mtimeMs: s.mtimeMs, size: s.size, map };
      return map;
    } catch {
      return new Map(); // chưa có file hoặc file hỏng → không redirect
    }
  }

  return async (req, res) => {
    if (req.method === 'GET' || req.method === 'HEAD') {
      const p = req.path.endsWith('/') ? req.path : `${req.path}/`;
      const den = duongDanRedirectHopLe(p) ? (await layBang()).get(p) : undefined;
      if (den) return void res.redirect(301, den);
    }
    try {
      res.status(404).type('html').send(await readFile(join(config.siteDir, '404.html'), 'utf8'));
    } catch {
      res.status(404).type('text').send('Không tìm thấy trang.');
    }
  };
}
