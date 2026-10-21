// Chạy sau `astro build`: ghi dist/build.json {sha, builtAt, target}.
// MCP đọc file này ở bản preview để biết preview đã build từ commit mới nhất chưa (cổng an toàn của dang_bai).
// BUILD_SHA do tiến trình build trong container vntraveltips-mcp đặt (không phải GitHub Actions).
import { writeFileSync } from 'node:fs';

const sha = process.env.BUILD_SHA ?? 'local';
const target = process.env.BUILD_TARGET === 'production' ? 'production' : 'preview';
writeFileSync('dist/build.json', JSON.stringify({ sha, builtAt: new Date().toISOString(), target }) + '\n');
console.log(`build.json: ${sha} (${target})`);
