import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { loadConfig } from '../config';
import { taoToken } from './token';
import { layAnhGanDay } from './gan-day';

let dir: string;
const env = (anhDir: string) => ({
  GITHUB_TOKEN: 't', GITHUB_REPO: 'a/b', ALLOWED_GITHUB_USER: 'u',
  PUBLIC_BASE_URL: 'https://x.test', PREVIEW_BASE_URL: 'https://y.test',
  ANH_DIR: anhDir, SESSION_SECRET: 'x'.repeat(32),
  GITHUB_OAUTH_CLIENT_ID: 'i', GITHUB_OAUTH_CLIENT_SECRET: 's', GITHUB_WEBHOOK_SECRET: 'whsec',
});
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'vtt-tai-'));
});
afterAll(() => rm(dir, { recursive: true, force: true }));

const app = (deps = {}) => createApp(loadConfig(env(dir)), deps);
const jpeg = () => sharp({ create: { width: 640, height: 480, channels: 3, background: '#e76f51' } }).jpeg().toBuffer();

describe('trang tải ảnh /tai-anh/:token', () => {
  it('token đúng → trang HTML tiếng Việt có CSP chặt', async () => {
    const t = taoToken();
    const res = await request(app()).get(`/tai-anh/${t}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Tải ảnh');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.headers['cache-control']).toContain('no-store');
  });

  it('token sai → 404 (GET và POST)', async () => {
    expect((await request(app()).get(`/tai-anh/${'0'.repeat(64)}`)).status).toBe(404);
    const res = await request(app()).post(`/tai-anh/${'0'.repeat(64)}`).attach('anh', await jpeg(), 'a.jpg');
    expect(res.status).toBe(404);
  });

  it('tải nhiều file: ảnh ok trả mã, file hỏng báo lỗi riêng, không làm hỏng file khác', async () => {
    const t = taoToken();
    const res = await request(app())
      .post(`/tai-anh/${t}`)
      .attach('anh', Buffer.from('không phải ảnh'), 'hong.jpg')
      .attach('anh', await jpeg(), 'tot.jpg');
    expect(res.status).toBe(200);
    expect(res.body.ketQua).toHaveLength(2);
    expect(res.body.ketQua[0]).toMatchObject({ ten: 'hong.jpg', ok: false });
    expect(res.body.ketQua[0].loi).toMatch(/ảnh/);
    expect(res.body.ketQua[1]).toMatchObject({ ten: 'tot.jpg', ok: true });
    expect(res.body.ketQua[1].ma).toMatch(/^[a-f0-9]{24}$/);
    expect((await readdir(join(dir, res.body.ketQua[1].ma))).includes('960.webp')).toBe(true);
    // ảnh thành công được ghi vào danh sách ảnh gần đây (cho tool liet_ke_anh)
    expect((await layAnhGanDay(dir, 50)).map((a) => a.ma)).toContain(res.body.ketQua[1].ma);
  });

  it('đóng phiên bằng /xong → các lần tải sau bị 410', async () => {
    const t = taoToken();
    expect((await request(app()).post(`/tai-anh/${t}/xong`)).status).toBe(200);
    const res = await request(app()).post(`/tai-anh/${t}`).attach('anh', await jpeg(), 'a.jpg');
    expect(res.status).toBe(410);
    expect((await request(app()).get(`/tai-anh/${t}`)).status).toBe(410);
  });

  it('token hết hạn → 410', async () => {
    const t = taoToken(1000);
    const sau = () => Date.now() + 5000;
    expect((await request(app({ now: sau })).get(`/tai-anh/${t}`)).status).toBe(410);
  });

  it('ổ gần đầy → 507, thông báo tiếng Việt, không xử lý ảnh', async () => {
    const t = taoToken();
    const truoc = (await readdir(dir)).length;
    const res = await request(app({ conDungLuong: async () => false }))
      .post(`/tai-anh/${t}`)
      .attach('anh', await jpeg(), 'a.jpg');
    expect(res.status).toBe(507);
    expect(res.body.loi).toMatch(/dung lượng|ổ đĩa/i);
    expect((await readdir(dir)).length).toBe(truoc);
  });

  it('ảnh vượt giới hạn dung lượng → 413 thông báo tiếng Việt', async () => {
    const t = taoToken();
    const res = await request(app({ toiDaByte: 1000 })).post(`/tai-anh/${t}`).attach('anh', await jpeg(), 'to.jpg');
    expect(res.status).toBe(413);
    expect(res.body.loi).toMatch(/quá lớn/);
  });

  it('quá nhiều file một lần → 413', async () => {
    const t = taoToken();
    const res = await request(app({ toiDaFile: 1 }))
      .post(`/tai-anh/${t}`)
      .attach('anh', await jpeg(), 'a.jpg')
      .attach('anh', await jpeg(), 'b.jpg');
    expect(res.status).toBe(413);
    expect(res.body.loi).toMatch(/quá nhiều file/);
  });

  it('không có file nào → 400', async () => {
    const t = taoToken();
    const res = await request(app()).post(`/tai-anh/${t}`).field('x', 'y');
    expect(res.status).toBe(400);
  });
});
