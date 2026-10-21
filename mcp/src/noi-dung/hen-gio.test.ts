// Hẹn giờ đăng theo giờ Việt Nam khi máy chủ chạy UTC (Review Focus 4).
import { beforeEach, describe, expect, it } from 'vitest';
import { baiDayDu, dungAdmin, taoAnhGia } from '../admin-api/thu-nghiem';
import { dangBaiDenHan, epochSangGioVN, gioVNSangEpoch, xuLyHenGio } from './hen-gio';

process.env.TZ = 'UTC';

type Moi = Awaited<ReturnType<typeof dungAdmin>>;
let m: Moi;
beforeEach(async () => {
  m = await dungAdmin();
  taoAnhGia(m.anhDir, 'anh1');
});
const tao = async (slug: string) => (await m.chinh.gui('post', '/bai', { bai: baiDayDu(slug), noiDung: 'x' })).body.id as number;
const trangThai = (id: number) => (m.db.prepare("SELECT trang_thai AS t FROM ban_dich WHERE bai_id = ?").get(id) as { t: string }).t;

describe('đổi giờ', () => {
  it('giờ VN ↔ epoch, không phụ thuộc TZ máy', () => {
    expect(gioVNSangEpoch('2026-11-01T07:00')).toBe(Date.UTC(2026, 10, 1, 0, 0));
    expect(gioVNSangEpoch('2026-11-01T00:00')).toBe(Date.UTC(2026, 9, 31, 17, 0));
    expect(epochSangGioVN(Date.UTC(2026, 9, 31, 17, 0))).toBe('2026-11-01T00:00');
    expect(epochSangGioVN(gioVNSangEpoch('2026-12-31T23:59'))).toBe('2026-12-31T23:59');
  });
  it('sai định dạng hoặc ngày không có thật → ném lỗi', () => {
    for (const s of ['', '2026-11-01', '2026-11-01 07:00', '2026-02-30T10:00', '2026-11-01T25:00', '2026-11-01T07:60']) expect(() => gioVNSangEpoch(s), s).toThrow();
  });
});

describe('API hẹn giờ', () => {
  it('hẹn trong quá khứ → 400; sai định dạng → 400; thiếu luật (moTa) → 400', async () => {
    const id = await tao('a');
    const { moTa: _m, ...thieu } = baiDayDu('b');
    const b = (await m.chinh.gui('post', '/bai', { bai: thieu, noiDung: 'x' })).body.id;
    m.dongHo.v = Date.UTC(2026, 10, 1, 0, 0);
    const c = await m.dangNhap('c@x.vn', 'C'); // phiên cũ đã quá hạn khi đồng hồ nhảy tới
    expect((await c.gui('post', `/bai/${id}/hen-gio`, { luc: '2026-11-01T07:00' })).status).toBe(400); // = đúng bây giờ
    expect((await c.gui('post', `/bai/${id}/hen-gio`, { luc: '2026-10-30T07:00' })).status).toBe(400);
    expect((await c.gui('post', `/bai/${id}/hen-gio`, { luc: 'mai' })).status).toBe(400);
    const r = await c.gui('post', `/bai/${b}/hen-gio`, { luc: '2026-11-02T07:00' });
    expect(r.status).toBe(400);
    expect(r.body.chiTiet.join('\n')).toMatch(/moTa/);
  });

  it('hẹn đúng → trạng thái hen-gio, hiển thị giờ VN; huỷ → về nháp; huỷ khi chưa hẹn → 409', async () => {
    const id = await tao('a');
    expect((await m.chinh.gui('post', `/bai/${id}/huy-hen-gio`)).status).toBe(409);
    const r = await m.chinh.gui('post', `/bai/${id}/hen-gio`, { luc: '2026-11-01T07:00' });
    expect(r.body).toMatchObject({ ok: true, gioVN: '2026-11-01T07:00' });
    const g = (await m.chinh.gui('get', `/bai/${id}`)).body;
    expect(g.trangThai).toBe('hen-gio');
    expect(g.henGio).toBe(Date.UTC(2026, 10, 1, 0, 0));
    expect((await m.chinh.gui('post', `/bai/${id}/huy-hen-gio`)).status).toBe(200);
    expect(trangThai(id)).toBe('nhap');
  });
});

describe('dangBaiDenHan (Review Focus 4)', () => {
  it('hẹn 2026-11-01T07:00 VN: lúc 00:00Z đăng, lúc 23:59Z hôm trước thì chưa; người đăng = người hẹn', async () => {
    const id = await tao('a');
    await m.chinh.gui('post', `/bai/${id}/hen-gio`, { luc: '2026-11-01T07:00' });
    expect(dangBaiDenHan(m.db, Date.UTC(2026, 9, 31, 23, 59))).toEqual([]);
    expect(trangThai(id)).toBe('hen-gio');
    expect(dangBaiDenHan(m.db, Date.UTC(2026, 10, 1, 0, 0))).toEqual([id]);
    expect(trangThai(id)).toBe('da-dang');
    const nguoiDang = (m.db.prepare('SELECT nguoi_dang_id AS n FROM bai WHERE id = ?').get(id) as { n: number }).n;
    expect(nguoiDang).toBe(m.chinh.nguoi.id);
    expect(m.db.prepare("SELECT count(*) AS n FROM nhat_ky WHERE loai = 'dang-bai'").get()).toEqual({ n: 1 });
    expect(dangBaiDenHan(m.db, Date.UTC(2026, 10, 1, 1, 0))).toEqual([]); // không đăng lại
  });

  it('bài hẹn giờ nhưng bị chuyển thùng rác → không đăng', async () => {
    const id = await tao('a');
    await m.chinh.gui('post', `/bai/${id}/hen-gio`, { luc: '2026-11-01T07:00' });
    await m.chinh.gui('post', `/bai/${id}/thung-rac`);
    expect(dangBaiDenHan(m.db, Date.UTC(2026, 10, 2))).toEqual([]);
    expect(trangThai(id)).toBe('hen-gio');
  });

  it('hai bài đến hạn cùng lượt → đăng cả hai, yêu cầu build đúng một lần; không có bài → không gọi', async () => {
    const a = await tao('a');
    const b = await tao('b');
    await m.chinh.gui('post', `/bai/${a}/hen-gio`, { luc: '2026-11-01T07:00' });
    await m.chinh.gui('post', `/bai/${b}/hen-gio`, { luc: '2026-11-01T07:05' });
    const truoc = m.yeuCau.so;
    expect(xuLyHenGio(m.db, m.hangDoi, Date.UTC(2026, 9, 31, 23, 0))).toEqual([]);
    expect(m.yeuCau.so).toBe(truoc);
    expect(xuLyHenGio(m.db, m.hangDoi, Date.UTC(2026, 10, 1, 0, 30)).sort()).toEqual([a, b].sort());
    expect(m.yeuCau.so).toBe(truoc + 1);
  });

  it('bài đã đăng lên production sau khi tới hạn (xuất nội dung có bài)', async () => {
    const { xuatNoiDung } = await import('./xuat');
    const { mkdtempSync, readdirSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const id = await tao('a');
    await m.chinh.gui('post', `/bai/${id}/hen-gio`, { luc: '2026-11-01T07:00' });
    const prod = () => { const d = mkdtempSync(join(tmpdir(), 'vtt-hg-')); xuatNoiDung(m.db, d, 'production'); return readdirSync(join(d, 'bai-viet')); };
    expect(prod()).toEqual([]);
    dangBaiDenHan(m.db, Date.UTC(2026, 10, 1, 0, 0));
    expect(prod()).toEqual(['a.md']);
  });
});
