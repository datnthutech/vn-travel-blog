// RSS của từng ngôn ngữ khác tiếng Việt: /<mã>/rss.xml — chỉ bài đã đăng của ngôn ngữ đó. (RSS tiếng Việt vẫn ở /rss.xml.)
import rss from '@astrojs/rss';
import { urlBai } from '@vntraveltips/schema';
import type { APIContext } from 'astro';
import { SITE } from '../../config/site';
import { layBaiViet } from '../../lib/bai';
import { chuoiDich } from '../../lib/dich-cau-truc';
import { layNgonNguPhu } from '../../lib/ngon-ngu';

export async function getStaticPaths() {
  const ra: { params: { ngonNgu: string } }[] = [];
  for (const { ma } of layNgonNguPhu()) if ((await layBaiViet(ma)).length > 0) ra.push({ params: { ngonNgu: ma } });
  return ra;
}

export async function GET(context: APIContext) {
  const ma = context.params.ngonNgu!;
  const bai = (await layBaiViet(ma)).filter((b) => !b.draft).sort((a, b) => +b.ngayDang - +a.ngayDang);
  return rss({
    title: chuoiDich('site', 'site', ma, 'tenSite', SITE.ten),
    description: chuoiDich('site', 'site', ma, 'moTaMacDinh', SITE.moTa),
    site: context.site!,
    items: bai.map((b) => ({ title: b.tieuDe, description: b.moTa, pubDate: b.ngayDang, link: `/${ma}${urlBai(b)}` })),
    customData: `<language>${ma}</language>`,
  });
}
