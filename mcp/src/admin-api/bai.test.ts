// API bài viết: tạo nháp, sửa có kiểm tra phiên bản (Review Focus 1), tự lưu, danh sách có lọc.
import { beforeEach, describe, expect, it } from 'vitest';
import { baiDayDu, dungAdmin, taoAnhGia } from './thu-nghiem';

type Moi = Awaited<ReturnType<typeof dungAdmin>>;
let m: Moi;
beforeEach(async () => {
  m = await dungAdmin();
  taoAnhGia(m.anhDir, 'anh1');
});
const phien = (db: Moi['db']) => Number((db.prepare("SELECT gia_tri FROM he_thong WHERE khoa='noi_dung_phien'").get() as { gia_tri: string }).gia_tri);
const taoNhap = async (slug = 'bai-1', bai: object = baiDayDu(slug)) => (await m.chinh.gui('post', '/bai', { bai, noiDung: 'Thân bài' })).body as { id: number; phienSo: number };

describe('tạo bài', () => {
  it('nháp thiếu moTa/ảnh bìa → 201; tác giả là người đăng nhập; gọi yêu cầu build', async () => {
    const r = await m.chinh.gui('post', '/bai', { bai: { tieuDe: 'Nháp dở', slug: 'nhap-do' }, noiDung: '' });
    expect(r.status).toBe(201);
    expect(r.body).toEqual({ id: expect.any(Number), phienSo: 1 });
    const g = await m.chinh.gui('get', `/bai/${r.body.id}`);
    expect(g.body).toMatchObject({ trangThai: 'nhap', phienSo: 1, tacGia: { ten: 'Chủ blog' } });
    expect(g.body.bai).toMatchObject({ tieuDe: 'Nháp dở' });
    expect(m.yeuCau.so).toBe(1);
  });

  it('thiếu tieuDe/slug sai dạng/thân không phải chuỗi → 400; slug trùng → 409', async () => {
    expect((await m.chinh.gui('post', '/bai', { bai: { slug: 'a' }, noiDung: '' })).status).toBe(400);
    expect((await m.chinh.gui('post', '/bai', { bai: { tieuDe: 'x', slug: 'Sai Dạng' }, noiDung: '' })).status).toBe(400);
    expect((await m.chinh.gui('post', '/bai', { bai: { tieuDe: 'x', slug: 'a' }, noiDung: 5 })).status).toBe(400);
    await taoNhap('trung');
    expect((await m.chinh.gui('post', '/bai', { bai: { tieuDe: 'y', slug: 'trung' }, noiDung: '' })).status).toBe(409);
  });

  it('bản nháp thiếu trường không làm hỏng xuất preview (bị bỏ qua, không văng lỗi)', async () => {
    const { xuatNoiDung } = await import('../noi-dung/xuat');
    const { mkdtempSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    await m.chinh.gui('post', '/bai', { bai: { tieuDe: 'Nháp dở', slug: 'nhap-do' }, noiDung: '' });
    await taoNhap('day-du');
    expect(xuatNoiDung(m.db, mkdtempSync(join(tmpdir(), 'vtt-x-')), 'preview').soBai).toBe(1);
  });
});

describe('sửa bài và xung đột (Review Focus 1)', () => {
  it('PUT bài đã đăng thiếu moTa → 400 có đường dẫn moTa, không ghi gì', async () => {
    const { id, phienSo } = await taoNhap('da-dang-1');
    m.db.prepare("UPDATE ban_dich SET trang_thai = 'da-dang' WHERE bai_id = ?").run(id);
    const { moTa: _m, ...thieu } = baiDayDu('da-dang-1');
    const r = await m.chinh.gui('put', `/bai/${id}`, { bai: thieu, noiDung: 'x', phienSo });
    expect(r.status).toBe(400);
    expect(r.body.chiTiet.join('\n')).toMatch(/moTa/);
    expect((await m.chinh.gui('get', `/bai/${id}`)).body.phienSo).toBe(phienSo);
  });

  it('PUT nháp: tăng phienSo, đổi nguoiSuaCuoi, tạo phiên bản, xoá bản tự lưu, tăng noi_dung_phien', async () => {
    const { id, phienSo } = await taoNhap();
    const khac = await m.dangNhap('hai@x.vn', 'Người Hai');
    await m.chinh.gui('patch', `/bai/${id}/tu-luu`, { bai: baiDayDu('bai-1'), noiDung: 'tự lưu', phienSo });
    const truoc = phien(m.db);
    const r = await khac.gui('put', `/bai/${id}`, { bai: baiDayDu('bai-1', { tieuDe: 'Đã sửa' }), noiDung: 'mới', phienSo });
    expect(r.body).toEqual({ id, phienSo: phienSo + 1 });
    const g = (await m.chinh.gui('get', `/bai/${id}`)).body;
    expect(g.nguoiSuaCuoi.ten).toBe('Người Hai');
    expect(g.tacGia.ten).toBe('Chủ blog');
    expect(g.banNhapTuLuu).toBeUndefined();
    expect(phien(m.db)).toBe(truoc + 1);
    expect((m.db.prepare('SELECT count(*) AS n FROM phien_ban WHERE bai_id = ?').get(id) as { n: number }).n).toBe(2);
  });

  it('hai PUT cùng phienSo (2 người) → lần 2 nhận 409 nêu tên người sửa trước, bản của người đầu giữ nguyên', async () => {
    const { id, phienSo } = await taoNhap();
    const hai = await m.dangNhap('hai@x.vn', 'Người Hai');
    expect((await m.chinh.gui('put', `/bai/${id}`, { bai: baiDayDu('bai-1', { tieuDe: 'Của chủ' }), noiDung: 'a', phienSo })).status).toBe(200);
    const r = await hai.gui('put', `/bai/${id}`, { bai: baiDayDu('bai-1', { tieuDe: 'Của hai' }), noiDung: 'b', phienSo });
    expect(r.status).toBe(409);
    expect(r.body.loi).toMatch(/Chủ blog.*sửa lúc.*Tải lại/);
    expect(r.body.nguoiSua).toBe('Chủ blog');
    expect(typeof r.body.luc).toBe('number');
    expect((await hai.gui('get', `/bai/${id}`)).body.bai.tieuDe).toBe('Của chủ');
  });

  it('bài không tồn tại / id lạ → 404', async () => {
    expect((await m.chinh.gui('get', '/bai/9999')).status).toBe(404);
    expect((await m.chinh.gui('put', '/bai/abc', { bai: {}, noiDung: '' })).status).toBe(404);
  });
});

describe('tự lưu', () => {
  it('không tạo phiên bản, không đổi noi_dung_phien, GET trả banNhapTuLuu; sai phienSo → 409', async () => {
    const { id, phienSo } = await taoNhap();
    const truoc = phien(m.db);
    m.dongHo.v += 30_000;
    const r = await m.chinh.gui('patch', `/bai/${id}/tu-luu`, { bai: baiDayDu('bai-1', { tieuDe: 'Đang gõ' }), noiDung: 'dở dang', phienSo });
    expect(r.status).toBe(200);
    expect(phien(m.db)).toBe(truoc);
    expect((m.db.prepare('SELECT count(*) AS n FROM phien_ban WHERE bai_id = ?').get(id) as { n: number }).n).toBe(1);
    const g = (await m.chinh.gui('get', `/bai/${id}`)).body;
    expect(g.banNhapTuLuu).toMatchObject({ noiDung: 'dở dang', bai: { tieuDe: 'Đang gõ' } });
    expect(g.bai.tieuDe).toBe('Bài bai-1'); // bản đã lưu không đổi
    expect((await m.chinh.gui('patch', `/bai/${id}/tu-luu`, { bai: {}, noiDung: '', phienSo: phienSo + 5 })).status).toBe(409);
  });

  it('tự lưu liên tục 11 phút → đúng 1 phiên bản mới (chốt sau mỗi 10 phút)', async () => {
    const { id, phienSo } = await taoNhap();
    for (let s = 30; s <= 11 * 60; s += 30) {
      m.dongHo.v += 30_000;
      await m.chinh.gui('patch', `/bai/${id}/tu-luu`, { bai: baiDayDu('bai-1'), noiDung: `lần ${s}`, phienSo });
    }
    expect((m.db.prepare('SELECT count(*) AS n FROM phien_ban WHERE bai_id = ?').get(id) as { n: number }).n).toBe(2);
  });
});

describe('danh sách', () => {
  it('lọc trangThai/tìm kiếm/tỉnh/tác giả, mới sửa trước, 20 bài/trang, thùng rác riêng', async () => {
    const a = await taoNhap('bien-vung-tau', baiDayDu('bien-vung-tau', { tinh: 'vung-tau' }));
    const b = await taoNhap('an-uong');
    m.db.prepare("UPDATE ban_dich SET trang_thai = 'da-dang' WHERE bai_id = ?").run(b.id);
    const c = await taoNhap('bi-xoa');
    m.db.prepare('UPDATE bai SET xoa_luc = 1 WHERE id = ?').run(c.id);
    m.dongHo.v += 1000;
    m.db.prepare('UPDATE ban_dich SET sua_luc = ? WHERE bai_id = ?').run(m.dongHo.v, a.id);
    const ds = async (qs: string) => (await m.chinh.gui('get', `/bai${qs}`)).body as { bai: { id: number; slug: string }[]; tong: number };
    expect((await ds('')).bai.map((x) => x.slug)).toEqual(['bien-vung-tau', 'an-uong']);
    expect((await ds('?trangThai=nhap')).bai.map((x) => x.slug)).toEqual(['bien-vung-tau']);
    expect((await ds('?trangThai=da-dang')).bai.map((x) => x.slug)).toEqual(['an-uong']);
    expect((await ds('?trangThai=thung-rac')).bai.map((x) => x.slug)).toEqual(['bi-xoa']);
    expect((await ds('?q=bien')).tong).toBe(1);
    expect((await ds('?q=%25')).tong).toBe(0); // ký tự đặc biệt của LIKE không khớp tất cả
    expect((await ds('?tinh=vung-tau')).bai).toHaveLength(1);
    expect((await ds(`?tacGia=${m.chinh.nguoi.id}`)).tong).toBe(2);
    expect((await ds('?tacGia=999')).tong).toBe(0);
    expect((await m.chinh.gui('get', '/bai?trangThai=linh-tinh')).status).toBe(400);
    const dau = (await ds('')).bai[0] as unknown as Record<string, unknown>;
    expect(dau).toMatchObject({ tieuDe: 'Bài bien-vung-tau', trangThai: 'nhap', tinh: 'vung-tau', tacGia: { ten: 'Chủ blog' } });
  });

  it('phân trang 20/trang; chuyên mục lọc đúng', async () => {
    for (let i = 0; i < 25; i++) await taoNhap(`bai-${i}`, baiDayDu(`bai-${i}`, { chuyenMuc: i % 2 ? ['an-uong'] : ['vui-choi'] }));
    const t1 = (await m.chinh.gui('get', '/bai')).body;
    const t2 = (await m.chinh.gui('get', '/bai?trang=2')).body;
    expect(t1.bai).toHaveLength(20);
    expect(t2.bai).toHaveLength(5);
    expect(t1.tong).toBe(25);
    expect((await m.chinh.gui('get', '/bai?chuyenMuc=an-uong')).body.tong).toBe(12);
  });

  it('GET /tinh trả danh sách tỉnh (có số bài)', async () => {
    m.db.prepare("INSERT INTO tinh (slug, du_lieu) VALUES ('vung-tau', ?)").run(JSON.stringify({ ten: 'Vũng Tàu', slug: 'vung-tau', gioiThieu: 'g', anhBia: { ma: 'x', alt: 'y' }, moTa: 'm' }));
    expect((await m.chinh.gui('get', '/tinh')).body.tinh).toEqual([expect.objectContaining({ slug: 'vung-tau', ten: 'Vũng Tàu', soBai: 0 })]);
  });

  it('chưa đăng nhập → 401', async () => {
    const { default: request } = await import('supertest');
    expect((await request(m.app).get('/api/admin/bai')).status).toBe(401);
  });
});
