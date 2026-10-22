// Thư viện ảnh: tải nhiều ảnh (tuần tự), liệt kê, sửa alt, "đang dùng ở", xoá có chặn, đồng bộ khi khởi động.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { beforeEach, describe, expect, it } from 'vitest';
import { timAnhDungOBai } from '../noi-dung/anh-dung-o-dau';
import { dongBoAnh } from './anh';
import { baiDayDu, dungAdmin, taoAnhGia } from './thu-nghiem';

type Moi = Awaited<ReturnType<typeof dungAdmin>>;
let m: Moi;
let jpeg: Buffer;
beforeEach(async () => {
  m = await dungAdmin();
  jpeg = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#264653' } }).jpeg().toBuffer();
});

const tai = (phien: Moi['chinh'], files: [Buffer, string][]) => {
  let q = phien.gui('post', '/anh');
  for (const [b, ten] of files) q = q.attach('files', b, ten);
  return q;
};

describe('tải ảnh', () => {
  it('2 ảnh hợp lệ + 1 file txt → 2 ok, 1 lỗi; ảnh nằm trong bảng và trên đĩa', async () => {
    const r = await tai(m.chinh, [[jpeg, 'a.jpg'], [jpeg, 'b.jpg'], [Buffer.from('xin chào'), 'ghi-chu.txt']]);
    expect(r.status).toBe(200);
    expect(r.body.ok).toHaveLength(2);
    expect(r.body.loi).toEqual([{ ten: 'ghi-chu.txt', loi: expect.stringMatching(/Không đọc được/) }]);
    for (const a of r.body.ok) expect(existsSync(join(m.anhDir, a.ma, '480.webp'))).toBe(true);
    const ds = (await m.chinh.gui('get', '/anh')).body;
    expect(ds.tong).toBe(2);
    expect(ds.anh[0]).toMatchObject({ rong: 800, cao: 600, soBaiDung: 0 });
    expect(ds.anh[0].url).toMatch(/^http:\/\/localhost:8090\/anh\/[a-f0-9]+\/480\.webp$/);
    expect(['a.jpg', 'b.jpg']).toContain(ds.anh[0].tenGoc);
    expect(ds.anh[0].byte).toBeGreaterThan(0);
  });

  it('ổ còn < 2 GB → 507 với thông báo hiện có, không xử lý ảnh nào', async () => {
    const may = await dungAdmin({ deps: { conDungLuong: async () => false } });
    const r = await tai(may.chinh, [[jpeg, 'a.jpg']]);
    expect(r.status).toBe(507);
    expect(r.body.loi).toMatch(/Ổ đĩa.*2 GB/);
    expect((may.db.prepare('SELECT count(*) AS n FROM anh').get() as { n: number }).n).toBe(0);
  });

  it('không chọn ảnh → 400; quá nhiều file / quá lớn → 413 tiếng Việt; thiếu CSRF → 403', async () => {
    expect((await m.chinh.gui('post', '/anh')).status).toBe(400);
    const nho = await dungAdmin({ deps: { toiDaAnhFile: 1, toiDaAnhByte: 100 } });
    const nhieu = await tai(nho.chinh, [[Buffer.from('x'), 'a.jpg'], [Buffer.from('y'), 'b.jpg']]);
    expect(nhieu.status).toBe(413);
    expect(nhieu.body.loi).toMatch(/quá nhiều file/);
    const lon = await tai(nho.chinh, [[jpeg, 'lon.jpg']]);
    expect(lon.status).toBe(413);
    expect(lon.body.loi).toMatch(/quá lớn/);
    const { default: request } = await import('supertest');
    const r = await request(m.app).post('/api/admin/anh').set('Cookie', m.chinh.cookie).attach('files', jpeg, 'a.jpg');
    expect(r.status).toBe(403);
  });
});

describe('sửa alt, đang dùng ở, xoá', () => {
  async function mot() {
    const r = await tai(m.chinh, [[jpeg, 'a.jpg']]);
    return r.body.ok[0].ma as string;
  }
  const baiVoiAnh = async (ma: string, over: object = {}, noiDung = 'x') =>
    (await m.chinh.gui('post', '/bai', { bai: baiDayDu('b', { anhBia: { ma, alt: 'Biển' }, ...over }), noiDung })).body.id as number;

  it('PATCH altMacDinh lưu và hiện ra ở danh sách; mã lạ → 404; alt không phải chuỗi → 400', async () => {
    const ma = await mot();
    expect((await m.chinh.gui('patch', `/anh/${ma}`, { altMacDinh: 'Bãi biển buổi sáng' })).status).toBe(200);
    expect((await m.chinh.gui('get', '/anh')).body.anh[0].altMacDinh).toBe('Bãi biển buổi sáng');
    expect((await m.chinh.gui('patch', '/anh/khongco', { altMacDinh: 'x' })).status).toBe(404);
    expect((await m.chinh.gui('patch', `/anh/${ma}`, { altMacDinh: 5 })).status).toBe(400);
  });

  it('xoá ảnh đang là ảnh bìa của bài trong THÙNG RÁC → 409 kèm danh sách bài; thư mục còn nguyên', async () => {
    const ma = await mot();
    const id = await baiVoiAnh(ma);
    await m.chinh.gui('post', `/bai/${id}/thung-rac`);
    const r = await m.chinh.gui('delete', `/anh/${ma}`);
    expect(r.status).toBe(409);
    expect(r.body.baiDung).toEqual([{ id, tieuDe: 'Bài b' }]);
    expect(existsSync(join(m.anhDir, ma))).toBe(true);
  });

  it('ảnh trong thân bài ![x](anh:MÃ) và ảnh địa điểm cũng được tính là đang dùng', async () => {
    const ma = await mot();
    const ma2 = (await tai(m.chinh, [[jpeg, 'b.jpg']])).body.ok[0].ma as string;
    taoAnhGia(m.anhDir, 'anh1');
    const a = await baiVoiAnh('anh1', {}, `Có ảnh ![mô tả](anh:${ma})`);
    const b = (await m.chinh.gui('post', '/bai', { bai: baiDayDu('c', { diaDiem: [{ ten: 'Quán', kieu: 'quan-an', anh: [{ ma: ma2, alt: 'Quán' }] }] }), noiDung: 'y' })).body.id as number;
    expect((await m.chinh.gui('delete', `/anh/${ma}`)).status).toBe(409);
    expect((await m.chinh.gui('delete', `/anh/${ma2}`)).status).toBe(409);
    expect(timAnhDungOBai(m.db).get(ma)).toEqual([a]);
    expect(timAnhDungOBai(m.db).get(ma2)).toEqual([b]);
    expect((await m.chinh.gui('get', `/anh/${ma}/dung-o`)).body.bai).toEqual([{ id: a, tieuDe: 'Bài b' }]);
    expect((await m.chinh.gui('get', `/anh?baiId=${a}`)).body.tong).toBe(2); // ảnh bìa anh1 + ảnh trong thân
    expect((await m.chinh.gui('get', '/anh?baiId=999')).body.tong).toBe(0);
  });

  it('ảnh làm ảnh bìa của một tỉnh cũng không xoá được', async () => {
    const ma = await mot();
    m.db.prepare("INSERT INTO tinh (slug, du_lieu) VALUES ('vung-tau', ?)").run(JSON.stringify({ ten: 'Vũng Tàu', slug: 'vung-tau', gioiThieu: 'g', anhBia: { ma, alt: 'y' }, moTa: 'm' }));
    const r = await m.chinh.gui('delete', `/anh/${ma}`);
    expect(r.status).toBe(409);
    expect(r.body.tinhDung).toEqual(['vung-tau']);
  });

  it('xoá ảnh không dùng → thư mục biến mất, dòng bị xoá, ghi nhật ký; xoá lần 2 → 404', async () => {
    const ma = await mot();
    expect((await m.chinh.gui('delete', `/anh/${ma}`)).status).toBe(200);
    expect(existsSync(join(m.anhDir, ma))).toBe(false);
    expect((await m.chinh.gui('get', '/anh')).body.tong).toBe(0);
    expect((await m.chinh.gui('delete', `/anh/${ma}`)).status).toBe(404);
    expect(m.db.prepare("SELECT count(*) AS n FROM nhat_ky WHERE loai = 'xoa-anh'").get()).toEqual({ n: 1 });
  });

  it('mã ảnh có ký tự lạ (../) không chạm được ra ngoài thư mục ảnh', async () => {
    expect((await m.chinh.gui('delete', '/anh/..%2f..%2fetc')).status).toBe(404);
  });
});

describe('đồng bộ và ổ đĩa', () => {
  it('khởi động lại với thư mục ảnh có sẵn → thêm ảnh chưa có, không nhân đôi', () => {
    taoAnhGia(m.anhDir, 'cuuanh1');
    taoAnhGia(m.anhDir, 'cuuanh2');
    expect(dongBoAnh(m.db, m.anhDir)).toBe(2);
    expect(dongBoAnh(m.db, m.anhDir)).toBe(0);
    expect((m.db.prepare('SELECT count(*) AS n FROM anh').get() as { n: number }).n).toBe(2);
  });

  it('GET /anh tự đồng bộ ảnh mới thêm từ nơi khác (vd /tai-anh của MCP)', async () => {
    taoAnhGia(m.anhDir, 'tuMcp1');
    expect((await m.chinh.gui('get', '/anh')).body.tong).toBe(1);
  });

  it('GET /o-dia trả số byte đã dùng và còn trống', async () => {
    await tai(m.chinh, [[jpeg, 'a.jpg']]);
    const r = (await m.chinh.gui('get', '/o-dia')).body;
    expect(r.daDungByte).toBeGreaterThan(0);
    expect(r.conTrongByte).toBeGreaterThan(0);
  });
});
