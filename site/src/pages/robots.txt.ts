// robots.txt sinh lúc build. Đang noindex toàn site → Disallow: /. Khi gỡ noindex (Task 17) sẽ thêm Sitemap.
import type { APIRoute } from 'astro';
import { coNoindex } from '../lib/noindex';

export const GET: APIRoute = ({ site }) => {
  const noi = coNoindex()
    ? 'User-agent: *\nDisallow: /\n'
    : `User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /tai-anh/\nDisallow: /oauth/\n\nSitemap: ${new URL('sitemap-index.xml', site)}\n`;
  return new Response(noi, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
