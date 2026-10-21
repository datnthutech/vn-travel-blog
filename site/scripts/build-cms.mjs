// Chạy sau `astro build`: hoàn thiện thư mục /admin trong dist.
//  - Copy script Sveltia CMS từ gói npm (tự host, không phụ thuộc CDN).
//  - Sinh config.yml từ admin/config.template.yml, điền repo GitHub và địa chỉ site.
// Dùng: node scripts/build-cms.mjs [thư-mục-dist]
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const dist = process.argv[2] ?? 'dist';
const repo = process.env.GITHUB_REPO ?? 'OWNER/REPO'; // tiến trình build trong container mcp đặt biến này
const siteUrl = (process.env.SITE_URL ?? 'https://vntraveltips.monai.click').replace(/\/$/, '');

// /admin là công cụ của chủ blog trên host chính; bản preview dùng chung dữ liệu nên cũng build (vô hại).
// Gói chỉ xuất "." (→ npm/index.js) nên resolve nó, rồi lấy bản dùng trực tiếp trên trình duyệt ở ../dist/sveltia-cms.js.
const sveltia = join(dirname(createRequire(import.meta.url).resolve('@sveltia/cms')), '..', 'dist', 'sveltia-cms.js');
mkdirSync(join(dist, 'admin'), { recursive: true });
copyFileSync(sveltia, join(dist, 'admin/sveltia-cms.js'));

const mau = readFileSync('admin/config.template.yml', 'utf8');
writeFileSync(join(dist, 'admin/config.yml'), mau.replaceAll('__GITHUB_REPO__', repo).replaceAll('__SITE_URL__', siteUrl));
console.log(`admin: repo=${repo}, site=${siteUrl}`);
