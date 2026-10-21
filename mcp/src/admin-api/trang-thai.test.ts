// Đăng, gỡ, thùng rác, khôi phục, xoá hẳn, nhân bản — mỗi thao tác tăng noi_dung_phien, ghi nhật ký, gọi yêu cầu build đúng 1 lần.
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { xuatNoiDung } from '../noi-dung/xuat';
import { baiDayDu, dungAdmin, taoAnhGia } from './thu-nghiem';

type Moi = Awaited<ReturnType<typeof dungAdmin>>;
let m: Moi;
beforeEach(async () => {
  m = await dungAdmin();
  taoAnhGia(m.anhDir, 'anh1');
});
const phien = () => Number((m.db.prepare("SELECT gia_tri FROM he_thong WHERE khoa='noi_dung_phien'").get() as { gia_tri: string }).gia_tri);
const tao = async (slug = 'bai-1', bai: object = baiDayDu(slug), noiDung = 'Thân bài') => (await m.chinh.gui('post', '/bai', { bai, noiDung })).body.id as number;
const production = () => {
  const d = mkdtempSync(join(tmpdir(), 'vtt-pr-'));
  xuatNoiDung(m.db, d, 'production');
  return readdirSync(join(d, 'bai-viet'));
};
const nhatKy = () => (m.db.prepare("SELECT loai FROM nhat_ky WHERE loai IN ('dang-bai','go-bai','thung-rac','xoa-han') ORDER BY id").all() as { loai: string }[]).map((x) => x.loai);

describe('đăng', () => {
  it('thiếu alt ảnh bìa → 400 nêu đường dẫn, trạng thái không đổi', async () => {
    const id = await tao('a', baiDayDu('a', { anhBia: { ma: 'anh1', alt: '' } }));
    const r = await m.chinh.gui('post', `/bai/${id}/dang`);
    expect(r.status).toBe(400);
    expect(r.body.chiTiet.join('\n')).toMatch(/anhBia\.alt/);
    expect((await m.chinh.gui('get', `/bai/${id}`)).body.trangThai).toBe('nhap');
    expect(production()).toEqual([]);
  });

  it('ảnh trong thân thiếu alt hoặc mã ảnh không có → 400', async () => {
    const id = await tao('a', baiDayDu('a'), '![](anh:anh1) và ![x](anh:khongco)');
    const r = await m.chinh.gui('post', `/bai/${id}/dang`);
    expect(r.status).toBe(400);
    expect(r.body.chiTiet.join('\n')).toMatch(/thiếu alt/);
    expect(r.body.chiTiet.join('\n')).toMatch(/khongco/);
  });

  it('đạt → đã đăng, production có bài, ngày đăng trống = hôm nay giờ VN, ghi người đăng, 1 lần yêu cầu build', async () => {
    const { ngayDang: _n, ...khongNgay } = baiDayDu('a');
    const id = await tao('a', khongNgay);
    m.dongHo.v = Date.UTC(2026, 9, 21, 17, 30); // 00:30 ngày 22 giờ VN (phiên cũ đã quá 12 giờ → đăng nhập lại)
    const chu = await m.dangNhap('chu2@x.vn', 'Chủ blog');
    const truocP = phien();
    const truocYc = m.yeuCau.so;
    expect((await chu.gui('post', `/bai/${id}/dang`)).status).toBe(200);
    const g = (await chu.gui('get', `/bai/${id}`)).body;
    expect(g).toMatchObject({ trangThai: 'da-dang', nguoiDang: { ten: 'Chủ blog' } });
    expect(String(g.bai.ngayDang).slice(0, 10)).toBe('2026-10-22');
    expect(production()).toEqual(['a.md']);
    expect(phien()).toBe(truocP + 1);
    expect(m.yeuCau.so).toBe(truocYc + 1);
    expect(nhatKy()).toEqual(['dang-bai']);
  });

  it('bài trong thùng rác không đăng được (409)', async () => {
    const id = await tao();
    await m.chinh.gui('post', `/bai/${id}/thung-rac`);
    expect((await m.chinh.gui('post', `/bai/${id}/dang`)).status).toBe(409);
  });
});

describe('gỡ, thùng rác, khôi phục, xoá hẳn', () => {
  it('gỡ bài đã đăng → về nháp, production không còn; gỡ nháp → 409', async () => {
    const id = await tao();
    expect((await m.chinh.gui('post', `/bai/${id}/go`)).status).toBe(409);
    await m.chinh.gui('post', `/bai/${id}/dang`);
    expect((await m.chinh.gui('post', `/bai/${id}/go`)).status).toBe(200);
    expect(production()).toEqual([]);
    expect((await m.chinh.gui('get', `/bai/${id}`)).body.trangThai).toBe('nhap');
  });

  it('thùng rác bài đã đăng → production không còn bài; khôi phục → bài đăng lại như cũ', async () => {
    const id = await tao();
    await m.chinh.gui('post', `/bai/${id}/dang`);
    const p0 = phien();
    const y0 = m.yeuCau.so;
    expect((await m.chinh.gui('post', `/bai/${id}/thung-rac`)).status).toBe(200);
    expect(production()).toEqual([]);
    expect(phien()).toBe(p0 + 1);
    expect(m.yeuCau.so).toBe(y0 + 1);
    expect((await m.chinh.gui('post', `/bai/${id}/thung-rac`)).status).toBe(409);
    expect((await m.chinh.gui('get', '/bai?trangThai=thung-rac')).body.tong).toBe(1);
    expect((await m.chinh.gui('post', `/bai/${id}/khoi-phuc`)).status).toBe(200);
    expect(production()).toEqual(['bai-1.md']);
    expect((await m.chinh.gui('post', `/bai/${id}/khoi-phuc`)).status).toBe(409);
  });

  it('xoá hẳn bài chưa ở thùng rác → 409; ở thùng rác → xoá sạch bài + lịch sử, ghi nhật ký', async () => {
    const id = await tao();
    expect((await m.chinh.gui('delete', `/bai/${id}`)).status).toBe(409);
    await m.chinh.gui('post', `/bai/${id}/thung-rac`);
    expect((await m.chinh.gui('delete', `/bai/${id}`)).status).toBe(200);
    expect((await m.chinh.gui('get', `/bai/${id}`)).status).toBe(404);
    expect(m.db.prepare('SELECT count(*) AS n FROM phien_ban').get()).toEqual({ n: 0 });
    expect(nhatKy()).toEqual(['thung-rac', 'xoa-han']);
  });

  it('mỗi thao tác tăng noi_dung_phien đúng 1 và gọi yêu cầu build đúng 1 lần', async () => {
    const id = await tao();
    for (const [url, method] of [[`/bai/${id}/dang`, 'post'], [`/bai/${id}/go`, 'post'], [`/bai/${id}/thung-rac`, 'post'], [`/bai/${id}/khoi-phuc`, 'post'], [`/bai/${id}/thung-rac`, 'post'], [`/bai/${id}`, 'delete']] as const) {
      const p = phien();
      const y = m.yeuCau.so;
      expect((await m.chinh.gui(method, url)).status, url).toBe(200);
      expect(phien() - p, url).toBe(1);
      expect(m.yeuCau.so - y, url).toBe(1);
    }
  });
});

describe('nhân bản', () => {
  it('bài nháp mới: tiêu đề + " (bản sao)", slug khác, tác giả là người nhân bản, giữ nội dung', async () => {
    const hai = await m.dangNhap('hai@x.vn', 'Người Hai');
    const id = await tao('goc', baiDayDu('goc'), 'Nội dung gốc');
    await m.chinh.gui('post', `/bai/${id}/dang`);
    const r = await hai.gui('post', `/bai/${id}/nhan-ban`);
    expect(r.status).toBe(201);
    const g = (await m.chinh.gui('get', `/bai/${r.body.id}`)).body;
    expect(g.trangThai).toBe('nhap');
    expect(g.bai.tieuDe).toBe('Bài goc (bản sao)');
    expect(g.bai.slug).toBe('goc-2');
    expect(g.tacGia.ten).toBe('Người Hai');
    expect(g.noiDung).toBe('Nội dung gốc');
    const r2 = await hai.gui('post', `/bai/${id}/nhan-ban`);
    expect((await m.chinh.gui('get', `/bai/${r2.body.id}`)).body.bai.slug).toBe('goc-3');
  });
});
