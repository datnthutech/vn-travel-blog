// Đăng nhập GitHub cho /admin (Sveltia CMS) — Sveltia chạy hoàn toàn trên trình duyệt và commit thẳng vào GitHub
// bằng token của chính chủ blog, nhưng cần một "proxy OAuth" để giữ client secret ở phía server. Đây là proxy đó.
//   /oauth/cms/auth      CMS mở popup tới đây → ta chuyển sang GitHub (scope repo)
//   /oauth/cms/callback  GitHub gọi lại → ta kiểm tra tài khoản được phép → trả token cho cửa sổ CMS qua postMessage
//   /oauth/cms/tai-anh   nút "Tải ảnh" ở /admin: đăng nhập (chỉ scope read:user) rồi chuyển thẳng sang link tải ảnh một lần
// `state` là chuỗi có chữ ký HMAC (SESSION_SECRET) gồm hạn dùng + mục đích → chống giả mạo callback, so sánh bằng timingSafeEqual.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import express from 'express';
import { taoToken } from '../anh/token';
import type { Config } from '../config';
import { dangNhapGithub } from './github-login';
import { kiemTraNguoiDung } from './oauth';

const TTL_STATE = 10 * 60_000;
type MucDich = 'cms' | 'tai-anh';

export interface CmsOauthDeps {
  fetchFn?: typeof fetch;
  now?: () => number;
}

export function cmsOauthRouter(config: Config, deps: CmsOauthDeps = {}) {
  const fetchFn = deps.fetchFn ?? fetch;
  const now = deps.now ?? Date.now;
  const origin = new URL(config.publicBaseUrl).origin;
  const callbackUrl = `${origin}/oauth/cms/callback`;

  const ky = (phan: string) => createHmac('sha256', config.sessionSecret).update(phan).digest('hex');
  const taoState = (muc: MucDich) => {
    const phan = `${now() + TTL_STATE}.${muc}.${randomBytes(12).toString('base64url')}`;
    return `${phan}.${ky(phan)}`;
  };
  function docState(state: string): MucDich | null {
    const p = state.split('.');
    if (p.length !== 4) return null;
    const [het, muc, nonce, mac] = p;
    const dung = Buffer.from(ky(`${het}.${muc}.${nonce}`));
    const nhan = Buffer.from(mac);
    if (nhan.length !== dung.length || !timingSafeEqual(nhan, dung)) return null;
    if (!(Number(het) > now())) return null;
    return muc === 'cms' || muc === 'tai-anh' ? muc : null;
  }

  const chuyenSangGithub = (res: express.Response, muc: MucDich) => {
    const u = new URL('https://github.com/login/oauth/authorize');
    u.searchParams.set('client_id', config.githubOauthClientId);
    u.searchParams.set('redirect_uri', callbackUrl);
    u.searchParams.set('scope', muc === 'cms' ? 'repo' : 'read:user');
    u.searchParams.set('state', taoState(muc));
    u.searchParams.set('allow_signup', 'false');
    res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }).redirect(u.href);
  };

  const router = express.Router();
  router.get('/oauth/cms/auth', (_req, res) => chuyenSangGithub(res, 'cms'));
  router.get('/oauth/cms/tai-anh', (_req, res) => chuyenSangGithub(res, 'tai-anh'));

  router.get('/oauth/cms/callback', async (req, res) => {
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const muc = docState(state);
    if (!muc || !code) {
      return void res.status(400).type('text').send('Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Hãy thử lại từ /admin.');
    }
    const kq = await dangNhapGithub(config, code, callbackUrl, fetchFn);
    if (!kq) return void res.status(502).type('text').send('Không đăng nhập được với GitHub.');
    if (!kiemTraNguoiDung(kq.login, config.allowedGithubUser)) {
      return void res.status(403).type('text').send('Tài khoản GitHub này không được phép dùng VNTravelTips.');
    }

    if (muc === 'tai-anh') {
      // Không cần giữ token GitHub: chỉ xác nhận "đúng chủ blog" rồi cấp link tải ảnh một lần.
      return void res.set('Cache-Control', 'no-store').redirect(`/tai-anh/${taoToken(undefined, now)}`);
    }

    // Giao thức của Decap/Sveltia: cửa sổ popup báo "authorizing:github" cho cửa sổ mở nó, đợi hồi đáp rồi gửi token.
    // Chỉ postMessage tới đúng origin của chính site (không dùng "*"), và chỉ nhận hồi đáp từ origin đó.
    const nonce = randomBytes(16).toString('base64');
    const duLieu = JSON.stringify({ token: kq.accessToken, provider: 'github' }).replace(/</g, '\\u003c');
    const goc = JSON.stringify(origin);
    res
      .set({
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer',
        'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; base-uri 'none'`,
      })
      .type('html')
      .send(`<!doctype html><html lang="vi"><meta charset="utf-8"><title>Đang đăng nhập…</title>
<body>Đang đăng nhập, cửa sổ này sẽ tự đóng…
<script nonce="${nonce}">
(function () {
  var origin = ${goc};
  var duLieu = ${duLieu};
  function gui(e) {
    if (e.origin !== origin) return;
    window.opener.postMessage('authorization:github:success:' + JSON.stringify(duLieu), origin);
    window.removeEventListener('message', gui, false);
    window.close();
  }
  window.addEventListener('message', gui, false);
  window.opener.postMessage('authorizing:github', origin);
})();
</script></body></html>`);
  });

  return router;
}
