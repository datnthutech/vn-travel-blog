// Nguồn cấp RSS: chỉ bài đã đăng (không bao giờ có nháp, kể cả ở bản preview), mới nhất trước.
import rss from '@astrojs/rss';
import { urlBai } from '@vntraveltips/schema';
import type { APIContext } from 'astro';
import { SITE } from '../config/site';
import { layBaiViet } from '../lib/bai';

export async function GET(context: APIContext) {
  const bai = (await layBaiViet()).filter((b) => !b.draft).sort((a, b) => +b.ngayDang - +a.ngayDang);
  return rss({
    title: SITE.ten,
    description: SITE.moTa,
    site: context.site!,
    items: bai.map((b) => ({ title: b.tieuDe, description: b.moTa, pubDate: b.ngayDang, link: urlBai(b) })),
    customData: '<language>vi</language>',
  });
}
