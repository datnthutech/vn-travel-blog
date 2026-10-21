import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app';
import { loadConfig } from './config';

const env = {
  GITHUB_TOKEN: 'ghp_thu_nghiem',
  GITHUB_REPO: 'chu/repo',
  ALLOWED_GITHUB_USER: 'chu-blog',
  PUBLIC_BASE_URL: 'https://vntraveltips.monai.click',
  PREVIEW_BASE_URL: 'https://nhap-vntraveltips.monai.click',
  ANH_DIR: '/data/anh',
  SESSION_SECRET: 'x'.repeat(32),
  GITHUB_OAUTH_CLIENT_ID: 'i',
  GITHUB_OAUTH_CLIENT_SECRET: 's',
  GITHUB_WEBHOOK_SECRET: 'whsec', KHOA_BI_MAT: 'a'.repeat(64),
};

describe('createApp: hàng đợi build', () => {
  it('/healthz trả 200 ngay cả khi build đang chạy', async () => {
    const dangBuild = {
      yeuCau() {},
      trangThai: () => ({ trangThai: 'dang-build' as const, dangCho: true, lanCuoi: null }),
      doiXong: async () => {},
    };
    const res = await request(createApp(loadConfig(env), { hangDoi: dangBuild })).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
