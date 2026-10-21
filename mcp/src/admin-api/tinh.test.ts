// Phục vụ SPA /quan-tri: fallback index.html cho mọi đường dẫn con, noindex, cache đúng, và /api/admin/build.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { loadConfig } from '../config';
import { moDb } from '../db/ket-noi';
import { taoNguoiDung } from '../tai-khoan/nguoi-dung';

const config = loadConfig({
  GITHUB_TOKEN: 't', GITHUB_REPO: 'a/b', ALLOWED_GITHUB_USER: 'u', PUBLIC_BASE_URL: 'http://localhost:8090',
  PREVIEW_BASE_URL: 'https://nhap.example.com', ANH_DIR: '/khong/co', SESSION_SECRET: 'x'.repeat(32),
  GITHUB_OAUTH_CLIENT_ID: 'i', GITHUB_OAUTH_CLIENT_SECRET: 's', GITHUB_WEBHOOK_SECRET: 'w', KHOA_BI_MAT: 'a'.repeat(64),
});

function dist() {
  const d = mkdtempSync(join(tmpdir(), 'vtt-admin-dist-'));
  mkdirSync(join(d, 'assets'));
  writeFileSync(join(d, 'index.html'), '<!doctype html><title>Quản trị</title><div id="app"></div>');
  writeFileSync(join(d, 'assets', 'app-abc123.js'), 'console.log(1)');
  return d;
}

describe('/quan-tri (SPA)', () => {
  const app = createApp(config, { adminDist: dist() });

  it('đường dẫn con bất kỳ → index.html, noindex, no-store', async () => {
    for (const p of ['/quan-tri/', '/quan-tri', '/quan-tri/bat-ky/duong-dan', '/quan-tri/dat-lai?token=abc']) {
      const r = await request(app).get(p);
      expect(r.status, p).toBe(200);
      expect(r.text, p).toContain('<div id="app">');
      expect(r.headers['x-robots-tag'], p).toMatch(/noindex/);
      expect(r.headers['cache-control'], p).toBe('no-store');
    }
  });

  it('assets/* cache 1 năm, immutable, noindex; file thiếu → 404 (không trả index.html)', async () => {
    const r = await request(app).get('/quan-tri/assets/app-abc123.js');
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toMatch(/max-age=31536000/);
    expect(r.headers['cache-control']).toMatch(/immutable/);
    expect(r.headers['x-robots-tag']).toMatch(/noindex/);
    const thieu = await request(app).get('/quan-tri/assets/khong-co.js');
    expect(thieu.status).toBe(404);
    expect(thieu.text).not.toContain('<div id="app">');
  });

  it('không cho đọc ngoài thư mục dist (../)', async () => {
    const r = await request(app).get('/quan-tri/assets/..%2f..%2fpackage.json');
    expect(r.status).toBe(404);
  });

  it('chưa build giao diện → 503 tiếng Việt', async () => {
    const trong = createApp(config, { adminDist: mkdtempSync(join(tmpdir(), 'vtt-trong-')) });
    const r = await request(trong).get('/quan-tri/');
    expect(r.status).toBe(503);
    expect(r.text).toMatch(/chưa được build/);
  });
});

describe('GET /api/admin/build', () => {
  it('cần đăng nhập; trả trạng thái hàng đợi build và lần sao lưu gần nhất', async () => {
    const db = moDb(':memory:');
    db.prepare("INSERT INTO he_thong (khoa, gia_tri) VALUES ('sao_luu_cuoi_luc', '1700000000000')").run();
    await taoNguoiDung(db, { email: 'a@x.vn', ten: 'A', vaiTro: 'quan-ly', matKhau: 'mat-khau-dai-12-ky-tu' });
    const hangDoi = { yeuCau() {}, trangThai: () => ({ trangThai: 'dang-build' as const, dangCho: true, lanCuoi: null }), doiXong: async () => {} };
    const app = createApp(config, { db, hangDoi, adminDist: dist() });
    expect((await request(app).get('/api/admin/build')).status).toBe(401);
    const dn = await request(app).post('/api/admin/dang-nhap').send({ email: 'a@x.vn', matKhau: 'mat-khau-dai-12-ky-tu' });
    const c = (dn.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
    const r = await request(app).get('/api/admin/build').set('Cookie', c);
    expect(r.body).toEqual({ trangThai: 'dang-build', dangCho: true, lanCuoi: null, saoLuuCuoiLuc: 1700000000000, previewNoiDungPhien: null, productionNoiDungPhien: null });
  });
});
