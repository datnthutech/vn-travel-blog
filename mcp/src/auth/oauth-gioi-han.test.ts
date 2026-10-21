import { describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { loadConfig } from '../config';
import { moDb } from '../db/ket-noi';
import { createOAuth, donHetHan } from './oauth';

const config = loadConfig({
  GITHUB_TOKEN: 't', GITHUB_REPO: 'a/b', ALLOWED_GITHUB_USER: 'u',
  PUBLIC_BASE_URL: 'https://x.test', PREVIEW_BASE_URL: 'https://y.test',
  ANH_DIR: '/khong/ghi/duoc', SESSION_SECRET: 'x'.repeat(32),
  GITHUB_OAUTH_CLIENT_ID: 'i', GITHUB_OAUTH_CLIENT_SECRET: 's', GITHUB_WEBHOOK_SECRET: 'whsec', KHOA_BI_MAT: 'a'.repeat(64),
});
const khach = { redirect_uris: [new URL('https://claude.ai/api/mcp/auth_callback')], token_endpoint_auth_method: 'none' } as any;

describe('giới hạn số client đăng ký (chống làm đầy 50 chỗ để chặn chủ blog)', () => {
  it('đủ 50 client chưa dùng → từ chối; sau 24 giờ client chưa dùng bị dọn → đăng ký lại được', async () => {
    let t = 1_000_000;
    const { provider } = createOAuth(config, moDb(':memory:'), { now: () => t });
    for (let i = 0; i < 50; i++) await provider.clientsStore.registerClient!(khach);
    await expect(Promise.resolve().then(() => provider.clientsStore.registerClient!(khach))).rejects.toThrow();
    t += 24 * 3600_000 + 1000;
    await expect(Promise.resolve(provider.clientsStore.registerClient!(khach))).resolves.toBeTruthy();
  });
});

describe('donHetHan', () => {
  it('xoá mục có hetHan đã qua, giữ mục còn hạn', () => {
    const m = new Map([['cu', { hetHan: 10 }], ['moi', { hetHan: 100 }]]);
    donHetHan(m, 50);
    expect([...m.keys()]).toEqual(['moi']);
  });
});

describe('trust proxy', () => {
  it('tin các địa chỉ riêng (Docker bridge 172.x đứng sau nginx) để rate limit tính theo IP khách thật qua X-Forwarded-For', () => {
    expect(createApp(config, {}).get('trust proxy')).toBe('loopback, linklocal, uniquelocal');
  });
});
