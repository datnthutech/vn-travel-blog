// Tool đọc bài lấy từ SQLite: liệt kê, đọc (theo id hoặc slug), kiểm tra (slug trùng, tỉnh).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseBai } from '../bai/serialize';
import { loadConfig } from '../config';
import { moDb } from '../db/ket-noi';
import { luuBai } from '../noi-dung/bai';
import type { ToolCtx } from './ctx';
import { docBaiTuDb, kiemTraBaiToolTuDb, lietKeBaiTuDb } from './doc-db';

const goc = parseBai(readFileSync(join(import.meta.dirname, '../../../site/src/content/bai-viet/vung-tau-can-ho-banh-canh.md'), 'utf8'));

function ctx(): ToolCtx {
  const db = moDb(':memory:');
  luuBai(db, { ngonNgu: 'vi', bai: { ...goc.bai, tinh: 'vung-tau' }, noiDung: 'Nội dung A', trangThai: 'da-dang' });
  luuBai(db, { ngonNgu: 'vi', bai: { ...goc.bai, slug: 'b', tieuDe: 'B', tinh: undefined }, noiDung: 'Nội dung B', trangThai: 'nhap' });
  const config = loadConfig({
    GITHUB_TOKEN: 't', GITHUB_REPO: 'a/b',
    PUBLIC_BASE_URL: 'https://vntraveltips.monai.click', PREVIEW_BASE_URL: 'https://nhap-vntraveltips.monai.click',
    ANH_DIR: '/khong/co', SESSION_SECRET: 'x'.repeat(32),
    GITHUB_WEBHOOK_SECRET: 'w', KHOA_BI_MAT: 'a'.repeat(64),
  });
  return { config, db, nguoiDung: { id: 1, email: 'a@x.vn', ten: 'A', vaiTro: 'quan-tri', biKhoa: false, coTotp: true }, now: Date.now, hangDoi: { yeuCau() {}, trangThai: () => ({ trangThai: 'roi', dangCho: false, lanCuoi: null }), doiXong: async () => {} } };
}

describe('tool đọc từ DB', () => {
  it('liet_ke_bai: tóm tắt, lọc theo draft và tỉnh', async () => {
    const c = ctx();
    const tatCa = await lietKeBaiTuDb(c, {});
    expect(tatCa.bai.map((x) => x.slug).sort()).toEqual(['b', goc.bai.slug].sort());
    expect(tatCa.bai.find((x) => x.slug === 'b')).toMatchObject({ draft: true, url: '/kinh-nghiem/b/' });
    expect((await lietKeBaiTuDb(c, { draft: false })).bai.map((x) => x.slug)).toEqual([goc.bai.slug]);
    expect((await lietKeBaiTuDb(c, { tinh: 'vung-tau' })).bai).toHaveLength(1);
  });

  it('bài trong thùng rác không được liệt kê hay đọc', async () => {
    const c = ctx();
    c.db.prepare("UPDATE bai SET xoa_luc = 1 WHERE id = (SELECT bai_id FROM ban_dich WHERE slug = 'b')").run();
    expect((await lietKeBaiTuDb(c, {})).bai.map((x) => x.slug)).toEqual([goc.bai.slug]);
    await expect(docBaiTuDb(c, { slug: 'b' })).rejects.toThrow(/Không có bài/);
  });

  it('doc_bai trả dữ liệu + thân; không có / slug lạ → lỗi tiếng Việt', async () => {
    const c = ctx();
    const r = await docBaiTuDb(c, { slug: 'b' });
    expect(r.noiDung).toBe('Nội dung B');
    await expect(docBaiTuDb(c, { slug: 'khong-co' })).rejects.toThrow(/Không có bài/);
    await expect(docBaiTuDb(c, { slug: '../../etc/passwd' })).rejects.toThrow(/slug/i);
  });

  it('doc_bai theo id: trả id, trạng thái, phienSo; không truyền gì → lỗi nêu rõ cần id hoặc slug', async () => {
    const c = ctx();
    const id = (c.db.prepare("SELECT bai_id AS id FROM ban_dich WHERE slug = 'b'").get() as { id: number }).id;
    expect(await docBaiTuDb(c, { id })).toMatchObject({ id, trangThai: 'nhap', noiDung: 'Nội dung B', phienSo: 1 });
    await expect(docBaiTuDb(c, { id: 9999 })).rejects.toThrow(/Không có bài/);
    await expect(docBaiTuDb(c, {})).rejects.toThrow(/id hoặc slug/);
    expect((await lietKeBaiTuDb(c, {})).bai.find((x) => x.slug === 'b')).toMatchObject({ id, trangThai: 'nhap' });
  });

  it('kiem_tra_bai: slug đã có trong DB → trùng; slugDangSua loại trừ chính nó', async () => {
    const c = ctx();
    const trung = await kiemTraBaiToolTuDb(c, { bai: { ...goc.bai, slug: 'b' }, noiDung: 'x' });
    expect(trung.loi.join('\n')).toMatch(/trùng/);
    const sua = await kiemTraBaiToolTuDb(c, { bai: { ...goc.bai, slug: 'b' }, noiDung: 'x', slugDangSua: 'b' });
    expect(sua.loi.join('\n')).not.toMatch(/trùng/);
  });
});
