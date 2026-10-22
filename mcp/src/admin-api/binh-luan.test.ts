// Kiểm duyệt bình luận + báo mail cho tác giả bài.
import { caiDatSiteMacDinh } from '@vntraveltips/schema';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { baiDayDu, dungAdmin, taoAnhGia } from './thu-nghiem';

type Moi = Awaited<ReturnType<typeof dungAdmin>>;
let m: Moi;
let w: Awaited<ReturnType<Moi['dangNhap']>>;
let baiW: number; // bài của writer
const hang = () => m.db.prepare("SELECT loai, den, tieu_de, text FROM mail_hang_doi WHERE tieu_de LIKE 'Bình luận mới%' ORDER BY id").all() as { loai: string; den: string; tieu_de: string; text: string }[];

beforeEach(async () => {
  m = await dungAdmin();
  taoAnhGia(m.anhDir, 'anh1');
  w = await m.dangNhap('writer@x.vn', 'Writer', 'writer');
  baiW = (await w.gui('post', '/bai', { bai: baiDayDu('bai-writer'), noiDung: 'x' })).body.id;
  await w.gui('post', `/bai/${baiW}/dang`);
  await m.chinh.gui('put', '/cai-dat/site', { ...caiDatSiteMacDinh({}), binhLuan: { bat: true, tuCam: [] } });
});
const khach = async (noiDung = 'Bài hay quá', ip = '7.7.7.1', extra: object = {}) => {
  const g = await request(m.app).get(`/api/cong-khai/binh-luan?bai=${baiW}&ngonNgu=vi`).set('X-Forwarded-For', ip);
  m.dongHo.v += 3500;
  return request(m.app).post('/api/cong-khai/binh-luan').set('X-Forwarded-For', ip).send({ bai: baiW, ngonNgu: 'vi', ten: 'Khách', email: 'khach@x.vn', noiDung, website: '', veGui: g.body.veGui, ...extra });
};

describe('báo mail cho tác giả', () => {
  it('bình luận mới → 1 mail `thuong` cho tác giả bài (không lộ email khách trong nội dung)', async () => {
    await khach('Rất hữu ích!');
    const ds = hang();
    expect(ds).toHaveLength(1);
    expect(ds[0]).toMatchObject({ loai: 'thuong', den: 'writer@x.vn' });
    expect(ds[0]!.text).toContain('Rất hữu ích!');
    expect(ds[0]!.text).toContain('/quan-tri/binh-luan');
    expect(ds[0]!.text).not.toContain('khach@x.vn');
  });

  it('bình luận chờ xem cũng báo (kèm "CHỜ XEM"); tắt nhan_mail_binh_luan → không mail; người viết chính là người trả lời → không tự báo', async () => {
    await khach('xem http://a.vn http://b.vn http://c.vn', '7.7.7.2');
    expect(hang()[0]!.text).toMatch(/CHỜ XEM/);
    expect((await w.gui('put', '/toi/tuy-chon', { nhanMailBinhLuan: false })).body).toEqual({ nhanMailBinhLuan: false });
    expect((await w.gui('get', '/toi/tuy-chon')).body).toEqual({ nhanMailBinhLuan: false });
    const truoc = hang().length;
    await khach('thêm một bình luận', '7.7.7.3');
    expect(hang()).toHaveLength(truoc);
    await w.gui('put', '/toi/tuy-chon', { nhanMailBinhLuan: true });
    const cmt = (await khach('bình luận để trả lời', '7.7.7.4')).body.id;
    const sau = hang().length;
    expect((await w.gui('post', `/binh-luan/${cmt}/tra-loi`, { noiDung: 'Cảm ơn bạn' })).status).toBe(201);
    expect(hang()).toHaveLength(sau); // tác giả tự trả lời → không báo chính mình
    expect((await w.gui('put', '/toi/tuy-chon', { nhanMailBinhLuan: 'co' })).status).toBe(400);
  });

  it('quản trị trả lời bình luận ở bài của writer → writer nhận 1 mail', async () => {
    const cmt = (await khach('hỏi một câu', '7.7.7.5')).body.id;
    const truoc = hang().length;
    expect((await m.chinh.gui('post', `/binh-luan/${cmt}/tra-loi`, { noiDung: 'Quản trị trả lời' })).status).toBe(201);
    expect(hang()).toHaveLength(truoc + 1);
  });
});

describe('kiểm duyệt', () => {
  it('writer ẩn bình luận trên bài CỦA MÌNH → 200 (biến khỏi GET công khai); hiện lại; quản lý ẩn mọi bài → 200', async () => {
    const cmt = (await khach()).body.id;
    expect((await w.gui('put', `/binh-luan/${cmt}`, { trangThai: 'an' })).status).toBe(200);
    expect((await request(m.app).get(`/api/cong-khai/binh-luan?bai=${baiW}&ngonNgu=vi`)).body.binhLuan).toEqual([]);
    expect((await w.gui('put', `/binh-luan/${cmt}`, { trangThai: 'hien' })).status).toBe(200);
    const q = await m.dangNhap('ql@x.vn', 'QL', 'quan-ly');
    expect((await q.gui('put', `/binh-luan/${cmt}`, { trangThai: 'an' })).status).toBe(200);
    expect((await m.chinh.gui('put', `/binh-luan/${cmt}`, { trangThai: 'cho-xem' })).status).toBe(400);
    expect(m.db.prepare("SELECT count(*) AS n FROM nhat_ky WHERE loai IN ('an-binh-luan','hien-binh-luan')").get()).toEqual({ n: 3 });
  });

  it('trả lời của tác giả có laTacGia=true và hiện ngay trong GET công khai ngay sau cha', async () => {
    const cmt = (await khach('câu hỏi')).body.id;
    await w.gui('post', `/binh-luan/${cmt}/tra-loi`, { noiDung: 'Mình trả lời nhé' });
    const ds = (await request(m.app).get(`/api/cong-khai/binh-luan?bai=${baiW}&ngonNgu=vi`)).body.binhLuan;
    expect(ds.map((x: { noiDung: string }) => x.noiDung)).toEqual(['câu hỏi', 'Mình trả lời nhé']);
    expect(ds[1]).toMatchObject({ laTacGia: true, ten: 'Writer', chaId: cmt });
    expect(JSON.stringify(ds)).not.toContain('writer@x.vn'); // email người trả lời cũng không lộ
    expect((await w.gui('post', `/binh-luan/${cmt}/tra-loi`, { noiDung: '' })).status).toBe(400);
  });

  it('xoá cha → trả lời con biến mất; ghi nhật ký xoa-binh-luan', async () => {
    const cmt = (await khach('cha')).body.id;
    await w.gui('post', `/binh-luan/${cmt}/tra-loi`, { noiDung: 'con' });
    expect((await w.gui('delete', `/binh-luan/${cmt}`)).status).toBe(200);
    expect(m.db.prepare('SELECT count(*) AS n FROM binh_luan').get()).toEqual({ n: 0 });
    expect(m.db.prepare("SELECT count(*) AS n FROM nhat_ky WHERE loai = 'xoa-binh-luan'").get()).toEqual({ n: 1 });
    expect((await w.gui('delete', `/binh-luan/${cmt}`)).status).toBe(404);
  });

  it('chặn email: người đó gửi lại → 201 giả, không lưu; chặn IP tương tự; bình luận bị chặn cũng bị ẩn', async () => {
    const cmt = (await khach('quảng cáo', '6.6.6.6')).body.id;
    expect((await w.gui('post', `/binh-luan/${cmt}/chan`, { loai: 'email' })).status).toBe(200);
    expect(m.db.prepare('SELECT trang_thai FROM binh_luan WHERE id = ?').get(cmt)).toEqual({ trang_thai: 'an' });
    const them = await khach('lại spam', '6.6.6.7');
    expect(them.status).toBe(201);
    expect(m.db.prepare('SELECT count(*) AS n FROM binh_luan').get()).toEqual({ n: 1 });
    const c2 = (await khach('người khác', '5.5.5.5', { email: 'nguoi-khac@x.vn' })).body.id;
    expect((await w.gui('post', `/binh-luan/${c2}/chan`, { loai: 'ip' })).status).toBe(200);
    await khach('từ IP đã chặn', '5.5.5.5', { email: 'khac-nua@x.vn' });
    expect(m.db.prepare('SELECT count(*) AS n FROM binh_luan').get()).toEqual({ n: 2 });
    expect((await w.gui('post', `/binh-luan/${cmt}/chan`, { loai: 'sai' })).status).toBe(400);
    expect(JSON.stringify(m.db.prepare('SELECT * FROM chan_binh_luan').all())).not.toMatch(/@x\.vn|5\.5\.5\.5/);
  });

  it('danh sách: chờ xem đứng đầu, lọc theo trạng thái, kèm email cho người kiểm duyệt; trangThai sai → 400', async () => {
    await khach('bình luận thường', '1.1.1.1');
    await khach('http://a.vn http://b.vn http://c.vn', '1.1.1.2');
    const tat = (await m.chinh.gui('get', '/binh-luan')).body;
    expect(tat.tong).toBe(2);
    expect(tat.binhLuan[0]).toMatchObject({ trangThai: 'cho-xem', email: 'khach@x.vn', baiTieuDe: 'Bài bai-writer' });
    expect((await m.chinh.gui('get', '/binh-luan?trangThai=hien')).body.tong).toBe(1);
    expect((await m.chinh.gui('get', '/binh-luan?trangThai=linh-tinh')).status).toBe(400);
  });

  it('tổng quan: binhLuanMoi = bình luận 24 giờ qua hoặc đang chờ xem (mỗi cái một lần)', async () => {
    await khach('mới', '1.1.1.1');
    await khach('http://a.vn http://b.vn http://c.vn', '1.1.1.2');
    const r = (await m.chinh.gui('get', '/tong-quan')).body;
    expect(r).toMatchObject({ binhLuanMoi: 2, binhLuanChoXem: 1 });
  });

  it('tổng quan: bình luận đã ẩn không còn được tính là "mới"', async () => {
    const id = (await khach('sẽ bị ẩn', '1.1.1.1')).body.id;
    m.db.prepare("UPDATE binh_luan SET trang_thai = 'an' WHERE id = ?").run(id);
    expect((await m.chinh.gui('get', '/tong-quan')).body.binhLuanMoi).toBe(0);
  });
});

describe('review cuối #5: trả lời bình luận không đang hiện', () => {
  it('bình luận chờ xem hoặc đã ẩn → 400 có thông báo tiếng Việt (không phải 500)', async () => {
    const cho = (await khach('xem http://a.vn http://b.vn http://c.vn', '7.7.8.1')).body.id;
    const r1 = await w.gui('post', `/binh-luan/${cho}/tra-loi`, { noiDung: 'trả lời' });
    expect(r1.status).toBe(400);
    expect(r1.body.loi).toMatch(/đang hiện/);
    const an = (await khach('bình luận thường', '7.7.8.2')).body.id;
    await w.gui('put', `/binh-luan/${an}`, { trangThai: 'an' });
    expect((await w.gui('post', `/binh-luan/${an}/tra-loi`, { noiDung: 'trả lời' })).status).toBe(400);
  });
});
