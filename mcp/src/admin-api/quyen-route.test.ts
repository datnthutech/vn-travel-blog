// Phân quyền áp lên MỌI route: (a) không route nào thiếu khai báo, (b) mỗi route × 3 vai trò cho kết quả đúng bảng quyền,
// (c) writer gọi thẳng API để động vào bài của người khác → 403.
import { coQuyen, type VaiTro } from '@vntraveltips/schema';
import { beforeAll, describe, expect, it } from 'vitest';
import { adminApiRouter } from './index';
import { QUYEN_ROUTE, type KhaiBaoRoute } from './quyen-route';
import { baiDayDu, dungAdmin, taoAnhGia, type PhienThu } from './thu-nghiem';

type Moi = Awaited<ReturnType<typeof dungAdmin>>;
let m: Moi;
let vaiTro: Record<VaiTro, PhienThu>;
let baiId: number;

beforeAll(async () => {
  m = await dungAdmin();
  taoAnhGia(m.anhDir, 'anh1');
  vaiTro = {
    'quan-tri': m.chinh,
    'quan-ly': await m.dangNhap('ql@x.vn', 'Quản lý', 'quan-ly'),
    writer: await m.dangNhap('w@x.vn', 'Writer', 'writer'),
  };
  baiId = (await m.chinh.gui('post', '/bai', { bai: baiDayDu('bai-cua-quan-tri'), noiDung: 'x' })).body.id; // bài của quản trị
});

describe('(a) mọi route đều được khai báo quyền', () => {
  it('route thật của router == danh sách QUYEN_ROUTE (không thiếu, không thừa)', () => {
    const r = adminApiRouter({ config: m.config, db: m.db, mail: { gui: () => 0, xuLyHangDoi: async () => ({ daGui: 0, conCho: 0 }), thongKeHomNay: () => [], guiThu: async () => {} }, hangDoi: m.hangDoi });
    const that: string[] = [];
    const duyet = (stack: any[]) => {
      for (const l of stack) {
        if (l.route) for (const pt of Object.keys(l.route.methods)) that.push(`${pt.toUpperCase()} ${l.route.path}`);
        else if (l.handle?.stack) duyet(l.handle.stack);
      }
    };
    duyet((r as any).stack);
    const khaiBao = QUYEN_ROUTE.map((x) => `${x.phuongThuc} ${x.duongDan}`);
    expect(that.sort()).toEqual([...khaiBao].sort());
    expect(new Set(khaiBao).size).toBe(khaiBao.length); // không khai báo trùng
  });
});

const dienDuongDan = (duongDan: string): string =>
  duongDan.replace(':id', duongDan.startsWith('/bai') ? String(baiId) : '999').replace(':pid', '999').replace(':slug', 'khong-co').replace(':ma', 'khongco');

const kiemTuDong = QUYEN_ROUTE.filter((x) => x.hanhDong !== 'cong-khai' && !x.doiPhien);

describe('(b) từng route × từng vai trò', () => {
  for (const vt of ['quan-tri', 'quan-ly', 'writer'] as const) {
    describe(vt, () => {
      it.each(kiemTuDong.map((x) => [`${x.phuongThuc} ${x.duongDan}`, x] as [string, KhaiBaoRoute]))('%s', async (_ten, x) => {
        const phien = vaiTro[vt];
        // Chủ sở hữu giả định là QUẢN TRỊ (bài/ảnh của người khác đối với writer).
        const duocPhep = x.hanhDong === 'chi-dang-nhap' || x.hanhDong === 'cong-khai' || coQuyen({ id: phien.nguoi.id, vaiTro: vt }, x.hanhDong, { tacGiaId: vaiTro['quan-tri'].nguoi.id });
        const r = await phien.gui(x.phuongThuc.toLowerCase() as 'get', dienDuongDan(x.duongDan), x.phuongThuc === 'GET' ? undefined : {});
        if (duocPhep) {
          expect(r.status, `${vt} được phép nhưng nhận ${r.status}: ${JSON.stringify(r.body).slice(0, 120)}`).not.toBe(403);
          expect(r.status).not.toBe(401);
        } else {
          expect(r.status, `${vt} KHÔNG được phép nhưng nhận ${r.status}`).toBe(403);
          expect(r.body).toEqual({ loi: 'Bạn không có quyền làm việc này' });
        }
      });
    });
  }
});

describe('(c) writer gọi thẳng API vào bài của người khác', () => {
  it('writer A sửa/đăng/gỡ/hẹn giờ/thùng rác/khôi phục/tự lưu/xem trước bài của writer B → 403 và bài không đổi', async () => {
    const a = await m.dangNhap('wa@x.vn', 'Writer A', 'writer');
    const b = await m.dangNhap('wb@x.vn', 'Writer B', 'writer');
    const { id, phienSo } = (await b.gui('post', '/bai', { bai: baiDayDu('bai-cua-b'), noiDung: 'của B' })).body;
    const goi = async (method: 'put' | 'post' | 'patch' | 'delete', url: string, body: object = {}) => (await a.gui(method, url, method === 'delete' ? undefined : body)).status;
    expect(await goi('put', `/bai/${id}`, { bai: baiDayDu('bai-cua-b', { tieuDe: 'A sửa trộm' }), noiDung: 'x', phienSo })).toBe(403);
    expect(await goi('patch', `/bai/${id}/tu-luu`, { bai: {}, noiDung: 'x' })).toBe(403);
    for (const duong of ['dang', 'go', 'thung-rac', 'khoi-phuc', 'hen-gio', 'huy-hen-gio', 'xem-truoc']) expect(await goi('post', `/bai/${id}/${duong}`, { luc: '2099-01-01T00:00' }), duong).toBe(403);
    expect(await goi('delete', `/bai/${id}`)).toBe(403);
    const doc = (await b.gui('get', `/bai/${id}`)).body;
    expect(doc).toMatchObject({ trangThai: 'nhap', phienSo, noiDung: 'của B' });
    expect(doc.bai.tieuDe).toBe('Bài bai-cua-b');
    expect((await a.gui('get', `/bai/${id}`)).status).toBe(200); // vẫn XEM được
  });

  it('writer làm được việc trên bài CỦA MÌNH (sửa, đăng, thùng rác, khôi phục) nhưng KHÔNG xoá hẳn được', async () => {
    const a = await m.dangNhap('wc@x.vn', 'Writer C', 'writer');
    const { id, phienSo } = (await a.gui('post', '/bai', { bai: baiDayDu('bai-cua-c'), noiDung: 'x' })).body;
    expect((await a.gui('put', `/bai/${id}`, { bai: baiDayDu('bai-cua-c', { tieuDe: 'Tự sửa' }), noiDung: 'y', phienSo })).status).toBe(200);
    expect((await a.gui('post', `/bai/${id}/dang`)).status).toBe(200);
    expect((await a.gui('post', `/bai/${id}/thung-rac`)).status).toBe(200);
    expect((await a.gui('post', `/bai/${id}/khoi-phuc`)).status).toBe(200);
    expect((await a.gui('post', `/bai/${id}/thung-rac`)).status).toBe(200);
    expect((await a.gui('delete', `/bai/${id}`)).status).toBe(403); // xoá hẳn chỉ quản trị
  });

  it('writer xoá ảnh: chỉ ảnh do chính mình tải lên', async () => {
    const sharp = (await import('sharp')).default;
    const jpeg = await sharp({ create: { width: 50, height: 50, channels: 3, background: '#abcdef' } }).jpeg().toBuffer();
    const a = await m.dangNhap('wd@x.vn', 'Writer D', 'writer');
    const cuaA = (await a.gui('post', '/anh').attach('files', jpeg, 'a.jpg')).body.ok[0].ma as string;
    const cuaQt = (await m.chinh.gui('post', '/anh').attach('files', await sharp({ create: { width: 40, height: 40, channels: 3, background: '#fedcba' } }).jpeg().toBuffer(), 'q.jpg')).body.ok[0].ma as string;
    expect((await a.gui('delete', `/anh/${cuaQt}`)).status).toBe(403);
    expect((await a.gui('delete', `/anh/${cuaA}`)).status).toBe(200);
  });
});
