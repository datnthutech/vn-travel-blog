// Tỉnh (đổi slug → 301 hub + mọi bài; xoá/chuyển; slug cấm) và tag (đổi tên/gộp, tag không dùng).
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { xuatNoiDung } from '../noi-dung/xuat';
import { baiDayDu, dungAdmin, taoAnhGia } from './thu-nghiem';

type Moi = Awaited<ReturnType<typeof dungAdmin>>;
let m: Moi;
const TINH = (ten: string, slug?: string) => ({ ten, ...(slug ? { slug } : {}), gioiThieu: 'Giới thiệu', anhBia: { ma: 'anh1', alt: 'Biển' }, moTa: 'Mô tả' });
beforeEach(async () => {
  m = await dungAdmin();
  taoAnhGia(m.anhDir, 'anh1');
});
const taoBai = async (slug: string, over: Record<string, unknown> = {}, dang = true) => {
  const id = (await m.chinh.gui('post', '/bai', { bai: baiDayDu(slug, over), noiDung: 'x' })).body.id as number;
  if (dang) expect((await m.chinh.gui('post', `/bai/${id}/dang`)).status).toBe(200);
  return id;
};
const redirects = () => Object.fromEntries((m.db.prepare('SELECT tu, den FROM redirect').all() as { tu: string; den: string }[]).map((r) => [r.tu, r.den]));
const tinhCua = async (id: number) => (await m.chinh.gui('get', `/bai/${id}`)).body.bai.tinh as string | undefined;

describe('tỉnh — thêm, slug cấm', () => {
  it('thêm: slug tự sinh từ tên; trùng → 409; thiếu trường → 400 có chi tiết', async () => {
    const r = await m.chinh.gui('post', '/tinh', TINH('Bà Rịa - Vũng Tàu'));
    expect(r.status).toBe(201);
    expect(r.body.slug).toBe('ba-ria-vung-tau');
    expect((await m.chinh.gui('post', '/tinh', TINH('Bà Rịa - Vũng Tàu'))).status).toBe(409);
    const thieu = await m.chinh.gui('post', '/tinh', { ten: 'Đà Lạt' });
    expect(thieu.status).toBe(400);
    expect(thieu.body.chiTiet.join('\n')).toMatch(/gioiThieu/);
  });

  it('slug trùng đường dẫn hệ thống (tim-kiem, quan-tri), trang tĩnh (gioi-thieu, lien-he) hoặc sai dạng → 400', async () => {
    for (const slug of ['tim-kiem', 'quan-tri', 'chu-de', 'gioi-thieu', 'lien-he', 'trang']) {
      const r = await m.chinh.gui('post', '/tinh', TINH('X', slug));
      expect(r.status, slug).toBe(400);
    }
    expect((await m.chinh.gui('post', '/tinh', TINH('X', 'Sai Dạng'))).status).toBe(400);
  });
});

describe('tỉnh — đổi slug', () => {
  it('vung-tau → ba-ria-vung-tau với 2 bài đã đăng: 3 redirect (hub + 2 bài), bài đổi tỉnh, build xuất hợp lệ', async () => {
    await m.chinh.gui('post', '/tinh', TINH('Vũng Tàu', 'vung-tau'));
    const a = await taoBai('a', { tinh: 'vung-tau' });
    await taoBai('b', { tinh: 'vung-tau' });
    const nhap = await taoBai('c', { tinh: 'vung-tau' }, false);
    const r = await m.chinh.gui('put', '/tinh/vung-tau', { slug: 'ba-ria-vung-tau', ten: 'Bà Rịa - Vũng Tàu' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ slug: 'ba-ria-vung-tau', ten: 'Bà Rịa - Vũng Tàu' });
    expect(redirects()).toEqual({
      '/vung-tau/': '/ba-ria-vung-tau/',
      '/vung-tau/a/': '/ba-ria-vung-tau/a/',
      '/vung-tau/b/': '/ba-ria-vung-tau/b/',
    }); // bài nháp không có redirect
    expect(await tinhCua(a)).toBe('ba-ria-vung-tau');
    expect(await tinhCua(nhap)).toBe('ba-ria-vung-tau');
    const d = mkdtempSync(join(tmpdir(), 'vtt-t-'));
    xuatNoiDung(m.db, d, 'production');
    const ra = JSON.parse(readFileSync(join(d, 'redirects.json'), 'utf8')) as { tu: string }[];
    expect(ra.map((x) => x.tu).sort()).toEqual(['/vung-tau/', '/vung-tau/a/', '/vung-tau/b/']);
    expect((await m.chinh.gui('get', '/tinh')).body.tinh.map((t: { slug: string }) => t.slug)).toEqual(['ba-ria-vung-tau']);
  });

  it('đổi slug sang slug đã có / cấm → từ chối; sửa nội dung giữ slug OK', async () => {
    await m.chinh.gui('post', '/tinh', TINH('A', 'a-tinh'));
    await m.chinh.gui('post', '/tinh', TINH('B', 'b-tinh'));
    expect((await m.chinh.gui('put', '/tinh/a-tinh', { slug: 'b-tinh' })).status).toBe(409);
    expect((await m.chinh.gui('put', '/tinh/a-tinh', { slug: 'tim-kiem' })).status).toBe(400);
    expect((await m.chinh.gui('put', '/tinh/a-tinh', { gioiThieu: 'Mới' })).body.gioiThieu).toBe('Mới');
    expect((await m.chinh.gui('put', '/tinh/khong-co', { ten: 'x' })).status).toBe(404);
  });
});

describe('tỉnh — xoá', () => {
  it('còn bài mà không chuyenSang → 409 soBai; chuyenSang=tỉnh khác → bài sang tỉnh đó + redirect', async () => {
    await m.chinh.gui('post', '/tinh', TINH('A', 'tinh-a'));
    await m.chinh.gui('post', '/tinh', TINH('B', 'tinh-b'));
    const id = await taoBai('x', { tinh: 'tinh-a' });
    const r = await m.chinh.gui('delete', '/tinh/tinh-a');
    expect(r.status).toBe(409);
    expect(r.body.soBai).toBe(1);
    expect((await m.chinh.gui('delete', '/tinh/tinh-a?chuyenSang=tinh-b')).body.daChuyen).toBe(1);
    expect(await tinhCua(id)).toBe('tinh-b');
    expect(redirects()).toEqual({ '/tinh-a/x/': '/tinh-b/x/', '/tinh-a/': '/tinh-b/' });
  });

  it("chuyenSang='' (bỏ tỉnh) → bài thành /kinh-nghiem/… kèm redirect", async () => {
    await m.chinh.gui('post', '/tinh', TINH('A', 'tinh-a'));
    const id = await taoBai('x', { tinh: 'tinh-a' });
    expect((await m.chinh.gui('delete', '/tinh/tinh-a?chuyenSang=')).status).toBe(200);
    expect(await tinhCua(id)).toBeUndefined();
    expect(redirects()).toEqual({ '/tinh-a/x/': '/kinh-nghiem/x/' });
    const d = mkdtempSync(join(tmpdir(), 'vtt-t-'));
    xuatNoiDung(m.db, d, 'production');
    expect(JSON.parse(readFileSync(join(d, 'redirects.json'), 'utf8'))).toEqual([{ tu: '/tinh-a/x/', den: '/kinh-nghiem/x/' }]);
  });

  it('tỉnh không còn bài xoá được ngay; chuyenSang lạ → 400; tỉnh lạ → 404', async () => {
    await m.chinh.gui('post', '/tinh', TINH('A', 'tinh-a'));
    await m.chinh.gui('post', '/tinh', TINH('B', 'tinh-b'));
    await taoBai('x', { tinh: 'tinh-a' }, false);
    expect((await m.chinh.gui('delete', '/tinh/tinh-a?chuyenSang=la')).status).toBe(400);
    expect((await m.chinh.gui('delete', '/tinh/tinh-b')).status).toBe(200);
    expect((await m.chinh.gui('delete', '/tinh/khong-co')).status).toBe(404);
  });
});

describe('tag', () => {
  it('đếm số bài theo tag (không tính thùng rác); khong-dung = tag chỉ ở bài thùng rác', async () => {
    await taoBai('a', { tags: ['can-ho', 'bien'] }, false);
    const b = await taoBai('b', { tags: ['bien', 'chi-o-thung-rac'] }, false);
    await m.chinh.gui('post', `/bai/${b}/thung-rac`);
    expect((await m.chinh.gui('get', '/tag')).body.tag).toEqual([{ tag: 'bien', soBai: 1 }, { tag: 'can-ho', soBai: 1 }]);
    expect((await m.chinh.gui('get', '/tag/khong-dung')).body.tag).toEqual([{ tag: 'chi-o-thung-rac', soBai: 1 }]);
  });

  it('đổi tên can-ho → chung-cu khi một bài đã có chung-cu → bài đó chỉ còn một chung-cu', async () => {
    const a = await taoBai('a', { tags: ['can-ho'] }, false);
    const b = await taoBai('b', { tags: ['can-ho', 'chung-cu', 'bien'] }, false);
    const r = await m.chinh.gui('post', '/tag/doi-ten', { tu: 'can-ho', den: 'chung-cu' });
    expect(r.body.daDoi).toBe(2);
    const tags = async (id: number) => (await m.chinh.gui('get', `/bai/${id}`)).body.bai.tags as string[];
    expect(await tags(a)).toEqual(['chung-cu']);
    expect(await tags(b)).toEqual(['chung-cu', 'bien']);
    expect((await m.chinh.gui('get', '/tag')).body.tag.find((t: { tag: string }) => t.tag === 'chung-cu').soBai).toBe(2);
  });

  it('đổi tên thiếu tham số → 400; tag không tồn tại → daDoi 0 và không xếp build', async () => {
    expect((await m.chinh.gui('post', '/tag/doi-ten', { tu: 'x' })).status).toBe(400);
    const y = m.yeuCau.so;
    expect((await m.chinh.gui('post', '/tag/doi-ten', { tu: 'khong-co', den: 'y' })).body.daDoi).toBe(0);
    expect(m.yeuCau.so).toBe(y);
  });
});
