import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { xuatNoiDung } from '../noi-dung/xuat';
import { dungAdmin } from './thu-nghiem';

type Moi = Awaited<ReturnType<typeof dungAdmin>>;
let m: Moi;
beforeEach(async () => {
  m = await dungAdmin();
});
const MENU = { dauTrang: [{ nhan: 'Điểm đến', loai: 'link', giaTri: '/', con: [{ nhan: 'Vũng Tàu', loai: 'tinh', giaTri: 'vung-tau' }] }], chanTrang: [{ nhan: 'Giới thiệu', loai: 'trang', giaTri: 'gioi-thieu' }] };

describe('menu', () => {
  it('chưa lưu → GET trả menu rỗng; lưu → GET trả đúng, xếp build, xuất menu.json', async () => {
    expect((await m.chinh.gui('get', '/menu')).body).toEqual({ dauTrang: [], chanTrang: [] });
    const d0 = mkdtempSync(join(tmpdir(), 'vtt-m-'));
    xuatNoiDung(m.db, d0, 'preview');
    expect(existsSync(join(d0, 'menu.json'))).toBe(false); // chưa lưu → site dùng menu mặc định
    const y = m.yeuCau.so;
    expect((await m.chinh.gui('put', '/menu', MENU)).status).toBe(200);
    expect(m.yeuCau.so).toBe(y + 1);
    expect((await m.chinh.gui('get', '/menu')).body).toEqual(MENU);
    const d = mkdtempSync(join(tmpdir(), 'vtt-m-'));
    xuatNoiDung(m.db, d, 'production');
    expect(JSON.parse(readFileSync(join(d, 'menu.json'), 'utf8'))).toEqual(MENU);
  });

  it('menu lồng 2 cấp → 400 nêu lý do; không lưu', async () => {
    const hong = { dauTrang: [{ nhan: 'A', loai: 'link', giaTri: '/', con: [{ nhan: 'B', loai: 'link', giaTri: '/b/', con: [{ nhan: 'C', loai: 'link', giaTri: '/c/' }] }] }], chanTrang: [] };
    const r = await m.chinh.gui('put', '/menu', hong);
    expect(r.status).toBe(400);
    expect(r.body.chiTiet.join('\n')).toMatch(/lồng 1 cấp/);
    expect((await m.chinh.gui('get', '/menu')).body).toEqual({ dauTrang: [], chanTrang: [] });
  });

  it('link javascript:alert(1) → 400, không lưu', async () => {
    const r = await m.chinh.gui('put', '/menu', { dauTrang: [{ nhan: 'x', loai: 'link', giaTri: 'javascript:alert(1)' }], chanTrang: [] });
    expect(r.status).toBe(400);
    expect(r.body.chiTiet.join('\n')).toMatch(/https/);
    expect(m.db.prepare("SELECT count(*) AS n FROM cai_dat WHERE khoa = 'menu'").get()).toEqual({ n: 0 });
  });

  it('thiếu trường / không phải đối tượng → 400; chưa đăng nhập → 401', async () => {
    expect((await m.chinh.gui('put', '/menu', { dauTrang: [] })).status).toBe(400);
    expect((await m.chinh.gui('put', '/menu', 'x' as never)).status).toBe(400);
    const { default: request } = await import('supertest');
    expect((await request(m.app).get('/api/admin/menu')).status).toBe(401);
  });
});
