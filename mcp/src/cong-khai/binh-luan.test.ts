// API bình luận công khai + chống spam (Review Focus GĐ5).
import { caiDatSiteMacDinh } from '@vntraveltips/schema';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { baiDayDu, dungAdmin, taoAnhGia } from '../admin-api/thu-nghiem';
import { bamGiaTri, chan } from '../binh-luan/kho';

type Moi = Awaited<ReturnType<typeof dungAdmin>>;
let m: Moi;
let baiId: number;
const IP = '3.3.3.3';
const batBinhLuan = (tuCam: string[] = [], bat = true) => m.chinh.gui('put', '/cai-dat/site', { ...caiDatSiteMacDinh({}), binhLuan: { bat, tuCam } });

beforeEach(async () => {
  m = await dungAdmin();
  taoAnhGia(m.anhDir, 'anh1');
  baiId = (await m.chinh.gui('post', '/bai', { bai: baiDayDu('bai-co-binh-luan'), noiDung: 'x' })).body.id;
  await m.chinh.gui('post', `/bai/${baiId}/dang`);
  expect((await batBinhLuan()).status).toBe(200);
});
const lay = (ip = IP, bai = baiId) => request(m.app).get(`/api/cong-khai/binh-luan?bai=${bai}&ngonNgu=vi`).set('X-Forwarded-For', ip);
const gui = (body: object, ip = IP) => request(m.app).post('/api/cong-khai/binh-luan').set('X-Forwarded-For', ip).send(body);
/** GET để lấy vé, đợi đủ 3 giây (đồng hồ giả) rồi trả vé. */
async function ve(ip = IP, bai = baiId) {
  const r = await lay(ip, bai);
  m.dongHo.v += 3500;
  return r.body.veGui as string;
}
const hopLe = (veGui: string, over: object = {}) => ({ bai: baiId, ngonNgu: 'vi', ten: 'Lan', email: 'lan@x.vn', noiDung: 'Bài hay quá!', website: '', veGui, ...over });
const soDong = () => (m.db.prepare('SELECT count(*) AS n FROM binh_luan').get() as { n: number }).n;

describe('GET', () => {
  it('trả danh sách + vé gửi, no-store, không cookie, không email; bài không tồn tại/chưa đăng → 404; bình luận tắt → { tat: true }', async () => {
    const r = await lay();
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.headers['set-cookie']).toBeUndefined();
    expect(r.body.veGui).toMatch(/^\d+\.[0-9a-f]{64}$/);
    expect(r.body.binhLuan).toEqual([]);
    expect((await lay(IP, 9999)).status).toBe(404);
    const nhap = (await m.chinh.gui('post', '/bai', { bai: baiDayDu('chua-dang'), noiDung: 'x' })).body.id;
    expect((await lay(IP, nhap)).status).toBe(404);
    await batBinhLuan([], false);
    expect((await lay()).body).toEqual({ tat: true });
  });
});

describe('POST — bình luận hợp lệ', () => {
  it('hiện NGAY, GET sau đó thấy; phản hồi và GET không có email/ip; không cookie', async () => {
    const r = await gui(hopLe(await ve()));
    expect(r.status).toBe(201);
    expect(r.body).toEqual({ id: expect.any(Number), trangThai: 'hien' });
    expect(r.headers['set-cookie']).toBeUndefined();
    const ds = await lay();
    expect(ds.body.binhLuan).toEqual([expect.objectContaining({ ten: 'Lan', noiDung: 'Bài hay quá!', laTacGia: false })]);
    expect(JSON.stringify([r.body, ds.body])).not.toMatch(/lan@x\.vn|ip_bam|3\.3\.3\.3/);
    expect(m.db.prepare('SELECT ip_bam FROM binh_luan').get()).toEqual({ ip_bam: bamGiaTri('a'.repeat(64), 'ip', IP) }); // chỉ băm
  });

  it('trả lời một bình luận: lưu với chaId; trả lời của trả lời gộp về cấp 1', async () => {
    const a = await gui(hopLe(await ve('1.1.1.1')), '1.1.1.1');
    const b = await gui(hopLe(await ve('2.2.2.2'), { chaId: a.body.id, noiDung: 'Mình đồng ý' }), '2.2.2.2');
    const c = await gui(hopLe(await ve('4.4.4.4'), { chaId: b.body.id, noiDung: 'Cảm ơn bạn' }), '4.4.4.4');
    expect([b.status, c.status]).toEqual([201, 201]);
    expect(m.db.prepare('SELECT cha_id FROM binh_luan WHERE id = ?').get(c.body.id)).toEqual({ cha_id: a.body.id });
    expect((await gui(hopLe(await ve('5.5.5.5'), { chaId: 99999 }), '5.5.5.5')).status).toBe(400);
  });
});

describe('POST — chống spam (Review Focus)', () => {
  it('bot gửi 50 bình luận hợp lệ/phút từ 1 IP → đúng 3 cái 201, còn lại 429', async () => {
    const kq: number[] = [];
    for (let i = 0; i < 50; i++) kq.push((await gui(hopLe(await ve(), { noiDung: `Bình luận số ${i}` }))).status); // mỗi lần một vé mới (đã chờ đủ 3 giây)
    expect(kq.filter((s) => s === 201)).toHaveLength(3);
    expect(kq.filter((s) => s === 429)).toHaveLength(47);
    expect(soDong()).toBe(3);
    // sau 10 phút được gửi lại
    m.dongHo.v += 10 * 60_000 + 1000;
    expect((await gui(hopLe(await ve(), { noiDung: 'Lại nhé' }))).status).toBe(201);
  });

  it('một vé chỉ dùng tối đa 3 lần (bot không lấy 1 vé dùng suốt 24 giờ từ nhiều IP)', async () => {
    const v = await ve();
    const kq: number[] = [];
    for (let i = 0; i < 6; i++) kq.push((await gui(hopLe(v, { noiDung: `lần ${i} ok` }), `10.0.0.${i + 1}`)).status); // mỗi lần một IP khác nhau
    expect(kq).toEqual([201, 201, 201, 400, 400, 400]);
  });

  it('trả lời bình luận đang ẨN / chờ xem → 400 (không lộ id nào đang ẩn, không có trả lời "mồ côi")', async () => {
    const a = await gui(hopLe(await ve('1.1.1.1'), { noiDung: 'http://a.vn http://b.vn http://c.vn' }), '1.1.1.1'); // cho-xem
    expect(a.body.trangThai).toBe('cho-xem');
    expect((await gui(hopLe(await ve('2.2.2.2'), { chaId: a.body.id, noiDung: 'trả lời bình luận chờ xem' }), '2.2.2.2')).status).toBe(400);
    const b = await gui(hopLe(await ve('3.3.3.3')), '3.3.3.3');
    m.db.prepare("UPDATE binh_luan SET trang_thai = 'an' WHERE id = ?").run(b.body.id);
    expect((await gui(hopLe(await ve('4.4.4.4'), { chaId: b.body.id, noiDung: 'trả lời bình luận đã ẩn' }), '4.4.4.4')).status).toBe(400);
    expect(soDong()).toBe(2);
  });

  it('IP khác không bị ảnh hưởng bởi giới hạn của IP bot', async () => {
    const v = await ve();
    for (let i = 0; i < 5; i++) await gui(hopLe(v, { noiDung: `x${i} ok` }));
    expect((await gui(hopLe(await ve('8.8.8.8')), '8.8.8.8')).status).toBe(201);
  });

  it('gửi ngay sau GET (< 3 giây, đồng hồ giả) → 400; vé của bài khác → 400; vé hỏng/thiếu → 400; vé quá 24 giờ → 400', async () => {
    const r = await lay();
    expect((await gui(hopLe(r.body.veGui))).status).toBe(400); // chưa đủ 3 giây
    const bai2 = (await m.chinh.gui('post', '/bai', { bai: baiDayDu('bai-hai'), noiDung: 'x' })).body.id;
    await m.chinh.gui('post', `/bai/${bai2}/dang`);
    const veBai2 = await ve(IP, bai2);
    expect((await gui(hopLe(veBai2))).status).toBe(400);
    expect((await gui(hopLe('khong-phai-ve'))).status).toBe(400);
    expect((await gui({ ...hopLe('x'), veGui: undefined })).status).toBe(400);
    const cu = await ve();
    m.dongHo.v += 25 * 3600_000;
    expect((await gui(hopLe(cu))).status).toBe(400);
    expect(soDong()).toBe(0);
  });

  it('ô bẫy website khác rỗng → 201 GIẢ nhưng DB không có dòng nào', async () => {
    const r = await gui(hopLe(await ve(), { website: 'http://spam.vn' }));
    expect(r.status).toBe(201);
    expect(soDong()).toBe(0);
  });

  it('IP hoặc email bị chặn → 201 giả, không lưu', async () => {
    chan(m.db, 'a'.repeat(64), 'email', 'Spammer@x.vn');
    expect((await gui(hopLe(await ve(), { email: 'spammer@X.vn' }))).status).toBe(201);
    chan(m.db, 'a'.repeat(64), 'ip', '9.9.9.9');
    expect((await gui(hopLe(await ve('9.9.9.9'), { noiDung: 'từ IP bị chặn' }), '9.9.9.9')).status).toBe(201);
    expect(soDong()).toBe(0);
  });

  it('nhiều hơn 2 link → vào hàng chờ xem (không hiện) kèm lý do; đúng 2 link → hiện', async () => {
    const nhieu = await gui(hopLe(await ve('1.1.1.1'), { noiDung: 'xem http://a.vn và https://b.vn và www.c.vn nhé' }), '1.1.1.1');
    expect(nhieu.body.trangThai).toBe('cho-xem');
    expect(m.db.prepare('SELECT ly_do_cho_xem AS l FROM binh_luan WHERE id = ?').get(nhieu.body.id)).toEqual({ l: expect.stringMatching(/hơn 2 liên kết/) });
    expect((await lay()).body.binhLuan).toEqual([]);
    const hai = await gui(hopLe(await ve('2.2.2.2'), { noiDung: 'xem http://a.vn và https://b.vn' }), '2.2.2.2');
    expect(hai.body.trangThai).toBe('hien');
  });

  it('từ cấm rỗng/quá ngắn (hoặc chỉ gồm dấu thanh) không khớp mọi bình luận', async () => {
    await batBinhLuan(['', ' ', '\u0301', 'a']);
    expect((await gui(hopLe(await ve(), { noiDung: 'Bình luận bình thường' }))).body.trangThai).toBe('hien');
  });

  it('từ cấm không phân biệt hoa thường/dấu: "Cờ bạc" với tuCam ["co bac"] → chờ xem', async () => {
    await batBinhLuan(['co bac']);
    const r = await gui(hopLe(await ve(), { noiDung: 'Chơi CỜ BẠC online ở đây' }));
    expect(r.body.trangThai).toBe('cho-xem');
    expect(m.db.prepare('SELECT ly_do_cho_xem AS l FROM binh_luan').get()).toEqual({ l: expect.stringMatching(/co bac/) });
  });

  it('<script> và <img onerror> lưu NGUYÊN VĂN và GET trả nguyên văn dạng chuỗi (client dùng textContent)', async () => {
    const xau = '<script>alert(1)</script><img src=x onerror=alert(1)>';
    await gui(hopLe(await ve(), { noiDung: xau }));
    expect((await lay()).body.binhLuan[0].noiDung).toBe(xau);
  });

  it('kiểm tra độ dài/định dạng: tên rỗng/61, nội dung 1/2001 ký tự, email sai → 400; body quá 16 KB → 413', async () => {
    for (const over of [{ ten: '' }, { ten: 'x'.repeat(61) }, { noiDung: 'a' }, { noiDung: 'x'.repeat(2001) }, { email: 'khong-phai-email' }]) {
      expect((await gui(hopLe(await ve(), over))).status, JSON.stringify(over).slice(0, 40)).toBe(400);
    }
    expect((await gui(hopLe(await ve(), { noiDung: 'x'.repeat(20_000) }))).status).toBe(413);
    expect(soDong()).toBe(0);
    expect((await gui(hopLe(await ve(), { ten: 'x'.repeat(60), noiDung: 'xx' }))).status).toBe(201); // biên hợp lệ
  });

  it('bình luận đang tắt → POST 403; bài lạ → 404', async () => {
    const v = await ve();
    await batBinhLuan([], false);
    expect((await gui(hopLe(v))).status).toBe(403);
    expect((await gui(hopLe(v, { bai: 9999 }))).status).toBe(404);
  });
});
