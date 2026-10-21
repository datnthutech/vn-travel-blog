// Cấu hình Astro. `site` là địa chỉ thật của blog — dùng cho canonical, sitemap, RSS.
// Bản preview đặt SITE_URL=https://nhap-vntraveltips.monai.click lúc build và KHÔNG có sitemap.
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { unified } from '@astrojs/markdown-remark';
import { remarkAnh } from './src/lib/remark-anh.ts';

const production = process.env.BUILD_TARGET === 'production';

export default defineConfig({
  site: process.env.SITE_URL ?? 'https://vntraveltips.monai.click',
  trailingSlash: 'always',
  build: { format: 'directory' },
  integrations: production ? [sitemap()] : [],
  // Ảnh trong thân bài viết dạng ![mô tả](anh:MÃ) → <picture> tối ưu.
  // (Astro 7: plugin remark chạy trên bộ xử lý `unified` của @astrojs/markdown-remark.)
  markdown: { processor: unified({ remarkPlugins: [remarkAnh()] }) },
});
