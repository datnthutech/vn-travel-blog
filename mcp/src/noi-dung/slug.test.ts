// Slug không trùng + redirect 301 tự động khi đổi slug/tỉnh của bài đã đăng (Review Focus 2).
import { describe, expect, it } from 'vitest';
import { moDb } from '../db/ket-noi';
import { baiDayDu, dungAdmin, taoAnhGia } from '../admin-api/thu-nghiem';
import { luuBai, slugKhongTrung } from './bai';
import type { BaiViet } from '@vntraveltips/schema';

const luu = (db: ReturnType<typeof moDb>, slug: string, over: Record<string, unknown> = {}, id?: number, trangThai: 'nhap' | 'da-dang' = 'da-dang') =>
  luuBai(db, { id, ngonNgu: 'vi', bai: baiDayDu(slug, over) as unknown as BaiViet, noiDung: 'x', trangThai }).id;
const redirects = (db: ReturnType<typeof moDb>) => Object.fromEntries((db.prepare('SELECT tu, den FROM redirect').all() as { tu: string; den: string }[]).map((r) => [r.tu, r.den]));

describe('slugKhongTrung', () => {
  it('chưa trùng → giữ nguyên; trùng → -2; có cả -2 → -3', () => {
    const db = moDb(':memory:');
    expect(slugKhongTrung(db, 'vi', 'da-lat')).toBe('da-lat');
    luu(db, 'da-lat');
    expect(slugKhongTrung(db, 'vi', 'da-lat')).toBe('da-lat-2');
    luu(db, 'da-lat-2');
    expect(slugKhongTrung(db, 'vi', 'da-lat')).toBe('da-lat-3');
  });

  it('slug hệ thống (admin, tim-kiem) → -2; bài đang sửa không tự trùng chính nó', () => {
    const db = moDb(':memory:');
    expect(slugKhongTrung(db, 'vi', 'admin')).toBe('admin-2');
    expect(slugKhongTrung(db, 'vi', 'tim-kiem')).toBe('tim-kiem-2');
    const id = luu(db, 'da-lat');
    expect(slugKhongTrung(db, 'vi', 'da-lat', id)).toBe('da-lat');
  });
});

describe('redirect khi đổi URL bài đã đăng', () => {
  it('đổi slug a→b rồi b→c → /kinh-nghiem/a/→c và /b/→c (không chuỗi 301)', () => {
    const db = moDb(':memory:');
    const id = luu(db, 'a');
    luu(db, 'b', {}, id);
    expect(redirects(db)).toEqual({ '/kinh-nghiem/a/': '/kinh-nghiem/b/' });
    luu(db, 'c', {}, id);
    expect(redirects(db)).toEqual({ '/kinh-nghiem/a/': '/kinh-nghiem/c/', '/kinh-nghiem/b/': '/kinh-nghiem/c/' });
  });

  it('đổi tỉnh cũng tạo redirect; đổi lại về URL cũ thì bỏ redirect đang đè lên URL thật', () => {
    const db = moDb(':memory:');
    const id = luu(db, 'a');
    luu(db, 'a', { tinh: 'vung-tau' }, id);
    expect(redirects(db)).toEqual({ '/kinh-nghiem/a/': '/vung-tau/a/' });
    luu(db, 'a', {}, id);
    expect(redirects(db)).toEqual({ '/vung-tau/a/': '/kinh-nghiem/a/' }); // /kinh-nghiem/a/ lại là URL thật
  });

  it('đổi slug bài NHÁP → không tạo redirect; sửa không đổi URL → không tạo', () => {
    const db = moDb(':memory:');
    const id = luu(db, 'nhap-1', {}, undefined, 'nhap');
    luu(db, 'nhap-2', {}, id, 'nhap');
    expect(redirects(db)).toEqual({});
    const id2 = luu(db, 'x');
    luu(db, 'x', { tieuDe: 'Tiêu đề mới' }, id2);
    expect(redirects(db)).toEqual({});
  });
});

describe('API: slug tự gợi ý và xuất redirect an toàn', () => {
  it('POST không gửi slug → từ tiêu đề; tiêu đề trùng → -2, -3', async () => {
    const m = await dungAdmin();
    const tao = async () => (await m.chinh.gui('post', '/bai', { bai: { tieuDe: 'Đà Lạt mùa hoa dã quỳ!' }, noiDung: '' })).body.id as number;
    const slug = async (id: number) => (await m.chinh.gui('get', `/bai/${id}`)).body.bai.slug as string;
    expect(await slug(await tao())).toBe('da-lat-mua-hoa-da-quy');
    expect(await slug(await tao())).toBe('da-lat-mua-hoa-da-quy-2');
    expect(await slug(await tao())).toBe('da-lat-mua-hoa-da-quy-3');
  });

  it('xuất bỏ redirect có đích không còn là bài đang đăng (không làm hỏng build)', async () => {
    const { xuatNoiDung } = await import('./xuat');
    const { mkdtempSync, readFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const m = await dungAdmin();
    taoAnhGia(m.anhDir, 'anh1');
    const id = luu(m.db, 'a');
    luu(m.db, 'b', {}, id);
    const doc = (t: 'production' | 'preview') => JSON.parse(readFileSync(join((() => { const d = mkdtempSync(join(tmpdir(), 'vtt-rd-')); xuatNoiDung(m.db, d, t); return d; })(), 'redirects.json'), 'utf8'));
    expect(doc('production')).toEqual([{ tu: '/kinh-nghiem/a/', den: '/kinh-nghiem/b/' }]);
    m.db.prepare('UPDATE bai SET xoa_luc = 1 WHERE id = ?').run(id);
    expect(doc('production')).toEqual([]);
  });
});
