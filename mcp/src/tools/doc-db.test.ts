// Tool đọc bài lấy từ SQLite: liệt kê, đọc, kiểm tra (slug trùng, tỉnh) — không động tới GitHub.
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
    GITHUB_TOKEN: 't', GITHUB_REPO: 'a/b', ALLOWED_GITHUB_USER: 'u',
    PUBLIC_BASE_URL: 'https://vntraveltips.monai.click', PREVIEW_BASE_URL: 'https://nhap-vntraveltips.monai.click',
    ANH_DIR: '/khong/co', SESSION_SECRET: 'x'.repeat(32), GITHUB_OAUTH_CLIENT_ID: 'i', GITHUB_OAUTH_CLIENT_SECRET: 's',
    GITHUB_WEBHOOK_SECRET: 'w', KHOA_BI_MAT: 'a'.repeat(64),
  });
  return { config, db, github: {} as never, now: Date.now, hangDoi: { yeuCau() {}, trangThai: () => ({ trangThai: 'roi', dangCho: false, lanCuoi: null }), doiXong: async () => {} } };
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
    await expect(docBaiTuDb(c, 'b')).rejects.toThrow(/Không có bài/);
  });

  it('doc_bai trả dữ liệu + thân; không có / slug lạ → lỗi tiếng Việt', async () => {
    const c = ctx();
    const r = await docBaiTuDb(c, 'b');
    expect(r.noiDung).toBe('Nội dung B');
    await expect(docBaiTuDb(c, 'khong-co')).rejects.toThrow(/Không có bài/);
    await expect(docBaiTuDb(c, '../../etc/passwd')).rejects.toThrow(/slug/i);
  });

  it('kiem_tra_bai: slug đã có trong DB → trùng; slugDangSua loại trừ chính nó', async () => {
    const c = ctx();
    const trung = await kiemTraBaiToolTuDb(c, { bai: { ...goc.bai, slug: 'b' }, noiDung: 'x' });
    expect(trung.loi.join('\n')).toMatch(/trùng/);
    const sua = await kiemTraBaiToolTuDb(c, { bai: { ...goc.bai, slug: 'b' }, noiDung: 'x', slugDangSua: 'b' });
    expect(sua.loi.join('\n')).not.toMatch(/trùng/);
  });
});
