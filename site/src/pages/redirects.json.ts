// Sinh dist/redirects.json (danh sách redirect 301 đã kiểm tra) từ site/redirects.json + danh sách bài đã đăng.
// Dịch vụ MCP đọc file này để trả 301 cho các URL không còn tồn tại (nginx chuyển yêu cầu 404 sang đó).
// Redirect sai (đích không tồn tại, trùng URL bài...) → throw → build dừng, site giữ bản cũ.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { kiemTraRedirects, type Redirect } from '@vntraveltips/schema';
import { layBaiViet } from '../lib/bai';

export async function GET() {
  const redirects: Redirect[] = JSON.parse(await readFile(join(process.cwd(), 'redirects.json'), 'utf8'));
  const daDang = (await layBaiViet()).filter((b) => !b.draft);
  return new Response(JSON.stringify(kiemTraRedirects(daDang, redirects)) + '\n', {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
