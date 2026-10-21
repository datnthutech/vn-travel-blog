// Gom test của mọi workspace để chạy bằng một lệnh `npm test` ở thư mục gốc.
// (vitest ≥ 4 bỏ file vitest.workspace.ts; danh sách dự án giờ nằm ở test.projects.)
import { defineConfig } from 'vitest/config';

export default defineConfig({ test: { projects: ['packages/*', 'site', 'mcp', 'deploy'] } });
