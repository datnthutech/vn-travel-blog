// Cấu hình Vite cho trang quản trị (SPA Svelte 5). Phục vụ ở /quan-tri nên `base` là /quan-tri/.
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/quan-tri/',
  plugins: [svelte()],
  build: { outDir: 'dist', emptyOutDir: true },
  // Chạy `npm run dev -w @vntraveltips/admin`: API đi tới dịch vụ mcp đang chạy ở cổng 8091.
  server: { proxy: { '/api': 'http://127.0.0.1:8091' } },
});
