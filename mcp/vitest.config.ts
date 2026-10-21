// Mã hoá AVIF/WebP bằng sharp khá nặng; khi nhiều file test chạy song song thì 5 giây mặc định có thể không đủ.
import { defineConfig } from 'vitest/config';

export default defineConfig({ test: { testTimeout: 30_000 } });
