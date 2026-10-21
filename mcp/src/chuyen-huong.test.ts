import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app';
import { loadConfig } from './config';

let dir: string;
let dataDir: string;
beforeAll(async () => {
  // Site nằm ở <DATA_DIR>/site (như trong container).
  dataDir = await mkdtemp(join(tmpdir(), 'vtt-site-'));
  dir = join(dataDir, 'site');
  await mkdir(dir);
  await writeFile(join(dir, '404.html'), '<h1>Không tìm thấy trang</h1>');
});
afterAll(() => rm(dataDir, { recursive: true, force: true }));

const app = () =>
  createApp(
    loadConfig({
      GITHUB_TOKEN: 't', GITHUB_REPO: 'a/b', ALLOWED_GITHUB_USER: 'u',
      PUBLIC_BASE_URL: 'https://x.test', PREVIEW_BASE_URL: 'https://y.test',
      ANH_DIR: '/khong/ghi/duoc', SESSION_SECRET: 'x'.repeat(32),
      GITHUB_OAUTH_CLIENT_ID: 'i', GITHUB_OAUTH_CLIENT_SECRET: 's', GITHUB_WEBHOOK_SECRET: 'whsec', KHOA_BI_MAT: 'a'.repeat(64), DATA_DIR: dataDir,
    }),
    { khongLuuOAuth: true },
  );
const dat = async (noiDung: string, mtimeSec?: number) => {
  const p = join(dir, 'redirects.json');
  await writeFile(p, noiDung);
  if (mtimeSec) await utimes(p, mtimeSec, mtimeSec);
};

describe('URL không còn tồn tại → 301 theo redirects.json, ngược lại 404', () => {
  it('có trong danh sách → 301 tới đích (cả khi thiếu dấu / cuối)', async () => {
    await dat(JSON.stringify([{ tu: '/vung-tau/a/', den: '/da-lat/a/' }]), 1000);
    const r = await request(app()).get('/vung-tau/a/');
    expect(r.status).toBe(301);
    expect(r.headers.location).toBe('/da-lat/a/');
    expect((await request(app()).get('/vung-tau/a')).headers.location).toBe('/da-lat/a/');
  });

  it('giữ nguyên HEAD; các phương thức khác không bị chuyển hướng', async () => {
    expect((await request(app()).head('/vung-tau/a/')).status).toBe(301);
    expect((await request(app()).post('/vung-tau/a/')).status).toBe(404);
  });

  it('không có trong danh sách → 404 với trang 404 của site', async () => {
    const r = await request(app()).get('/khong-co/gi-ca/');
    expect(r.status).toBe(404);
    expect(r.text).toContain('Không tìm thấy trang');
    expect(r.headers['content-type']).toMatch(/text\/html/);
  });

  it('không có file 404.html hay redirects.json → vẫn 404 chữ thường, không sập', async () => {
    const trong = await mkdtemp(join(tmpdir(), 'vtt-trong-'));
    const a = createApp(
      loadConfig({
        GITHUB_TOKEN: 't', GITHUB_REPO: 'a/b', ALLOWED_GITHUB_USER: 'u', PUBLIC_BASE_URL: 'https://x.test',
        PREVIEW_BASE_URL: 'https://y.test', ANH_DIR: '/x', SESSION_SECRET: 'x'.repeat(32),
        GITHUB_OAUTH_CLIENT_ID: 'i', GITHUB_OAUTH_CLIENT_SECRET: 's', GITHUB_WEBHOOK_SECRET: 'whsec', KHOA_BI_MAT: 'a'.repeat(64), DATA_DIR: trong,
      }),
      { khongLuuOAuth: true },
    );
    expect((await request(a).get('/bat-ky/')).status).toBe(404);
    await rm(trong, { recursive: true });
  });

  it('mục không hợp lệ trong file (CRLF, chuyển ra ngoài, //) bị bỏ qua — không thể chèn header hay open redirect', async () => {
    await dat(
      JSON.stringify([
        { tu: '/x/', den: 'https://evil.example/' },
        { tu: '/y/', den: '/z/\r\nSet-Cookie: a=b' },
        { tu: '/w/', den: '//evil.example/' },
        { tu: '/ok/', den: '/dich/' },
        'rac',
        null,
      ]),
      2000,
    );
    for (const p of ['/x/', '/y/', '/w/']) expect((await request(app()).get(p)).status, p).toBe(404);
    const ok = await request(app()).get('/ok/');
    expect(ok.status).toBe(301);
    expect(ok.headers.location).toBe('/dich/');
  });

  it('file JSON hỏng → coi như không có redirect (404), không sập', async () => {
    await dat('{hỏng', 3000);
    expect((await request(app()).get('/ok/')).status).toBe(404);
  });

  it('đọc lại khi file đổi (không cần restart hay reload nginx)', async () => {
    await dat(JSON.stringify([{ tu: '/moi/', den: '/dich-1/' }]), 4000);
    const a = app();
    expect((await request(a).get('/moi/')).headers.location).toBe('/dich-1/');
    await dat(JSON.stringify([{ tu: '/moi/', den: '/dich-2/' }]), 5000);
    expect((await request(a).get('/moi/')).headers.location).toBe('/dich-2/');
  });

  it('đường dẫn có ký tự lạ trong yêu cầu → 404, không tra cứu', async () => {
    expect((await request(app()).get('/ok/%0d%0a')).status).toBe(404);
  });

  it('không che các route thật của dịch vụ (healthz, mcp mặc định đóng)', async () => {
    expect((await request(app()).get('/healthz')).status).toBe(200);
    expect((await request(app()).post('/mcp').set('Host', 'x.test').send({})).status).toBe(401);
  });
});
