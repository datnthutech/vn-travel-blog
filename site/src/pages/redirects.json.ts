// Sinh dist/redirects.json (danh sách redirect 301 đã kiểm tra) từ site/redirects.json + danh sách bài đã đăng.
// Dịch vụ MCP đọc file này để trả 301 cho các URL không còn tồn tại (nginx chuyển yêu cầu 404 sang đó).
// Redirect sai (đích không tồn tại, trùng URL bài...) → throw → build dừng, site giữ bản cũ.
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { kiemTraRedirects, urlChuyenMuc, urlTinh, urlTrang, type Redirect } from '@vntraveltips/schema';
import { layTrang } from '../lib/trang';
import { layChuyenMuc } from '../lib/chuyen-muc';
import { layBaiViet, layTinh } from '../lib/bai';

export async function GET() {
  // Build từ DB: NOI_DUNG_DIR có redirects.json do MCP xuất; ngược lại dùng site/redirects.json trong repo.
  const tuDb = process.env.NOI_DUNG_DIR ? join(process.env.NOI_DUNG_DIR, 'redirects.json') : '';
  const file = tuDb && existsSync(tuDb) ? tuDb : join(process.cwd(), 'redirects.json');
  const redirects: Redirect[] = JSON.parse(await readFile(file, 'utf8'));
  const tatCa = await layBaiViet();
  const daDang = tatCa.filter((b) => !b.draft);
  // Trang chuyên mục (chỉ khi có bài, kể cả nháp ở bản preview — giống MCP khi xuất) và trang tỉnh cũng là đích hợp lệ của redirect.
  const urlKhac = [
    ...layChuyenMuc().filter((c) => tatCa.some((b) => b.chuyenMuc.includes(c.slug))).map((c) => urlChuyenMuc(c.slug)),
    ...(await layTinh()).map((t) => urlTinh(t.slug)),
    ...(await layTrang()).map((t) => urlTrang(t.slug)),
  ];
  return new Response(JSON.stringify(kiemTraRedirects(daDang, redirects, urlKhac)) + '\n', {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
