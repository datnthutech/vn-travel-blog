// Bản dịch cấu trúc: chuyên mục, tỉnh, trang, menu, site, chuỗi giao diện — kiểm tra khoá, quyền, xuất ra file cho site.
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CHUOI_GIAO_DIEN_VI } from '@vntraveltips/schema';
import { beforeEach, describe, expect, it } from 'vitest';
import { xuatNoiDung } from '../noi-dung/xuat';
import { dungAdmin, taoAnhGia } from './thu-nghiem';

type Moi = Awaited<ReturnType<typeof dungAdmin>>;
let m: Moi;
beforeEach(async () => {
  m = await dungAdmin();
  taoAnhGia(m.anhDir, 'anh1');
  await m.chinh.gui('post', '/ngon-ngu', { ma: 'en', ten: 'English' });
});
const xuat = (target: 'production' | 'preview' = 'production') => {
  const d = mkdtempSync(join(tmpdir(), 'vtt-dct-'));
  xuatNoiDung(m.db, d, target, m.anhDir);
  return d;
};
const luu = (loai: string, khoa: string, du: object, ma = 'en') => m.chinh.gui('put', `/dich/${loai}/${khoa}/${ma}`, du);
const lay = (loai: string, khoa: string, ma = 'en') => m.chinh.gui('get', `/dich/${loai}/${khoa}/${ma}`);
const TINH = { ten: 'Vũng Tàu', slug: 'vung-tau', gioiThieu: 'Giới thiệu', anhBia: { ma: 'anh1', alt: 'Biển' }, moTa: 'Mô tả' };

describe('chuyên mục', () => {
  it('GET trả bản gốc + chưa dịch; lưu → có trong dich-cau-truc.json khi xuất; sửa lại ghi đè; chuyên mục lạ / ngôn ngữ lạ → 404', async () => {
    const slug = (m.db.prepare('SELECT slug FROM chuyen_muc LIMIT 1').get() as { slug: string }).slug;
    const g = (await lay('chuyen-muc', slug)).body;
    expect(g).toMatchObject({ loai: 'chuyen-muc', khoa: slug, ngonNgu: 'en', duLieu: null });
    expect(g.banGoc.ten).toBeTruthy();
    expect((await luu('chuyen-muc', slug, { ten: 'Food', moTa: 'About food' })).status).toBe(200);
    expect((await lay('chuyen-muc', slug)).body.duLieu).toEqual({ ten: 'Food', moTa: 'About food' });
    expect(JSON.parse(readFileSync(join(xuat(), 'dich-cau-truc.json'), 'utf8'))).toEqual([{ loai: 'chuyen-muc', khoa: slug, ngonNgu: 'en', duLieu: { ten: 'Food', moTa: 'About food' } }]);
    expect((await luu('chuyen-muc', slug, { ten: 'Dining', moTa: '' })).status).toBe(200);
    expect((await lay('chuyen-muc', slug)).body.duLieu.ten).toBe('Dining');
    expect((await luu('chuyen-muc', 'khong-co', { ten: 'X' })).status).toBe(404);
    expect((await luu('chuyen-muc', slug, { ten: 'X' }, 'fr')).status).toBe(404);
    expect((await luu('chuyen-muc', slug, { ten: 'X' }, 'vi')).status).toBe(404);
    expect((await luu('chuyen-muc', slug, { ten: '' })).status).toBe(400);
    expect((await luu('chuyen-muc', slug, { ten: 'x'.repeat(61) })).status).toBe(400);
    expect((await luu('chuyen-muc', slug, { ten: 5 })).status).toBe(400);
    expect((await lay('loai-la', slug)).status).toBe(400);
  });

  it('lưu bản dịch yêu cầu build lại và ghi nhật ký; writer → 403', async () => {
    const slug = (m.db.prepare('SELECT slug FROM chuyen_muc LIMIT 1').get() as { slug: string }).slug;
    const truoc = m.yeuCau.so;
    await luu('chuyen-muc', slug, { ten: 'Food' });
    expect(m.yeuCau.so).toBeGreaterThan(truoc);
    expect(m.db.prepare("SELECT count(*) AS n FROM nhat_ky WHERE loai = 'luu-dich-cau-truc'").get()).toEqual({ n: 1 });
    const w = await m.dangNhap('w@x.vn', 'W', 'writer');
    expect((await w.gui('put', `/dich/chuyen-muc/${slug}/en`, { ten: 'x' })).status).toBe(403);
    expect((await w.gui('get', `/dich/chuyen-muc/${slug}/en`)).status).toBe(403);
  });
});

describe('tỉnh, menu, site', () => {
  it('tỉnh: ten/gioiThieu/moTa/anhBiaAlt; tỉnh không có → 404', async () => {
    await m.chinh.gui('post', '/tinh', TINH);
    expect((await lay('tinh', 'vung-tau')).body.banGoc).toEqual({ ten: 'Vũng Tàu', gioiThieu: 'Giới thiệu', moTa: 'Mô tả', anhBiaAlt: 'Biển' });
    const du = { ten: 'Vung Tau', gioiThieu: 'Intro', moTa: 'Desc', anhBiaAlt: 'Sea' };
    expect((await luu('tinh', 'vung-tau', du)).body.duLieu).toEqual(du);
    expect((await luu('tinh', 'na', du)).status).toBe(404);
  });

  it('menu: khoá dauTrang.<i>[.<j>] theo mục có thật; nhãn ≤ 40; mục không có → 404; khoá sai dạng → 404', async () => {
    await m.chinh.gui('put', '/menu', { dauTrang: [{ nhan: 'Giới thiệu', loai: 'trang', giaTri: 'gioi-thieu', con: [{ nhan: 'Liên hệ', loai: 'trang', giaTri: 'lien-he' }] }], chanTrang: [] });
    expect((await lay('menu', 'dauTrang.0')).body.banGoc).toEqual({ nhan: 'Giới thiệu' });
    expect((await lay('menu', 'dauTrang.0.0')).body.banGoc).toEqual({ nhan: 'Liên hệ' });
    expect((await luu('menu', 'dauTrang.0', { nhan: 'About' })).status).toBe(200);
    expect((await luu('menu', 'dauTrang.0.0', { nhan: 'Contact' })).status).toBe(200);
    expect((await luu('menu', 'dauTrang.5', { nhan: 'x' })).status).toBe(404);
    expect((await luu('menu', 'giua.0', { nhan: 'x' })).status).toBe(404);
    expect((await luu('menu', 'dauTrang.0', { nhan: 'x'.repeat(41) })).status).toBe(400);
    const dc = JSON.parse(readFileSync(join(xuat(), 'dich-cau-truc.json'), 'utf8')) as { khoa: string }[];
    expect(dc.map((x) => x.khoa).sort()).toEqual(['dauTrang.0', 'dauTrang.0.0']);
  });

  it('site và giao-dien cần cai-dat.sua: quản lý (có cau-truc.sua) → 403, quản trị → 200', async () => {
    const ql = await m.dangNhap('ql@x.vn', 'QL', 'quan-ly');
    expect((await ql.gui('put', '/dich/site/site/en', { tenSite: 'X', moTaMacDinh: 'Y' })).status).toBe(403);
    expect((await ql.gui('get', '/dich/giao-dien/giao-dien/en')).status).toBe(403);
    expect((await ql.gui('get', '/dich/chuyen-muc/khong-co/en')).status).toBe(404); // loại cấu trúc: được phép (không 403)
    expect((await luu('site', 'site', { tenSite: 'VNTravelTips EN', moTaMacDinh: 'Family travel diary' })).status).toBe(200);
    expect((await luu('site', 'site', { tenSite: '', moTaMacDinh: 'x' })).status).toBe(400);
    expect((await luu('site', 'khac', { tenSite: 'a', moTaMacDinh: 'b' })).status).toBe(404);
  });
});

describe('chuỗi giao diện', () => {
  it('GET trả toàn bộ khoá tiếng Việt; lưu → giao-dien/en.json khi xuất; khoá lạ → 400; thiếu {n} → 400; để trống = chưa dịch (bỏ)', async () => {
    expect(Object.keys((await lay('giao-dien', 'giao-dien')).body.banGoc)).toEqual(Object.keys(CHUOI_GIAO_DIEN_VI));
    const r = await luu('giao-dien', 'giao-dien', { 'tra-nhanh': 'Quick facts', 'cho-quan-an': 'Markets & eateries ({n})', 'gia': '  ' });
    expect(r.status).toBe(200);
    expect(r.body.duLieu).toEqual({ 'tra-nhanh': 'Quick facts', 'cho-quan-an': 'Markets & eateries ({n})' });
    expect(JSON.parse(readFileSync(join(xuat(), 'giao-dien/en.json'), 'utf8'))).toEqual(r.body.duLieu);
    const loi = await luu('giao-dien', 'giao-dien', { 'khoa-khong-co': 'x' });
    expect(loi.status).toBe(400);
    expect(loi.body.loi).toMatch(/khoa-khong-co.*không có trong bản tiếng Việt/);
    expect((await luu('giao-dien', 'giao-dien', { 'cho-quan-an': 'Markets' })).body.loi).toMatch(/\{n\}/);
    expect((await luu('giao-dien', 'giao-dien', { 'tra-nhanh': 5 })).status).toBe(400);
    expect((await luu('giao-dien', 'khac', {})).status).toBe(404);
  });
});

describe('trang tĩnh', () => {
  const baseTrang = { tieuDe: 'About us', moTa: 'About', noiDung: 'We are a family.', slug: 'about-us' };
  it('lưu bản dịch trang gioi-thieu; nháp: chỉ có ở preview; đăng (trangThai da-dang): có ở production tại trang-dich/en/<slug>.md với slugGoc', async () => {
    expect((await lay('trang', 'gioi-thieu')).body.banGoc).toMatchObject({ slug: 'gioi-thieu' });
    expect((await luu('trang', 'gioi-thieu', baseTrang)).body.duLieu).toMatchObject({ trangThai: 'nhap', slug: 'about-us' });
    await m.chinh.gui('post', '/trang/gioi-thieu/dang');
    expect(existsSync(join(xuat('production'), 'trang-dich/en/about-us.md'))).toBe(false);
    expect(readFileSync(join(xuat('preview'), 'trang-dich/en/about-us.md'), 'utf8')).toContain('slugGoc: gioi-thieu');
    await luu('trang', 'gioi-thieu', { ...baseTrang, trangThai: 'da-dang' });
    const md = readFileSync(join(xuat('production'), 'trang-dich/en/about-us.md'), 'utf8');
    expect(md).toContain('tieuDe: About us');
    expect(md).toContain('slugGoc: gioi-thieu');
    expect(md).toContain('We are a family.');
    expect(JSON.parse(readFileSync(join(xuat(), 'dich-cau-truc.json'), 'utf8'))).toEqual([]); // trang xuất thành file, không lặp trong json
  });

  it('slug dịch trùng slug tỉnh / hệ thống / bản dịch trang khác / sai dạng → lỗi; trang gốc chưa đăng thì bản dịch không xuất', async () => {
    await m.chinh.gui('post', '/tinh', TINH);
    expect((await luu('trang', 'gioi-thieu', { ...baseTrang, slug: 'vung-tau' })).status).toBe(400);
    expect((await luu('trang', 'gioi-thieu', { ...baseTrang, slug: 'chu-de' })).status).toBe(400);
    expect((await luu('trang', 'gioi-thieu', { ...baseTrang, slug: 'Sai Slug' })).status).toBe(400);
    expect((await luu('trang', 'gioi-thieu', baseTrang)).status).toBe(200);
    expect((await luu('trang', 'lien-he', { ...baseTrang, slug: 'about-us' })).status).toBe(409);
    expect((await luu('trang', 'gioi-thieu', { ...baseTrang, trangThai: 'xuat-ban' })).status).toBe(400);
    expect((await luu('trang', 'khong-co', baseTrang)).status).toBe(404);
    m.db.prepare("UPDATE trang SET trang_thai = 'nhap' WHERE slug = 'gioi-thieu'").run();
    await luu('trang', 'gioi-thieu', { ...baseTrang, trangThai: 'da-dang' });
    expect(existsSync(join(xuat('production'), 'trang-dich/en/about-us.md'))).toBe(false);
  });
});
