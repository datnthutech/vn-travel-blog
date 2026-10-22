// Phục vụ giao diện quản trị (bản build của admin/ nằm ở admin/dist) tại /quan-tri.
// - Mọi đường dẫn con không phải file thật → trả index.html (SPA tự định tuyến phía trình duyệt).
// - index.html: Cache-Control no-store (luôn nhận bản mới); assets/* có tên chứa mã băm nên cache 1 năm, immutable.
// - Mọi phản hồi có X-Robots-Tag: noindex.
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import express, { Router } from 'express';

export function trangQuanTriRouter(thuMucDist: string): Router {
  const r = Router();
  const dist = resolve(thuMucDist);
  r.use((_req, res, next) => {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    next();
  });
  r.use(
    '/assets',
    express.static(join(dist, 'assets'), { immutable: true, maxAge: '1y', fallthrough: false, index: false }),
    (_err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(404).type('text/plain').send('Không tìm thấy');
    },
  );
  r.get(/.*/, (_req, res) => {
    const index = join(dist, 'index.html');
    if (!existsSync(index)) {
      res.status(503).type('text/plain').send('Trang quản trị chưa được build.');
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(index);
  });
  return r;
}
