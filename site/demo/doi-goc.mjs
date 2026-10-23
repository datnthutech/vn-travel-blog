// Chuyển bản build demo sang chạy trong thư mục con (vd GitHub Pages: https://<user>.github.io/vn-travel-blog/).
// Site thật nằm ở gốc tên miền nên mọi đường dẫn viết dạng "/…"; script này thêm tiền tố vào href/src/srcset/action
// trong mọi file .html và báo Pagefind gắn tiền tố vào link kết quả tìm kiếm. Chỉ dùng cho bản demo, site thật không qua bước này.
// Cách dùng: node site/demo/doi-goc.mjs <thuMucWeb> </vn-travel-blog/>
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// "/x" → "/vn-travel-blog/x"; bỏ qua "//cdn…" (giao thức tương đối) và link đầy đủ https://…
export function doiHtml(html, goc) {
  const tienTo = goc.slice(0, -1); // "/vn-travel-blog"
  const doi = (u) => (u.startsWith('/') && !u.startsWith('//') ? tienTo + u : u);
  return html
    .replace(/\b(href|src|action)="([^"]*)"/g, (_, a, u) => `${a}="${doi(u)}"`)
    .replace(/\bsrcset="([^"]*)"/g, (_, v) => `srcset="${v.split(',').map((p) => p.trim().replace(/^\S+/, doi)).join(', ')}"`)
    .replace(/new PagefindUI\(\{/g, `new PagefindUI({ baseUrl: '${goc}',`);
}

async function tatCaHtml(dir) {
  const ra = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) ra.push(...(await tatCaHtml(p)));
    else if (e.name.endsWith('.html')) ra.push(p);
  }
  return ra;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [web, goc] = process.argv.slice(2);
  if (!web || !goc?.startsWith('/') || !goc.endsWith('/')) {
    console.error('Cách dùng: node site/demo/doi-goc.mjs <thuMucWeb> </thu-muc-con/>');
    process.exit(1);
  }
  const files = await tatCaHtml(web);
  for (const f of files) await writeFile(f, doiHtml(await readFile(f, 'utf8'), goc));
  console.log(`  đổi gốc ${goc} cho ${files.length} trang`);
}
