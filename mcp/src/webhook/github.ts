// Webhook GitHub: khi có push vào main (ví dụ do /admin commit), báo hàng đợi build chạy lại.
// Chữ ký HMAC-SHA256 trên body thô được kiểm tra trước; sai hoặc thiếu thì trả 401 và không nói lý do.
import { createHmac, timingSafeEqual } from 'node:crypto';
import express, { Router } from 'express';
import type { HangDoiBuild } from '../build/hang-doi';
import type { Config } from '../config';

function chuKyHopLe(nhan: string, mong: string): boolean {
  const a = Buffer.from(nhan);
  const b = Buffer.from(mong);
  // timingSafeEqual ném lỗi nếu độ dài khác nhau, nên kiểm tra độ dài trước.
  return a.length === b.length && timingSafeEqual(a, b);
}

export function webhookRouter(config: Config, hangDoi: HangDoiBuild): Router {
  const router = Router();
  // express.raw chỉ áp cho đường dẫn này, để chữ ký được tính trên đúng byte GitHub gửi.
  router.post('/webhook/github', express.raw({ type: '*/*', limit: '1mb' }), (req, res) => {
    const body: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const mong = 'sha256=' + createHmac('sha256', config.webhookSecret).update(body).digest('hex');
    if (!chuKyHopLe(req.get('X-Hub-Signature-256') ?? '', mong)) {
      res.status(401).json({ ok: false });
      return;
    }
    let su: { ref?: unknown };
    try {
      su = JSON.parse(body.toString('utf8'));
    } catch {
      res.status(400).json({ ok: false });
      return;
    }
    const suKien = req.get('X-GitHub-Event');
    if (suKien === 'ping') {
      res.json({ ok: true, pong: true });
      return;
    }
    if (suKien !== 'push' || su.ref !== 'refs/heads/main') {
      res.json({ ok: true, boQua: true });
      return;
    }
    hangDoi.yeuCau();
    res.status(202).json({ ok: true });
  });
  return router;
}
