// Quản lý ngôn ngữ: mã hợp lệ, không trùng slug tỉnh/trang/hệ thống (Review Focus GĐ7), tắt ngôn ngữ không xoá dữ liệu.
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { xuatNoiDung } from '../noi-dung/xuat';
import { dungAdmin, taoAnhGia } from './thu-nghiem';

type Moi = Awaited<ReturnType<typeof dungAdmin>>;
let m: Moi;
const TINH = (ten: string, slug?: string) => ({ ten, ...(slug ? { slug } : {}), gioiThieu: 'Giới thiệu', anhBia: { ma: 'anh1', alt: 'Biển' }, moTa: 'Mô tả' });
beforeEach(async () => {
  m = await dungAdmin();
  taoAnhGia(m.anhDir, 'anh1');
});
const danhSach = async () => (await m.chinh.gui('get', '/ngon-ngu')).body.ngonNgu as { ma: string; ten: string; bat: boolean; thuTu: number }[];
const xuat = () => {
  const d = mkdtempSync(join(tmpdir(), 'vtt-nn-'));
  xuatNoiDung(m.db, d, 'production');
  return JSON.parse(readFileSync(join(d, 'ngon-ngu.json'), 'utf8')) as { ma: string; ten: string }[];
};

describe('tạo / sửa ngôn ngữ', () => {
  it('mặc định chỉ có vi (luôn bật); thêm en → có trong danh sách và trong ngon-ngu.json khi xuất', async () => {
    expect(await danhSach()).toEqual([{ ma: 'vi', ten: 'Tiếng Việt', bat: true, thuTu: 0 }]);
    const r = await m.chinh.gui('post', '/ngon-ngu', { ma: 'en', ten: 'English' });
    expect(r.status).toBe(201);
    expect((await danhSach()).map((x) => x.ma)).toEqual(['vi', 'en']);
    expect(xuat().map((x) => x.ma)).toEqual(['vi', 'en']);
  });

  it('mã sai định dạng / là vi / đã có / trùng slug hệ thống → 400/409', async () => {
    for (const ma of ['EN', 'eng', 'e', 'en_US', 'vi', '../x', '']) expect((await m.chinh.gui('post', '/ngon-ngu', { ma, ten: 'X' })).status, ma).toBe(400);
    expect((await m.chinh.gui('post', '/ngon-ngu', { ma: 'zh-cn', ten: '中文' })).status).toBe(201); // dạng có vùng
    expect((await m.chinh.gui('post', '/ngon-ngu', { ma: 'zh-cn', ten: 'Dup' })).status).toBe(409);
    expect((await m.chinh.gui('post', '/ngon-ngu', { ma: 'en', ten: '' })).status).toBe(400);
  });

  it('tạo en khi đã có tỉnh slug "en" → 400; tạo tỉnh "ko" khi đã có ngôn ngữ ko → 400; trang tĩnh slug trùng mã ngôn ngữ cũng bị chặn (Review Focus)', async () => {
    expect((await m.chinh.gui('post', '/tinh', TINH('En', 'en'))).status).toBe(201);
    const r = await m.chinh.gui('post', '/ngon-ngu', { ma: 'en', ten: 'English' });
    expect(r.status).toBe(400);
    expect(r.body.loi).toMatch(/trùng/);
    expect((await danhSach()).map((x) => x.ma)).toEqual(['vi']);

    expect((await m.chinh.gui('post', '/ngon-ngu', { ma: 'ko', ten: '한국어' })).status).toBe(201);
    expect((await m.chinh.gui('post', '/tinh', TINH('Ko', 'ko'))).status).toBe(400);
    expect((await m.chinh.gui('post', '/trang', { tieuDe: 'Ko', slug: 'ko', noiDung: 'x' })).status).toBe(400);
    expect((await m.chinh.gui('post', '/tinh', TINH('Vi', 'vi'))).status).toBe(400); // vi luôn là mã ngôn ngữ

    // trang tĩnh slug "ja" có trước → không tạo được ngôn ngữ ja
    expect((await m.chinh.gui('post', '/trang', { tieuDe: 'Ja', slug: 'ja', noiDung: 'x' })).status).toBe(201);
    expect((await m.chinh.gui('post', '/ngon-ngu', { ma: 'ja', ten: '日本語' })).status).toBe(400);
  });

  it('sửa tên/thứ tự; tắt en → ngon-ngu.json không còn en nhưng dữ liệu không bị xoá; bật lại được; không tắt/xoá vi', async () => {
    await m.chinh.gui('post', '/ngon-ngu', { ma: 'en', ten: 'English' });
    m.db.prepare("INSERT INTO dich_cau_truc (loai, khoa, ngon_ngu, du_lieu, sua_luc) VALUES ('site', 'site', 'en', '{}', 0)").run();
    expect((await m.chinh.gui('put', '/ngon-ngu/en', { ten: 'Tiếng Anh', thuTu: 5 })).body).toMatchObject({ ma: 'en', ten: 'Tiếng Anh', thuTu: 5, bat: true });
    expect((await m.chinh.gui('put', '/ngon-ngu/en', { bat: false })).status).toBe(200);
    expect(xuat().map((x) => x.ma)).toEqual(['vi']);
    expect(m.db.prepare("SELECT count(*) AS n FROM dich_cau_truc WHERE ngon_ngu = 'en'").get()).toEqual({ n: 1 });
    expect((await m.chinh.gui('put', '/ngon-ngu/en', { bat: true })).status).toBe(200);
    expect(xuat().map((x) => x.ma)).toEqual(['vi', 'en']);
    expect((await m.chinh.gui('put', '/ngon-ngu/vi', { bat: false })).status).toBe(400);
    expect((await m.chinh.gui('put', '/ngon-ngu/vi', { ten: 'Việt' })).status).toBe(200);
    expect((await m.chinh.gui('put', '/ngon-ngu/xx', { ten: 'X' })).status).toBe(404);
    expect((await m.chinh.gui('delete', '/ngon-ngu/vi')).status).toBe(404); // không có route xoá
  });

  it('thêm/sửa/tắt ngôn ngữ yêu cầu build lại; quản lý/người viết không thêm được (403) nhưng ĐỌC được danh sách', async () => {
    const truoc = m.yeuCau.so;
    await m.chinh.gui('post', '/ngon-ngu', { ma: 'en', ten: 'English' });
    expect(m.yeuCau.so).toBeGreaterThan(truoc);
    const ql = await m.dangNhap('ql@x.vn', 'QL', 'quan-ly');
    const w = await m.dangNhap('w@x.vn', 'W', 'writer');
    for (const p of [ql, w]) {
      expect((await p.gui('get', '/ngon-ngu')).status).toBe(200);
      expect((await p.gui('post', '/ngon-ngu', { ma: 'fr', ten: 'Français' })).status).toBe(403);
      expect((await p.gui('put', '/ngon-ngu/en', { bat: false })).status).toBe(403);
    }
  });
});
