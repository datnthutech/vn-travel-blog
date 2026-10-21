// Xem trước bài và theo dõi trạng thái build.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { loadConfig } from '../config';
import { moDb } from '../db/ket-noi';
import { taoNguoiDung } from '../tai-khoan/nguoi-dung';
import { baiDayDu, dungAdmin, MK, taoAnhGia } from './thu-nghiem';

type Moi = Awaited<ReturnType<typeof dungAdmin>>;
let m: Moi;
beforeEach(async () => {
  m = await dungAdmin();
  taoAnhGia(m.anhDir, 'anh1');
});
const phien = () => Number((m.db.prepare("SELECT gia_tri FROM he_thong WHERE khoa='noi_dung_phien'").get() as { gia_tri: string }).gia_tri);

describe('POST /bai/:id/xem-truoc', () => {
  it('lưu bài, xếp lượt build, trả URL preview đúng + noiDungPhien mới', async () => {
    const { id, phienSo } = (await m.chinh.gui('post', '/bai', { bai: baiDayDu('a', { tinh: 'vung-tau' }), noiDung: 'x' })).body;
    const truocYc = m.yeuCau.so;
    const p0 = phien();
    const r = await m.chinh.gui('post', `/bai/${id}/xem-truoc`, { bai: baiDayDu('a', { tinh: 'vung-tau', tieuDe: 'Đang xem thử' }), noiDung: 'mới', phienSo });
    expect(r.status).toBe(200);
    expect(r.body.url).toBe('http://nhap.localhost:8090/vung-tau/a/');
    expect(r.body.noiDungPhien).toBe(p0 + 1);
    expect(r.body.phienSo).toBe(phienSo + 1);
    expect(m.yeuCau.so).toBe(truocYc + 1);
    expect((await m.chinh.gui('get', `/bai/${id}`)).body.bai.tieuDe).toBe('Đang xem thử');
  });

  it('bài không tỉnh → /kinh-nghiem/; xung đột phiên bản → 409 và không xếp build', async () => {
    const { id, phienSo } = (await m.chinh.gui('post', '/bai', { bai: baiDayDu('a'), noiDung: 'x' })).body;
    const r = await m.chinh.gui('post', `/bai/${id}/xem-truoc`, { bai: baiDayDu('a'), noiDung: 'y', phienSo });
    expect(r.body.url).toBe('http://nhap.localhost:8090/kinh-nghiem/a/');
    const y = m.yeuCau.so;
    const cu = await m.chinh.gui('post', `/bai/${id}/xem-truoc`, { bai: baiDayDu('a'), noiDung: 'z', phienSo });
    expect(cu.status).toBe(409);
    expect(m.yeuCau.so).toBe(y);
  });

  it('nháp còn thiếu trường → vẫn lưu nhưng báo hopLe=false kèm lỗi (preview sẽ chưa dựng được trang)', async () => {
    const { id, phienSo } = (await m.chinh.gui('post', '/bai', { bai: { tieuDe: 'Dở', slug: 'do' }, noiDung: '' })).body;
    const r = await m.chinh.gui('post', `/bai/${id}/xem-truoc`, { bai: { tieuDe: 'Dở', slug: 'do' }, noiDung: '', phienSo });
    expect(r.status).toBe(200);
    expect(r.body.hopLe).toBe(false);
    expect(r.body.loi.join('\n')).toMatch(/moTa/);
  });
});

describe('GET /api/admin/build', () => {
  it('đọc noiDungPhien từ build.json của preview và production; thiếu file → null', async () => {
    expect((await m.chinh.gui('get', '/build')).body).toMatchObject({ trangThai: 'roi', previewNoiDungPhien: null, productionNoiDungPhien: null });
    for (const [thu, n] of [['preview', 7], ['site', 5]] as const) {
      mkdirSync(join(m.config.dataDir, thu), { recursive: true });
      writeFileSync(join(m.config.dataDir, thu, 'build.json'), JSON.stringify({ sha: 'x', noiDungPhien: n }));
    }
    expect((await m.chinh.gui('get', '/build')).body).toMatchObject({ previewNoiDungPhien: 7, productionNoiDungPhien: 5 });
    writeFileSync(join(m.config.dataDir, 'preview', 'build.json'), 'không phải json');
    expect((await m.chinh.gui('get', '/build')).body.previewNoiDungPhien).toBeNull();
  });

  it('build lỗi → lanCuoi.ok=false kèm log rút gọn, không chứa token GitHub', async () => {
    const db = moDb(':memory:');
    const config = loadConfig({
      GITHUB_TOKEN: 'ghp_bi_mat_123', GITHUB_REPO: 'a/b', ALLOWED_GITHUB_USER: 'u', PUBLIC_BASE_URL: 'http://localhost:8090',
      PREVIEW_BASE_URL: 'http://nhap.localhost:8090', ANH_DIR: mkdtempSync(join(tmpdir(), 'a-')), SESSION_SECRET: 'x'.repeat(32),
      GITHUB_OAUTH_CLIENT_ID: 'i', GITHUB_OAUTH_CLIENT_SECRET: 's', GITHUB_WEBHOOK_SECRET: 'w', KHOA_BI_MAT: 'a'.repeat(64),
      DATA_DIR: mkdtempSync(join(tmpdir(), 'd-')),
    });
    // Hàng đợi THẬT với hàm build giả trả log đã che token như chay-build làm.
    const { taoHangDoiBuild } = await import('../build/hang-doi');
    const hangDoi = taoHangDoiBuild(async () => ({ ok: false as const, log: 'astro lỗi: thiếu trường *** (đã che)' }));
    hangDoi.yeuCau();
    await hangDoi.doiXong();
    const app = createApp(config, { db, hangDoi });
    await taoNguoiDung(db, { email: 'a@x.vn', ten: 'A', vaiTro: 'quan-ly', matKhau: MK });
    const dn = await request(app).post('/api/admin/dang-nhap').send({ email: 'a@x.vn', matKhau: MK });
    const c = (dn.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
    const r = await request(app).get('/api/admin/build').set('Cookie', c);
    expect(r.body.lanCuoi).toMatchObject({ ok: false, log: expect.stringContaining('astro lỗi') });
    expect(JSON.stringify(r.body)).not.toContain('ghp_bi_mat_123');
    expect(m.config.githubToken).not.toBe('ghp_bi_mat_123');
  });
});
