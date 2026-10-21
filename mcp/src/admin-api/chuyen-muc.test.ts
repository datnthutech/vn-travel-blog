// Chuyên mục động: thêm, đổi slug (bài + 301), xoá cần chuyển bài, đổi thứ tự, kiểm tra tham chiếu khi đăng.
import { mkdtempSync, readFileSync } from 'node:fs';
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
const taoBai = async (slug: string, chuyenMuc: string[], dang = false) => {
  const id = (await m.chinh.gui('post', '/bai', { bai: baiDayDu(slug, { chuyenMuc }), noiDung: 'x' })).body.id as number;
  if (dang) expect((await m.chinh.gui('post', `/bai/${id}/dang`)).status).toBe(200);
  return id;
};
const chuyenMucCua = async (id: number) => (await m.chinh.gui('get', `/bai/${id}`)).body.bai.chuyenMuc as string[];
const redirects = () => Object.fromEntries((m.db.prepare('SELECT tu, den FROM redirect').all() as { tu: string; den: string }[]).map((r) => [r.tu, r.den]));

describe('danh sách và thêm', () => {
  it('có sẵn 5 chuyên mục theo thứ tự, kèm số bài', async () => {
    await taoBai('a', ['an-uong']);
    const r = (await m.chinh.gui('get', '/chuyen-muc')).body.chuyenMuc as { slug: string; soBai: number }[];
    expect(r.map((c) => c.slug)).toEqual(['sinh-thai', 'an-uong', 'vui-choi', 'luu-tru', 'di-chuyen']);
    expect(r.find((c) => c.slug === 'an-uong')!.soBai).toBe(1);
  });

  it('thêm: slug tự sinh từ tên; trùng → 409; slug hệ thống/sai dạng → 400', async () => {
    const r = await m.chinh.gui('post', '/chuyen-muc', { ten: 'Đồ chơi cho bé' });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ slug: 'do-choi-cho-be', ten: 'Đồ chơi cho bé', thuTu: 5 });
    expect((await m.chinh.gui('post', '/chuyen-muc', { ten: 'Đồ chơi cho bé' })).status).toBe(409);
    expect((await m.chinh.gui('post', '/chuyen-muc', { ten: 'X', slug: 'tim-kiem' })).status).toBe(400);
    expect((await m.chinh.gui('post', '/chuyen-muc', { ten: 'X', slug: 'Sai Dạng' })).status).toBe(400);
    expect((await m.chinh.gui('post', '/chuyen-muc', { ten: '' })).status).toBe(400);
  });

  it('thao tác làm đổi site: tăng noi_dung_phien và xếp lượt build', async () => {
    const y = m.yeuCau.so;
    await m.chinh.gui('post', '/chuyen-muc', { ten: 'Mới' });
    expect(m.yeuCau.so).toBe(y + 1);
  });
});

describe('xoá', () => {
  it('còn 3 bài, không chuyenSang → 409 soBai=3; có chuyenSang → 3 bài chuyển, chuyên mục biến mất', async () => {
    const ids = [await taoBai('a', ['an-uong']), await taoBai('b', ['an-uong', 'vui-choi']), await taoBai('c', ['an-uong'])];
    const r = await m.chinh.gui('delete', '/chuyen-muc/an-uong');
    expect(r.status).toBe(409);
    expect(r.body.soBai).toBe(3);
    const ok = await m.chinh.gui('delete', '/chuyen-muc/an-uong?chuyenSang=vui-choi');
    expect(ok.status).toBe(200);
    expect(ok.body.daChuyen).toBe(3);
    expect((await m.chinh.gui('get', '/chuyen-muc')).body.chuyenMuc.map((c: { slug: string }) => c.slug)).not.toContain('an-uong');
    expect(await chuyenMucCua(ids[0]!)).toEqual(['vui-choi']);
    expect(await chuyenMucCua(ids[1]!)).toEqual(['vui-choi']); // không bị trùng
  });

  it('chuyên mục không có bài xoá được ngay; chuyenSang lạ → 400; không có → 404', async () => {
    expect((await m.chinh.gui('delete', '/chuyen-muc/luu-tru')).status).toBe(200);
    await taoBai('a', ['an-uong']);
    expect((await m.chinh.gui('delete', '/chuyen-muc/an-uong?chuyenSang=khong-co')).status).toBe(400);
    expect((await m.chinh.gui('delete', '/chuyen-muc/an-uong?chuyenSang=an-uong')).status).toBe(400);
    expect((await m.chinh.gui('delete', '/chuyen-muc/khong-co')).status).toBe(404);
  });

  it('bài trong thùng rác cũng được tính khi xoá', async () => {
    const id = await taoBai('a', ['an-uong']);
    await m.chinh.gui('post', `/bai/${id}/thung-rac`);
    expect((await m.chinh.gui('delete', '/chuyen-muc/an-uong')).body.soBai).toBe(1);
  });
});

describe('đổi slug', () => {
  it('an-uong → am-thuc: bài cập nhật, có redirect /chu-de/an-uong/ → /chu-de/am-thuc/, sửa tên giữ nguyên slug', async () => {
    const id = await taoBai('a', ['an-uong', 'vui-choi'], true);
    const r = await m.chinh.gui('put', '/chuyen-muc/an-uong', { slug: 'am-thuc', ten: 'Ẩm thực' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ slug: 'am-thuc', ten: 'Ẩm thực' });
    expect(await chuyenMucCua(id)).toEqual(['am-thuc', 'vui-choi']);
    expect(redirects()).toEqual({ '/chu-de/an-uong/': '/chu-de/am-thuc/' });
    const d = mkdtempSync(join(tmpdir(), 'vtt-cm-'));
    xuatNoiDung(m.db, d, 'production');
    expect(JSON.parse(readFileSync(join(d, 'redirects.json'), 'utf8'))).toEqual([{ tu: '/chu-de/an-uong/', den: '/chu-de/am-thuc/' }]);
    expect(JSON.parse(readFileSync(join(d, 'chuyen-muc.json'), 'utf8')).map((c: { slug: string }) => c.slug)).toContain('am-thuc');
    expect((await m.chinh.gui('put', '/chuyen-muc/am-thuc', { moTa: 'Quán ngon' })).body.slug).toBe('am-thuc');
  });

  it('đổi sang slug đã có / trùng hệ thống → từ chối', async () => {
    expect((await m.chinh.gui('put', '/chuyen-muc/an-uong', { slug: 'vui-choi' })).status).toBe(409);
    expect((await m.chinh.gui('put', '/chuyen-muc/an-uong', { slug: 'chu-de' })).status).toBe(400);
    expect((await m.chinh.gui('put', '/chuyen-muc/khong-co', { ten: 'x' })).status).toBe(404);
  });
});

describe('thứ tự và kiểm tra tham chiếu', () => {
  it('đổi thứ tự: phải đủ và đúng danh sách; được xuất ra chuyen-muc.json theo thứ tự mới', async () => {
    const hien = ['di-chuyen', 'luu-tru', 'vui-choi', 'an-uong', 'sinh-thai'];
    expect((await m.chinh.gui('put', '/chuyen-muc/thu-tu', { slugs: hien.slice(1) })).status).toBe(400);
    expect((await m.chinh.gui('put', '/chuyen-muc/thu-tu', { slugs: [...hien.slice(1), 'la'] })).status).toBe(400);
    expect((await m.chinh.gui('put', '/chuyen-muc/thu-tu', { slugs: hien })).status).toBe(200);
    expect((await m.chinh.gui('get', '/chuyen-muc')).body.chuyenMuc.map((c: { slug: string }) => c.slug)).toEqual(hien);
    const d = mkdtempSync(join(tmpdir(), 'vtt-cm-'));
    xuatNoiDung(m.db, d, 'preview');
    expect(JSON.parse(readFileSync(join(d, 'chuyen-muc.json'), 'utf8')).map((c: { slug: string }) => c.slug)).toEqual(hien);
  });

  it('đăng bài tham chiếu chuyên mục không tồn tại → 400 nêu chuyên mục', async () => {
    const id = await taoBai('a', ['khong-co']);
    const r = await m.chinh.gui('post', `/bai/${id}/dang`);
    expect(r.status).toBe(400);
    expect(r.body.chiTiet.join('\n')).toMatch(/chuyên mục "khong-co" không tồn tại/);
  });
});
