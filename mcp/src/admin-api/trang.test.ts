// Trang tĩnh: 3 trang cố định, trang tự tạo ở /trang/<slug>/, phiên bản, tự lưu, đăng/gỡ, redirect khi đổi slug.
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { xuatNoiDung } from '../noi-dung/xuat';
import { dungAdmin } from './thu-nghiem';

type Moi = Awaited<ReturnType<typeof dungAdmin>>;
let m: Moi;
beforeEach(async () => {
  m = await dungAdmin();
});
const xuat = (t: 'production' | 'preview') => {
  const d = mkdtempSync(join(tmpdir(), 'vtt-trang-'));
  xuatNoiDung(m.db, d, t);
  return d;
};
const BAI = { tieuDe: 'Hợp tác với chúng tôi', moTa: 'Cách hợp tác', noiDung: 'Nội dung **đậm**' };

describe('trang cố định', () => {
  it('có sẵn 3 trang cố định đã đăng với nội dung mặc định, xuất ra production', async () => {
    const ds = (await m.chinh.gui('get', '/trang')).body.trang as { slug: string; coDinh: boolean; trangThai: string }[];
    expect(ds.filter((t) => t.coDinh).map((t) => t.slug).sort()).toEqual(['chinh-sach-lien-ket', 'gioi-thieu', 'lien-he']);
    expect(ds.every((t) => t.trangThai === 'da-dang')).toBe(true);
    expect(existsSync(join(xuat('production'), 'trang/gioi-thieu.md'))).toBe(true);
  });

  it('xoá / gỡ / đổi slug trang cố định → 409', async () => {
    expect((await m.chinh.gui('delete', '/trang/gioi-thieu')).status).toBe(409);
    expect((await m.chinh.gui('post', '/trang/gioi-thieu/go')).status).toBe(409);
    expect((await m.chinh.gui('put', '/trang/gioi-thieu', { slug: 've-chung-toi' })).status).toBe(409);
  });

  it('sửa gioi-thieu: nội dung mới được xuất, tăng phiên bản, xếp build, ghi nhật ký', async () => {
    const y = m.yeuCau.so;
    const r = await m.chinh.gui('put', '/trang/gioi-thieu', { tieuDe: 'Về chúng tôi', noiDung: 'Nội dung mới hoàn toàn' });
    expect(r.status).toBe(200);
    expect(m.yeuCau.so).toBe(y + 1);
    const md = readFileSync(join(xuat('production'), 'trang/gioi-thieu.md'), 'utf8');
    expect(md).toContain('tieuDe: Về chúng tôi');
    expect(md).toContain('Nội dung mới hoàn toàn');
    expect(m.db.prepare("SELECT count(*) AS n FROM phien_ban WHERE trang_slug = 'gioi-thieu'").get()).toEqual({ n: 1 });
  });
});

describe('trang tự tạo', () => {
  it('tạo nháp: slug từ tiêu đề; nháp KHÔNG có ở production nhưng có ở preview; đăng → có ở production', async () => {
    const r = await m.chinh.gui('post', '/trang', BAI);
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ slug: 'hop-tac-voi-chung-toi', trangThai: 'nhap', coDinh: false });
    expect(existsSync(join(xuat('production'), 'trang/hop-tac-voi-chung-toi.md'))).toBe(false);
    expect(existsSync(join(xuat('preview'), 'trang/hop-tac-voi-chung-toi.md'))).toBe(true);
    expect((await m.chinh.gui('post', '/trang/hop-tac-voi-chung-toi/dang')).status).toBe(200);
    expect(existsSync(join(xuat('production'), 'trang/hop-tac-voi-chung-toi.md'))).toBe(true);
    expect((await m.chinh.gui('post', '/trang/hop-tac-voi-chung-toi/go')).status).toBe(200);
    expect(existsSync(join(xuat('production'), 'trang/hop-tac-voi-chung-toi.md'))).toBe(false);
  });

  it('slug lien-he (đã có) → 400/409; trùng đường dẫn hệ thống, trùng tỉnh, sai dạng → 400', async () => {
    expect((await m.chinh.gui('post', '/trang', { ...BAI, slug: 'lien-he' })).status).toBe(409);
    for (const slug of ['tim-kiem', 'quan-tri', 'trang', 'Sai Dạng']) expect((await m.chinh.gui('post', '/trang', { ...BAI, slug })).status, slug).toBe(400);
    m.db.prepare("INSERT INTO tinh (slug, du_lieu) VALUES ('vung-tau', '{}')").run();
    expect((await m.chinh.gui('post', '/trang', { ...BAI, slug: 'vung-tau' })).status).toBe(400);
    expect((await m.chinh.gui('post', '/trang', { tieuDe: '' })).status).toBe(400);
  });

  it('đăng khi nội dung rỗng → 400; đăng 2 lần → 409; xoá trang tự tạo OK và dọn lịch sử', async () => {
    await m.chinh.gui('post', '/trang', { tieuDe: 'Trang trống' });
    expect((await m.chinh.gui('post', '/trang/trang-trong/dang')).status).toBe(400);
    await m.chinh.gui('post', '/trang', { ...BAI, slug: 'hop-tac' });
    await m.chinh.gui('post', '/trang/hop-tac/dang');
    expect((await m.chinh.gui('post', '/trang/hop-tac/dang')).status).toBe(409);
    expect((await m.chinh.gui('delete', '/trang/hop-tac')).status).toBe(200);
    expect((await m.chinh.gui('get', '/trang/hop-tac')).status).toBe(404);
    expect(m.db.prepare("SELECT count(*) AS n FROM phien_ban WHERE trang_slug = 'hop-tac'").get()).toEqual({ n: 0 });
  });

  it('đổi slug trang đã đăng → redirect /trang/cu/ → /trang/moi/ (có trong redirects.json xuất)', async () => {
    await m.chinh.gui('post', '/trang', { ...BAI, slug: 'cu' });
    await m.chinh.gui('post', '/trang/cu/dang');
    expect((await m.chinh.gui('put', '/trang/cu', { slug: 'moi' })).status).toBe(200);
    expect(JSON.parse(readFileSync(join(xuat('production'), 'redirects.json'), 'utf8'))).toEqual([{ tu: '/trang/cu/', den: '/trang/moi/' }]);
    expect(m.db.prepare("SELECT count(*) AS n FROM phien_ban WHERE trang_slug = 'moi'").get()).toEqual({ n: 2 });
  });
});

describe('xung đột phiên bản và tự lưu', () => {
  it('hai PUT cùng phienSo → lần 2 nhận 409 nêu tên người sửa trước', async () => {
    const hai = await m.dangNhap('hai@x.vn', 'Người Hai');
    const t = (await m.chinh.gui('get', '/trang/lien-he')).body;
    expect((await m.chinh.gui('put', '/trang/lien-he', { noiDung: 'Bản của chủ', phienSo: t.phienSo })).status).toBe(200);
    const r = await hai.gui('put', '/trang/lien-he', { noiDung: 'Bản của hai', phienSo: t.phienSo });
    expect(r.status).toBe(409);
    expect(r.body.loi).toMatch(/Chủ blog.*sửa lúc/);
  });

  it('tự lưu chỉ ghi nhap_tu_luu: không tạo phiên bản, không đổi noi_dung_phien; GET trả nhapTuLuu', async () => {
    const phien = () => (m.db.prepare("SELECT gia_tri FROM he_thong WHERE khoa = 'noi_dung_phien'").get() as { gia_tri: string }).gia_tri;
    const p0 = phien();
    const t = (await m.chinh.gui('get', '/trang/lien-he')).body;
    expect((await m.chinh.gui('patch', '/trang/lien-he/tu-luu', { tieuDe: 'Liên hệ', noiDung: 'đang gõ dở', phienSo: t.phienSo })).status).toBe(200);
    expect(phien()).toBe(p0);
    expect((await m.chinh.gui('get', '/trang/lien-he')).body.nhapTuLuu).toMatchObject({ noiDung: 'đang gõ dở' });
    expect((await m.chinh.gui('patch', '/trang/lien-he/tu-luu', { noiDung: 'x', phienSo: t.phienSo + 9 })).status).toBe(409);
  });

  it('GET lịch sử phiên bản của trang', async () => {
    await m.chinh.gui('put', '/trang/lien-he', { noiDung: 'v1' });
    await m.chinh.gui('put', '/trang/lien-he', { noiDung: 'v2' });
    const ds = (await m.chinh.gui('get', '/trang/lien-he/phien-ban')).body as { nguoiSua: { ten: string } }[];
    expect(ds).toHaveLength(2);
    expect(ds[0]!.nguoiSua.ten).toBe('Chủ blog');
  });
});
