// Chạy sau `astro build`: ghi dist/build.json {sha, builtAt, target, noiDungPhien}.
// noiDungPhien (env NOI_DUNG_PHIEN do chay-build đặt) là bộ đếm nội dung lúc bắt đầu build: trang quản trị so với bộ đếm
// sau khi bấm "Xem trước" để biết bản xem trước đã chứa thay đổi của mình chưa.
// MCP đọc file này ở bản preview để biết preview đã build từ commit mới nhất chưa (cổng an toàn của dang_bai).
// BUILD_SHA do tiến trình build trong container vntraveltips-mcp đặt (không phải GitHub Actions).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const sha = process.env.BUILD_SHA ?? 'local';
const noiDungPhien = process.env.NOI_DUNG_PHIEN ? Number(process.env.NOI_DUNG_PHIEN) : null;
const target = process.env.BUILD_TARGET === 'production' ? 'production' : 'preview';
// Khoá giao diện (site/src/i18n/vi.json) còn thiếu ở từng ngôn ngữ ĐANG BẬT (ngon-ngu.json + giao-dien/<mã>.json trong NOI_DUNG_DIR):
// trang quản trị hiện ở Tổng quan để chủ blog biết cần dịch thêm. Không có NOI_DUNG_DIR → {}.
const giaoDienThieu = {};
const noiDungDir = process.env.NOI_DUNG_DIR;
if (noiDungDir && existsSync(join(noiDungDir, 'ngon-ngu.json'))) {
  const docJson = (f, macDinh) => {
    try {
      return JSON.parse(readFileSync(f, 'utf8'));
    } catch {
      return macDinh;
    }
  };
  const vi = docJson(join(import.meta.dirname, '..', 'src', 'i18n', 'vi.json'), {});
  for (const n of docJson(join(noiDungDir, 'ngon-ngu.json'), [])) {
    if (n.ma === 'vi') continue;
    const f = join(noiDungDir, 'giao-dien', `${n.ma}.json`);
    const d = existsSync(f) ? docJson(f, {}) : {};
    const thieu = Object.keys(vi).filter((k) => typeof d[k] !== 'string' || d[k] === '');
    if (thieu.length > 0) giaoDienThieu[n.ma] = thieu;
  }
}
writeFileSync('dist/build.json', JSON.stringify({ sha, builtAt: new Date().toISOString(), target, noiDungPhien, giaoDienThieu }) + '\n');
console.log(`build.json: ${sha} (${target})`);
