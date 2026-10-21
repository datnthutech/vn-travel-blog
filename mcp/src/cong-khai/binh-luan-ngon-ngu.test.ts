// Bình luận theo ngôn ngữ: bình luận ở trang /en/… thuộc bản dịch en, không hiện ở trang tiếng Việt (và ngược lại).
import { caiDatSiteMacDinh, type BanDichChu } from '@vntraveltips/schema';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { baiDayDu, dungAdmin, taoAnhGia } from '../admin-api/thu-nghiem';

type Moi = Awaited<ReturnType<typeof dungAdmin>>;
let m: Moi;
let baiId: number;
const lay = (ngonNgu: string, ip = '5.5.5.5') => request(m.app).get(`/api/cong-khai/binh-luan?bai=${baiId}&ngonNgu=${ngonNgu}`).set('X-Forwarded-For', ip);
const gui = (body: object, ip = '5.5.5.5') => request(m.app).post('/api/cong-khai/binh-luan').set('X-Forwarded-For', ip).send(body);
async function ve(ngonNgu: string, ip = '5.5.5.5') {
  const r = await lay(ngonNgu, ip);
  m.dongHo.v += 3500;
  return r.body.veGui as string;
}
const hopLe = (veGui: string, ngonNgu: string, noiDung: string) => ({ bai: baiId, ngonNgu, ten: 'Lan', email: 'lan@x.vn', noiDung, website: '', veGui });

beforeEach(async () => {
  m = await dungAdmin();
  taoAnhGia(m.anhDir, 'anh1');
  await m.chinh.gui('put', '/cai-dat/site', { ...caiDatSiteMacDinh({}), binhLuan: { bat: true, tuCam: [] } });
  await m.chinh.gui('post', '/ngon-ngu', { ma: 'en', ten: 'English' });
  baiId = (await m.chinh.gui('post', '/bai', { bai: baiDayDu('bai-a'), noiDung: 'x' })).body.id;
  await m.chinh.gui('post', `/bai/${baiId}/dang`);
});
const dangBanEn = async () => {
  const goc = (await m.chinh.gui('get', `/bai/${baiId}/ban-dich/en`)).body.banGoc as BanDichChu;
  await m.chinh.gui('put', `/bai/${baiId}/ban-dich/en`, { dich: { ...goc, tieuDe: 'English', slug: 'english', moTa: 'b'.repeat(130) } });
  expect((await m.chinh.gui('post', `/bai/${baiId}/ban-dich/en/dang`)).status).toBe(200);
};

describe('bình luận theo ngôn ngữ', () => {
  it('bài chưa có bản dịch en đã đăng → trang en không có khung bình luận (GET/POST 404)', async () => {
    expect((await lay('en')).status).toBe(404);
    expect((await gui(hopLe(await ve('vi'), 'en', 'Great post'))).status).toBe(404);
  });

  it('bình luận ở trang en chỉ hiện ở trang en; bình luận ở trang vi chỉ hiện ở trang vi', async () => {
    await dangBanEn();
    expect((await gui(hopLe(await ve('en'), 'en', 'Great post!'), '6.6.6.6')).status).toBe(201);
    expect((await gui(hopLe(await ve('vi'), 'vi', 'Bài hay quá!'), '7.7.7.7')).status).toBe(201);
    expect((await lay('en')).body.binhLuan.map((b: { noiDung: string }) => b.noiDung)).toEqual(['Great post!']);
    expect((await lay('vi')).body.binhLuan.map((b: { noiDung: string }) => b.noiDung)).toEqual(['Bài hay quá!']);
    expect(m.db.prepare('SELECT ngon_ngu FROM binh_luan ORDER BY id').all()).toEqual([{ ngon_ngu: 'en' }, { ngon_ngu: 'vi' }]);
  });

  it('vé gửi của trang vi không dùng được cho trang en (vé gắn ngôn ngữ); bản dịch bị gỡ → trang en hết nhận bình luận', async () => {
    await dangBanEn();
    const veVi = await ve('vi');
    expect((await gui(hopLe(veVi, 'en', 'dùng nhầm vé'))).status).toBe(400);
    await m.chinh.gui('post', `/bai/${baiId}/ban-dich/en/go`);
    expect((await gui(hopLe(await ve('vi'), 'en', 'sau khi gỡ'))).status).toBe(404);
  });

  it('quản trị lọc bình luận theo ngôn ngữ', async () => {
    await dangBanEn();
    await gui(hopLe(await ve('en'), 'en', 'Great post!'), '8.8.8.8');
    await gui(hopLe(await ve('vi'), 'vi', 'Bài hay quá!'), '9.9.9.9');
    expect((await m.chinh.gui('get', '/binh-luan?ngonNgu=en')).body.tong).toBe(1);
    expect((await m.chinh.gui('get', '/binh-luan?ngonNgu=vi')).body.tong).toBe(1);
    expect((await m.chinh.gui('get', '/binh-luan')).body.tong).toBe(2);
    expect((await m.chinh.gui('get', '/binh-luan?ngonNgu=../x')).status).toBe(400);
  });
});
