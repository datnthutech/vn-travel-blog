// Các lỗi tìm thấy khi review giai đoạn 3.
import { baiDayDu, dungAdmin, taoAnhGia } from './admin-api/thu-nghiem';
import { describe, expect, it } from 'vitest';
import { caiDatSiteMacDinh } from '@vntraveltips/schema';

const redirects = (db: Awaited<ReturnType<typeof dungAdmin>>['db']) => Object.fromEntries((db.prepare('SELECT tu, den FROM redirect').all() as { tu: string; den: string }[]).map((r) => [r.tu, r.den]));

describe('review GĐ3', () => {
  it('xoá chuyên mục sau khi đã đổi slug: redirect cũ được trỏ lại sang chuyên mục nhận, không bị mất', async () => {
    const m = await dungAdmin();
    await m.chinh.gui('put', '/chuyen-muc/an-uong', { slug: 'a' });
    expect(redirects(m.db)).toEqual({ '/chu-de/an-uong/': '/chu-de/a/' });
    await m.chinh.gui('delete', '/chuyen-muc/a?chuyenSang=vui-choi');
    expect(redirects(m.db)).toEqual({ '/chu-de/an-uong/': '/chu-de/vui-choi/', '/chu-de/a/': '/chu-de/vui-choi/' });
  });

  it('xoá tỉnh (có tỉnh nhận) sau khi đã đổi slug: redirect cũ của hub được trỏ lại', async () => {
    const m = await dungAdmin();
    const T = (slug: string) => ({ ten: slug, slug, gioiThieu: 'g', moTa: 'm', anhBia: { ma: 'x', alt: 'y' } });
    await m.chinh.gui('post', '/tinh', T('a-tinh'));
    await m.chinh.gui('post', '/tinh', T('b-tinh'));
    await m.chinh.gui('put', '/tinh/a-tinh', { slug: 'a-moi' });
    await m.chinh.gui('delete', '/tinh/a-moi?chuyenSang=b-tinh');
    expect(redirects(m.db)).toEqual({ '/a-tinh/': '/b-tinh/', '/a-moi/': '/b-tinh/' });
  });

  it('đổi slug chuyên mục/tỉnh/tag cũng đổi trong bản TỰ LƯU của bài', async () => {
    const m = await dungAdmin();
    taoAnhGia(m.anhDir, 'anh1');
    const { id, phienSo } = (await m.chinh.gui('post', '/bai', { bai: baiDayDu('a', { chuyenMuc: ['an-uong'], tags: ['cafe'] }), noiDung: 'x' })).body;
    const g = (await m.chinh.gui('get', `/bai/${id}`)).body;
    await m.chinh.gui('patch', `/bai/${id}/tu-luu`, { bai: g.bai, noiDung: 'x', phienSo });
    await m.chinh.gui('put', '/chuyen-muc/an-uong', { slug: 'am-thuc' });
    await m.chinh.gui('post', '/tag/doi-ten', { tu: 'cafe', den: 'ca-phe' });
    const tl = (await m.chinh.gui('get', `/bai/${id}`)).body.banNhapTuLuu.bai;
    expect(tl.chuyenMuc).toEqual(['am-thuc']);
    expect(tl.tags).toEqual(['ca-phe']);
  });

  it('cài đặt site: mã ảnh sai dạng hoặc không có trên máy chủ → 400; có thật → lưu được', async () => {
    const m = await dungAdmin();
    const co = caiDatSiteMacDinh({});
    for (const ma of ['../../x', 'a b']) expect((await m.chinh.gui('put', '/cai-dat/site', { ...co, favicon: { ma } })).status, ma).toBe(400);
    const khongCo = await m.chinh.gui('put', '/cai-dat/site', { ...co, logo: { ma: 'khongco1' } });
    expect(khongCo.status).toBe(400);
    expect(khongCo.body.chiTiet.join('\n')).toMatch(/logo\.ma.*không có trên máy chủ/);
    taoAnhGia(m.anhDir, 'coAnh1');
    expect((await m.chinh.gui('put', '/cai-dat/site', { ...co, favicon: { ma: 'coAnh1' }, anhChiaSeMacDinh: { ma: 'coAnh1', alt: 'x' } })).status).toBe(200);
  });
});
