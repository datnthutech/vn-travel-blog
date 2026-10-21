// Chạy sau `astro build`: ghi dist/build.json {sha, builtAt, target, noiDungPhien}.
// noiDungPhien (env NOI_DUNG_PHIEN do chay-build đặt) là bộ đếm nội dung lúc bắt đầu build: trang quản trị so với bộ đếm
// sau khi bấm "Xem trước" để biết bản xem trước đã chứa thay đổi của mình chưa.
// MCP đọc file này ở bản preview để biết preview đã build từ commit mới nhất chưa (cổng an toàn của dang_bai).
// BUILD_SHA do tiến trình build trong container vntraveltips-mcp đặt (không phải GitHub Actions).
import { writeFileSync } from 'node:fs';

const sha = process.env.BUILD_SHA ?? 'local';
const noiDungPhien = process.env.NOI_DUNG_PHIEN ? Number(process.env.NOI_DUNG_PHIEN) : null;
const target = process.env.BUILD_TARGET === 'production' ? 'production' : 'preview';
writeFileSync('dist/build.json', JSON.stringify({ sha, builtAt: new Date().toISOString(), target, noiDungPhien }) + '\n');
console.log(`build.json: ${sha} (${target})`);
