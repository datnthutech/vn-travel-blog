// Lịch sử phiên bản: xem, so sánh, khôi phục (tạo phiên bản mới, không xoá lịch sử).
import { beforeEach, describe, expect, it } from 'vitest';
import { baiDayDu, dungAdmin, taoAnhGia } from './thu-nghiem';

type Moi = Awaited<ReturnType<typeof dungAdmin>>;
let m: Moi;
beforeEach(async () => {
  m = await dungAdmin();
  taoAnhGia(m.anhDir, 'anh1');
});

async function bai3PhienBan() {
  const hai = await m.dangNhap('hai@x.vn', 'Người Hai');
  const { id, phienSo } = (await m.chinh.gui('post', '/bai', { bai: baiDayDu('ls', { tieuDe: 'Tiêu đề 1' }), noiDung: 'Dòng một\nDòng hai\n' })).body;
  const p2 = (await hai.gui('put', `/bai/${id}`, { bai: baiDayDu('ls', { tieuDe: 'Tiêu đề 2' }), noiDung: 'Dòng một\nDòng hai sửa\n', phienSo })).body.phienSo;
  await m.chinh.gui('put', `/bai/${id}`, { bai: baiDayDu('ls', { tieuDe: 'Tiêu đề 3' }), noiDung: 'Dòng một\nDòng hai sửa\nDòng ba\n', phienSo: p2 });
  const ds = (await m.chinh.gui('get', `/bai/${id}/phien-ban`)).body as { id: number; luc: number; nguoiSua: { ten: string } | null }[];
  return { id, ds };
}

describe('lịch sử phiên bản', () => {
  it('3 lần lưu → 3 phiên bản, mới trước, đúng người sửa', async () => {
    m.dongHo.v += 1000;
    const { ds } = await bai3PhienBan();
    expect(ds).toHaveLength(3);
    expect(ds.map((p) => p.nguoiSua?.ten)).toEqual(['Chủ blog', 'Người Hai', 'Chủ blog']);
  });

  it('xem một phiên bản trả dữ liệu + thân bài lúc đó; id lạ → 404', async () => {
    const { id, ds } = await bai3PhienBan();
    const cu = (await m.chinh.gui('get', `/bai/${id}/phien-ban/${ds[2]!.id}`)).body;
    expect(cu.bai.tieuDe).toBe('Tiêu đề 1');
    expect(cu.noiDung).toBe('Dòng một\nDòng hai\n');
    expect((await m.chinh.gui('get', `/bai/${id}/phien-ban/99999`)).status).toBe(404);
  });

  it('so sánh: nêu đúng trường tieuDe đổi và diff thân bài theo dòng', async () => {
    const { id, ds } = await bai3PhienBan();
    const r = (await m.chinh.gui('get', `/bai/${id}/phien-ban/${ds[2]!.id}/so-sanh`)).body;
    expect(r.thayDoi).toEqual([{ truong: 'tieuDe', truoc: 'Tiêu đề 1', sau: 'Tiêu đề 3' }]);
    const xoa = r.noiDung.filter((p: { xoa: boolean }) => p.xoa).map((p: { giaTri: string }) => p.giaTri).join('');
    const them = r.noiDung.filter((p: { them: boolean }) => p.them).map((p: { giaTri: string }) => p.giaTri).join('');
    expect(xoa).toBe('Dòng hai\n');
    expect(them).toBe('Dòng hai sửa\nDòng ba\n');
  });

  it('khôi phục bản 1 → có 4 phiên bản, nội dung = bản 1, lịch sử cũ còn nguyên', async () => {
    const { id, ds } = await bai3PhienBan();
    const r = await m.chinh.gui('post', `/bai/${id}/phien-ban/${ds[2]!.id}/khoi-phuc`);
    expect(r.status).toBe(200);
    const g = (await m.chinh.gui('get', `/bai/${id}`)).body;
    expect(g.bai.tieuDe).toBe('Tiêu đề 1');
    expect(g.noiDung).toBe('Dòng một\nDòng hai\n');
    expect((await m.chinh.gui('get', `/bai/${id}/phien-ban`)).body).toHaveLength(4);
    expect(m.yeuCau.so).toBeGreaterThan(0);
  });

  it('khôi phục giữ nguyên trạng thái đăng', async () => {
    const { id, ds } = await bai3PhienBan();
    await m.chinh.gui('post', `/bai/${id}/dang`);
    expect((await m.chinh.gui('post', `/bai/${id}/phien-ban/${ds.at(-1)!.id}/khoi-phuc`)).status).toBe(200);
    expect((await m.chinh.gui('get', `/bai/${id}`)).body.trangThai).toBe('da-dang');
  });

  it('khôi phục bản không đạt luật khi bài đang đăng → 400, không đổi gì', async () => {
    const { id } = await bai3PhienBan();
    await m.chinh.gui('post', `/bai/${id}/dang`);
    // chèn một phiên bản cũ thiếu moTa (như bản nháp dở trước đây)
    const { moTa: _m, ...thieu } = baiDayDu('ls');
    const pid = Number(m.db.prepare("INSERT INTO phien_ban (bai_id, ngon_ngu, luc, du_lieu, noi_dung) VALUES (?, 'vi', 1, ?, 'x')").run(id, JSON.stringify(thieu)).lastInsertRowid);
    const truoc = (await m.chinh.gui('get', `/bai/${id}`)).body;
    const r = await m.chinh.gui('post', `/bai/${id}/phien-ban/${pid}/khoi-phuc`);
    expect(r.status).toBe(400);
    expect(r.body.chiTiet.join('\n')).toMatch(/moTa/);
    expect((await m.chinh.gui('get', `/bai/${id}`)).body.phienSo).toBe(truoc.phienSo);
  });

  it('phiên bản của bài khác không truy cập được qua id bài này', async () => {
    const { id } = await bai3PhienBan();
    const khac = (await m.chinh.gui('post', '/bai', { bai: baiDayDu('khac'), noiDung: 'k' })).body.id;
    const pbKhac = (await m.chinh.gui('get', `/bai/${khac}/phien-ban`)).body[0].id;
    expect((await m.chinh.gui('get', `/bai/${id}/phien-ban/${pbKhac}`)).status).toBe(404);
    expect((await m.chinh.gui('post', `/bai/${id}/phien-ban/${pbKhac}/khoi-phuc`)).status).toBe(404);
  });
});
