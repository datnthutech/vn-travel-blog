// Đồ dùng chung cho test API admin: dựng app với DB trong bộ nhớ, đồng hồ giả, hàng đợi build giả và người dùng đã đăng nhập.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { createApp, type AppDeps } from '../app';
import type { HangDoiBuild } from '../build/hang-doi';
import { loadConfig } from '../config';
import { moDb } from '../db/ket-noi';
import { taoNguoiDung } from '../tai-khoan/nguoi-dung';
import type { VaiTro } from '../tai-khoan/quyen';

export const MK = 'mat-khau-dai-12-ky-tu';

export interface PhienThu {
  cookie: string;
  csrf: string;
  nguoi: { id: number; email: string };
  gui: (method: 'get' | 'post' | 'put' | 'patch' | 'delete', url: string, body?: object) => request.Test;
}

export async function dungAdmin(opt: { vaiTro?: VaiTro; email?: string; deps?: Partial<AppDeps> } = {}) {
  const db = moDb(':memory:');
  const anhDir = mkdtempSync(join(tmpdir(), 'vtt-anh-'));
  const dongHo = { v: Date.UTC(2026, 9, 21, 3, 0, 0) };
  const yeuCau = { so: 0 };
  const hangDoi: HangDoiBuild = {
    yeuCau: () => void yeuCau.so++,
    trangThai: () => ({ trangThai: 'roi', dangCho: false, lanCuoi: null }),
    doiXong: async () => {},
  };
  const config = loadConfig({
    GITHUB_TOKEN: 't', GITHUB_REPO: 'a/b', ALLOWED_GITHUB_USER: 'u', PUBLIC_BASE_URL: 'http://localhost:8090',
    PREVIEW_BASE_URL: 'http://nhap.localhost:8090', ANH_DIR: anhDir, SESSION_SECRET: 'x'.repeat(32),
    GITHUB_OAUTH_CLIENT_ID: 'i', GITHUB_OAUTH_CLIENT_SECRET: 's', GITHUB_WEBHOOK_SECRET: 'w', KHOA_BI_MAT: 'a'.repeat(64),
    DATA_DIR: mkdtempSync(join(tmpdir(), 'vtt-data-')),
  });
  const app = createApp(config, { db, now: () => dongHo.v, hangDoi, cho: async () => {}, ...opt.deps });
  let dem = 0;
  async function dangNhap(email: string, ten: string, vaiTro: VaiTro = opt.vaiTro ?? 'quan-ly'): Promise<PhienThu> {
    const nguoi = await taoNguoiDung(db, { email, ten, vaiTro, matKhau: MK }, () => dongHo.v);
    const ip = `10.1.1.${++dem}`;
    const r = await request(app).post('/api/admin/dang-nhap').set('X-Forwarded-For', ip).send({ email, matKhau: MK });
    const cookie = (r.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
    const csrf = (await request(app).get('/api/admin/toi').set('Cookie', cookie)).body.csrf as string;
    return {
      cookie, csrf, nguoi,
      gui: (method, url, body) => {
        const q = request(app)[method](`/api/admin${url}`).set('Cookie', cookie).set('X-CSRF-Token', csrf);
        return body === undefined ? q : q.send(body);
      },
    };
  }
  const chinh = await dangNhap(opt.email ?? 'chu@x.vn', 'Chủ blog');
  return { app, db, config, anhDir, dongHo, yeuCau, hangDoi, chinh, dangNhap };
}

/** Tạo thư mục ảnh giả (đủ để `kiemTraBai` coi mã ảnh là có thật). */
export function taoAnhGia(anhDir: string, ma: string): void {
  mkdirSync(join(anhDir, ma), { recursive: true });
  writeFileSync(join(anhDir, ma, 'meta.json'), '{"rong":1600,"cao":1067}');
}

/** Bài đầy đủ hợp lệ (đã có ảnh `anh1` trong thư mục ảnh giả). */
export const baiDayDu = (slug: string, over: Record<string, unknown> = {}) => ({
  tieuDe: `Bài ${slug}`, slug, moTa: 'a'.repeat(130), loai: 'top-list', anhBia: { ma: 'anh1', alt: 'Biển' },
  ngayDang: '2026-10-19', ...over,
});
