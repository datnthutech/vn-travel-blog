import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { caiDatSiteMacDinh } from '@vntraveltips/schema';
import { beforeEach, describe, expect, it } from 'vitest';
import { khoiTaoCaiDatSite } from '../noi-dung/cai-dat-site';
import { xuatNoiDung } from '../noi-dung/xuat';
import { dungAdmin } from './thu-nghiem';

type Moi = Awaited<ReturnType<typeof dungAdmin>>;
let m: Moi;
beforeEach(async () => {
  m = await dungAdmin();
});

describe('khởi tạo từ env (chỉ lần đầu)', () => {
  it('lần đầu với NOINDEX_ALL=true → choPhepLapChiMuc=false; lần sau env đổi cũng không còn tác dụng', () => {
    expect(khoiTaoCaiDatSite(m.db, { NOINDEX_ALL: 'true', GOATCOUNTER_CODE: 'abc' })).toBe(true);
    expect(khoiTaoCaiDatSite(m.db, { NOINDEX_ALL: 'false', GOATCOUNTER_CODE: 'khac' })).toBe(false);
    const g = (m.db.prepare("SELECT gia_tri FROM cai_dat WHERE khoa = 'site'").get() as { gia_tri: string }).gia_tri;
    expect(JSON.parse(g)).toMatchObject({ choPhepLapChiMuc: false, goatcounterCode: 'abc' });
  });
});

describe('API cài đặt site', () => {
  it('GET khi chưa lưu trả mặc định; PUT lưu, xếp build, xuất cai-dat.json; ghi nhật ký (không chứa nội dung)', async () => {
    expect((await m.chinh.gui('get', '/cai-dat/site')).body.choPhepLapChiMuc).toBe(false);
    const moi = { ...caiDatSiteMacDinh({}), tenSite: 'Blog Mới', choPhepLapChiMuc: true, mangXaHoi: { facebook: 'https://facebook.com/vntraveltips' } };
    const y = m.yeuCau.so;
    const r = await m.chinh.gui('put', '/cai-dat/site', moi);
    expect(r.status).toBe(200);
    expect(m.yeuCau.so).toBe(y + 1);
    expect((await m.chinh.gui('get', '/cai-dat/site')).body).toMatchObject({ tenSite: 'Blog Mới', choPhepLapChiMuc: true });
    const d = mkdtempSync(join(tmpdir(), 'vtt-cd-'));
    xuatNoiDung(m.db, d, 'production');
    expect(JSON.parse(readFileSync(join(d, 'cai-dat.json'), 'utf8'))).toMatchObject({ tenSite: 'Blog Mới', choPhepLapChiMuc: true });
    expect(m.db.prepare("SELECT count(*) AS n FROM nhat_ky WHERE loai = 'sua-cai-dat-site'").get()).toEqual({ n: 1 });
  });

  it('URL mạng xã hội http:// → 400 nêu trường; không lưu', async () => {
    const r = await m.chinh.gui('put', '/cai-dat/site', { ...caiDatSiteMacDinh({}), mangXaHoi: { facebook: 'http://facebook.com/x' } });
    expect(r.status).toBe(400);
    expect(r.body.chiTiet.join('\n')).toMatch(/mangXaHoi\.facebook.*https/);
    expect(m.db.prepare("SELECT count(*) AS n FROM cai_dat WHERE khoa = 'site'").get()).toEqual({ n: 0 });
  });

  it('thiếu trường bắt buộc / mã GoatCounter sai → 400; chưa đăng nhập → 401', async () => {
    expect((await m.chinh.gui('put', '/cai-dat/site', { tenSite: 'x' })).status).toBe(400);
    expect((await m.chinh.gui('put', '/cai-dat/site', { ...caiDatSiteMacDinh({}), goatcounterCode: 'A B!' })).status).toBe(400);
    const { default: request } = await import('supertest');
    expect((await request(m.app).get('/api/admin/cai-dat/site')).status).toBe(401);
  });
});
