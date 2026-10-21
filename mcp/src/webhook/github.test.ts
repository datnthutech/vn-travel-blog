import { createHmac } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import type { Config } from '../config';
import type { HangDoiBuild } from '../build/hang-doi';
import { webhookRouter } from './github';

const SECRET = 'whsec_thu_nghiem';

function hangDoiGia() {
  const yeuCau = vi.fn();
  const hd: HangDoiBuild = {
    yeuCau,
    trangThai: () => ({ trangThai: 'roi', dangCho: false, lanCuoi: null }),
    doiXong: async () => {},
  };
  return { hd, yeuCau };
}

function appTest(hd: HangDoiBuild) {
  const config = { webhookSecret: SECRET } as Config;
  const app = express();
  app.use(webhookRouter(config, hd));
  return app;
}

const ky = (body: string, secret = SECRET) => 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');

const pushMain = JSON.stringify({ ref: 'refs/heads/main', after: 'a'.repeat(40) });

describe('POST /webhook/github', () => {
  it('push vào refs/heads/main + chữ ký đúng → 202 và yeuCau() 1 lần', async () => {
    const { hd, yeuCau } = hangDoiGia();
    const res = await request(appTest(hd))
      .post('/webhook/github')
      .set('Content-Type', 'application/json')
      .set('X-GitHub-Event', 'push')
      .set('X-Hub-Signature-256', ky(pushMain))
      .send(pushMain);
    expect(res.status).toBe(202);
    expect(yeuCau).toHaveBeenCalledTimes(1);
  });

  it('chữ ký sai, thiếu header, hoặc ký trên body khác → 401, không build, không lộ lý do', async () => {
    const { hd, yeuCau } = hangDoiGia();
    const app = appTest(hd);
    const sai = await request(app)
      .post('/webhook/github')
      .set('X-GitHub-Event', 'push')
      .set('X-Hub-Signature-256', ky(pushMain, 'khac'))
      .send(pushMain);
    const thieu = await request(app).post('/webhook/github').set('X-GitHub-Event', 'push').send(pushMain);
    const bodyKhac = await request(app)
      .post('/webhook/github')
      .set('X-GitHub-Event', 'push')
      .set('X-Hub-Signature-256', ky(pushMain))
      .send(pushMain.replace('main', 'main2'));
    for (const r of [sai, thieu, bodyKhac]) {
      expect(r.status).toBe(401);
      expect(JSON.stringify(r.body)).not.toMatch(/sai|thiếu|khớp|signature/i);
    }
    expect(yeuCau).not.toHaveBeenCalled();
  });

  it('push vào nhánh khác → 200 bỏ qua, không build', async () => {
    const { hd, yeuCau } = hangDoiGia();
    const body = JSON.stringify({ ref: 'refs/heads/chuyen-doi-docker' });
    const res = await request(appTest(hd))
      .post('/webhook/github')
      .set('X-GitHub-Event', 'push')
      .set('X-Hub-Signature-256', ky(body))
      .send(body);
    expect(res.status).toBe(200);
    expect(yeuCau).not.toHaveBeenCalled();
  });

  it('ping → 200, sự kiện khác → 200 bỏ qua, không build', async () => {
    const { hd, yeuCau } = hangDoiGia();
    const app = appTest(hd);
    for (const ev of ['ping', 'issues']) {
      const res = await request(app)
        .post('/webhook/github')
        .set('X-GitHub-Event', ev)
        .set('X-Hub-Signature-256', ky(pushMain))
        .send(pushMain);
      expect(res.status).toBe(200);
    }
    expect(yeuCau).not.toHaveBeenCalled();
  });

  it('body không phải JSON nhưng chữ ký đúng → 400, không build', async () => {
    const { hd, yeuCau } = hangDoiGia();
    const body = 'khong-phai-json';
    const res = await request(appTest(hd))
      .post('/webhook/github')
      .set('X-GitHub-Event', 'push')
      .set('X-Hub-Signature-256', ky(body))
      .send(body);
    expect(res.status).toBe(400);
    expect(yeuCau).not.toHaveBeenCalled();
  });

  it('chữ ký khác độ dài không làm server ném lỗi (trả 401)', async () => {
    const { hd } = hangDoiGia();
    const res = await request(appTest(hd))
      .post('/webhook/github')
      .set('X-GitHub-Event', 'push')
      .set('X-Hub-Signature-256', 'sha256=ngan')
      .send(pushMain);
    expect(res.status).toBe(401);
  });
});
