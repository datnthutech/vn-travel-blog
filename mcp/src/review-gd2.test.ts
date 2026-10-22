// Các lỗi tìm thấy khi review giai đoạn 2 — mỗi test tái hiện một lỗi.
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { baiDayDu, dungAdmin, taoAnhGia } from './admin-api/thu-nghiem';
import { themRedirectKhiDoiUrl } from './noi-dung/bai';
import { timAnhDungO } from './noi-dung/anh-dung-o-dau';
import { xuatNoiDung } from './noi-dung/xuat';

async function mayCoBai() {
  const m = await dungAdmin();
  taoAnhGia(m.anhDir, 'anh1');
  const id = (await m.chinh.gui('post', '/bai', { bai: baiDayDu('a'), noiDung: 'x' })).body.id as number;
  return { m, id };
}

describe('review GĐ2', () => {
  it('xem trước bài ĐANG ĐĂNG với dữ liệu thiếu luật → 400, bài thật không bị ghi đè/biến mất', async () => {
    const { m, id } = await mayCoBai();
    await m.chinh.gui('post', `/bai/${id}/dang`);
    const g = (await m.chinh.gui('get', `/bai/${id}`)).body;
    const { moTa: _m, ...thieu } = g.bai;
    const r = await m.chinh.gui('post', `/bai/${id}/xem-truoc`, { bai: thieu, noiDung: 'x', phienSo: g.phienSo });
    expect(r.status).toBe(400);
    expect((await m.chinh.gui('get', `/bai/${id}`)).body.bai.moTa).toBe(g.bai.moTa);
    const d = mkdtempSync(join(tmpdir(), 'vtt-r-'));
    expect(xuatNoiDung(m.db, d, 'production').soBai).toBe(1);
  });

  it('hẹn giờ bài ĐÃ ĐĂNG → 409, không bị gỡ', async () => {
    const { m, id } = await mayCoBai();
    await m.chinh.gui('post', `/bai/${id}/dang`);
    expect((await m.chinh.gui('post', `/bai/${id}/hen-gio`, { luc: '2026-12-01T07:00' })).status).toBe(409);
    expect((await m.chinh.gui('get', `/bai/${id}`)).body.trangThai).toBe('da-dang');
  });

  it('themRedirectKhiDoiUrl xoá thật redirect tự trỏ vào chính nó', async () => {
    const { m } = await mayCoBai();
    m.db.prepare("INSERT INTO redirect (tu, den) VALUES ('/x/', '/b/')").run();
    themRedirectKhiDoiUrl(m.db, '/b/', '/x/'); // UPDATE đổi den '/b/' → '/x/' làm '/x/'→'/x/'
    expect(m.db.prepare('SELECT count(*) AS n FROM redirect WHERE tu = den').get()).toEqual({ n: 0 });
  });

  it('tải lại ĐÚNG ảnh đã có không làm mất alt mặc định / tên gốc', async () => {
    const m = await dungAdmin();
    const jpeg = await sharp({ create: { width: 300, height: 200, channels: 3, background: '#123456' } }).jpeg().toBuffer();
    const up = () => m.chinh.gui('post', '/anh').attach('files', jpeg, 'goc.jpg');
    const ma = (await up()).body.ok[0].ma as string;
    await m.chinh.gui('patch', `/anh/${ma}`, { altMacDinh: 'Mô tả của tôi' });
    m.db.prepare('INSERT OR IGNORE INTO anh (ma, ten_goc, rong, cao, byte, tai_len_luc) VALUES (?,?,?,?,?,?)').run(ma, 'goc.jpg', 300, 200, 1, 1);
    // mô phỏng upload trùng mã: dòng đã có, ON CONFLICT chỉ cập nhật byte
    m.db.prepare('INSERT INTO anh (ma, ten_goc, rong, cao, byte, tai_len_luc) VALUES (?,?,?,?,?,?) ON CONFLICT(ma) DO UPDATE SET byte = excluded.byte').run(ma, 'khac.jpg', 1, 1, 5, 9);
    const dong = m.db.prepare('SELECT alt_mac_dinh, ten_goc FROM anh WHERE ma = ?').get(ma);
    expect(dong).toEqual({ alt_mac_dinh: 'Mô tả của tôi', ten_goc: 'goc.jpg' });
    expect(readdirSync(m.anhDir).includes(ma)).toBe(true);
  });

  it('ảnh chỉ có trong bản TỰ LƯU cũng được tính là đang dùng (không xoá được)', async () => {
    const { m, id } = await mayCoBai();
    taoAnhGia(m.anhDir, 'tuluu1');
    const g = (await m.chinh.gui('get', `/bai/${id}`)).body;
    await m.chinh.gui('patch', `/bai/${id}/tu-luu`, { bai: g.bai, noiDung: 'có ảnh ![x](anh:tuluu1)', phienSo: g.phienSo });
    expect(timAnhDungO(m.db).bai.get('tuluu1')).toEqual([id]);
    m.db.prepare('INSERT OR IGNORE INTO anh (ma, rong, cao, byte, tai_len_luc) VALUES (?,?,?,?,?)').run('tuluu1', 1, 1, 1, 1);
    expect((await m.chinh.gui('delete', '/anh/tuluu1')).status).toBe(409);
  });

  it('preview: nháp trỏ tới ảnh không có thật bị bỏ khỏi xuất (không làm hỏng build preview của mọi người)', async () => {
    const { m } = await mayCoBai();
    await m.chinh.gui('post', '/bai', { bai: baiDayDu('hong', { anhBia: { ma: 'khongco', alt: 'x' } }), noiDung: 'y' });
    const d = mkdtempSync(join(tmpdir(), 'vtt-p-'));
    xuatNoiDung(m.db, d, 'preview', m.anhDir);
    expect(readdirSync(join(d, 'bai-viet')).sort()).toEqual(['a.md']);
    const d2 = mkdtempSync(join(tmpdir(), 'vtt-p2-'));
    xuatNoiDung(m.db, d2, 'preview'); // không truyền anhDir: không kiểm tra thêm
    expect(readdirSync(join(d2, 'bai-viet')).sort()).toEqual(['a.md', 'hong.md']);
  });
});
