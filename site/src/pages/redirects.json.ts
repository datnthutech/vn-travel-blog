// Sinh dist/redirects.json (danh sách redirect 301 đã kiểm tra) từ site/redirects.json + danh sách bài đã đăng.
// Dịch vụ MCP đọc file này để trả 301 cho các URL không còn tồn tại (nginx chuyển yêu cầu 404 sang đó).
// Redirect sai (đích không tồn tại, trùng URL bài...) → throw → build dừng, site giữ bản cũ.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { kiemTraRedirects, type Redirect } from '@vntraveltips/schema';
import { layBaiViet } from '../lib/bai';

export async function GET() {
  // Build từ DB: NOI_DUNG_DIR có redirects.json do MCP xuất; ngược lại dùng site/redirects.json trong repo.
  const file = process.env.NOI_DUNG_DIR ? join(process.env.NOI_DUNG_DIR, 'redirects.json') : join(process.cwd(), 'redirects.json');
  const redirects: Redirect[] = JSON.parse(await readFile(file, 'utf8'));
  const daDang = (await layBaiViet()).filter((b) => !b.draft);
  return new Response(JSON.stringify(kiemTraRedirects(daDang, redirects)) + '\n', {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
