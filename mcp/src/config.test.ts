import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { loadConfig } from './config';
import { createApp } from './app';

const du = {
  GITHUB_TOKEN: 'ghp_bi_mat_khong_duoc_lo',
  GITHUB_REPO: 'chu/repo',
  PUBLIC_BASE_URL: 'https://vntraveltips.monai.click',
  PREVIEW_BASE_URL: 'https://nhap-vntraveltips.monai.click',
  ANH_DIR: '/data/anh',
  SESSION_SECRET: 'x'.repeat(32),
  GITHUB_WEBHOOK_SECRET: 'whsec_bi_mat',
  KHOA_BI_MAT: 'a'.repeat(64),
};

describe('loadConfig', () => {
  it('không còn đòi biến GitHub OAuth / ALLOWED_GITHUB_USER (MCP đăng nhập bằng tài khoản admin); GITHUB_TOKEN vẫn cần để lấy code build', () => {
    const c = loadConfig(du) as unknown as Record<string, unknown>;
    expect('allowedGithubUser' in c || 'githubOauthClientId' in c || 'githubOauthClientSecret' in c).toBe(false);
    expect(() => loadConfig({ ...du, ALLOWED_GITHUB_USER: undefined, GITHUB_OAUTH_CLIENT_ID: undefined })).not.toThrow();
  });

  it('đủ biến → trả Config, PORT mặc định 8091', () => {
    const c = loadConfig(du);
    expect(c.port).toBe(8091);
    expect(c.githubRepo).toBe('chu/repo');
    expect(c.anhDir).toBe('/data/anh');
  });

  it('thiếu GITHUB_WEBHOOK_SECRET → lỗi nêu tên biến, không in giá trị', () => {
    const { GITHUB_WEBHOOK_SECRET: _w, ...thieu } = du;
    expect(() => loadConfig(thieu)).toThrow(/GITHUB_WEBHOOK_SECRET/);
    try {
      loadConfig(thieu);
    } catch (e) {
      expect(String((e as Error).message)).not.toContain(du.GITHUB_TOKEN);
    }
  });

  it('siteDir luôn là <DATA_DIR>/site (một nguồn sự thật với quy trình build): SITE_DIR bị bỏ qua', () => {
    const c = loadConfig({ ...du, DATA_DIR: '/d', SITE_DIR: '/khac' });
    expect(c.siteDir).toBe('/d/site');
  });

  it('mặc định DATA_DIR=/data → siteDir /data/site, previewDir /data/preview', () => {
    const c = loadConfig(du);
    expect(c.dataDir).toBe('/data');
    expect(c.siteDir).toBe('/data/site');
    expect(c.previewDir).toBe('/data/preview');
  });

  it('buildEnv chỉ lấy NOINDEX_ALL và GOATCOUNTER_CODE khi có', () => {
    const c = loadConfig({ ...du, NOINDEX_ALL: 'true', KHONG_LIEN_QUAN: 'x' });
    expect(c.buildEnv).toEqual({ NOINDEX_ALL: 'true' });
  });

  it('thiếu biến → lỗi nêu tên mọi biến thiếu', () => {
    const { GITHUB_TOKEN: _a, SESSION_SECRET: _b, ...thieu } = du;
    expect(() => loadConfig(thieu)).toThrow(/GITHUB_TOKEN.*SESSION_SECRET|SESSION_SECRET.*GITHUB_TOKEN/);
  });

  it('KHOA_BI_MAT thiếu hoặc không đúng 64 hex → lỗi nêu tên biến, không in giá trị', () => {
    const { KHOA_BI_MAT: _k, ...thieu } = du;
    expect(() => loadConfig(thieu)).toThrow(/KHOA_BI_MAT/);
    for (const sai of ['a'.repeat(63), 'z'.repeat(64), 'a'.repeat(65)]) {
      expect(() => loadConfig({ ...du, KHOA_BI_MAT: sai })).toThrow(/KHOA_BI_MAT/);
      try {
        loadConfig({ ...du, KHOA_BI_MAT: sai });
      } catch (e) {
        expect(String((e as Error).message)).not.toContain(sai);
      }
    }
    expect(loadConfig(du).khoaBiMat).toBe('a'.repeat(64));
  });

  it('SESSION_SECRET ngắn hơn 32 ký tự → lỗi', () => {
    expect(() => loadConfig({ ...du, SESSION_SECRET: 'ngan' })).toThrow(/SESSION_SECRET/);
  });

  it('thông báo lỗi không chứa giá trị bí mật', () => {
    try {
      loadConfig({ ...du, SESSION_SECRET: 'ngan', GITHUB_REPO: '' });
    } catch (e) {
      expect(String((e as Error).message)).not.toContain(du.GITHUB_TOKEN);
      expect(String((e as Error).message)).not.toContain('ngan"');
    }
  });
});

describe('GET /healthz', () => {
  it('trả 200', async () => {
    const res = await request(createApp(loadConfig(du))).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
