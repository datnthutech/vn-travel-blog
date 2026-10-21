// Kiểm tra nhập nội dung cũ (file Markdown) vào DB, xuất ngược ra file và lưu bài.
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { BaiViet } from '@vntraveltips/schema';
import { parseBai } from '../bai/serialize';
import { moDb } from '../db/ket-noi';
import { luuBai } from './bai';
import { nhapNeuDbRong, nhapTuThuMuc } from './nhap';
import { xuatNoiDung } from './xuat';

const SITE = join(import.meta.dirname, '../../../site');
const NOI_DUNG = join(SITE, 'src/content');
const REDIRECTS = join(SITE, 'redirects.json');
const tam = () => mkdtempSync(join(tmpdir(), 'vtt-xuat-'));
const phien = (db: ReturnType<typeof moDb>) =>
  Number((db.prepare("SELECT gia_tri FROM he_thong WHERE khoa='noi_dung_phien'").get() as { gia_tri: string }).gia_tri);

describe('nhập + xuất', () => {
  it('khứ hồi: nhập site/src/content rồi xuất preview → từng bài toEqual bản gốc', () => {
    const db = moDb(':memory:');
    nhapTuThuMuc(db, NOI_DUNG, REDIRECTS);
    const ra = tam();
    const { soBai } = xuatNoiDung(db, ra, 'preview');
    const goc = readdirSync(join(NOI_DUNG, 'bai-viet'));
    expect(soBai).toBe(goc.length);
    for (const f of goc) {
      const a = parseBai(readFileSync(join(NOI_DUNG, 'bai-viet', f), 'utf8'));
      const b = parseBai(readFileSync(join(ra, 'bai-viet', f), 'utf8'));
      // `maBai` (mã trong DB) là trường MỚI do xuất thêm vào để trang bài nạp bình luận; còn lại phải giống hệt bản gốc.
      expect(typeof b.bai.maBai).toBe('number');
      expect({ ...b, bai: { ...b.bai, maBai: undefined } }).toEqual(a);
    }
    expect(readdirSync(join(ra, 'tinh'))).toEqual(readdirSync(join(NOI_DUNG, 'tinh')));
    expect(JSON.parse(readFileSync(join(ra, 'redirects.json'), 'utf8'))).toEqual(JSON.parse(readFileSync(REDIRECTS, 'utf8')));
  });

  it('production bỏ bài nháp', () => {
    const db = moDb(':memory:');
    nhapTuThuMuc(db, NOI_DUNG, REDIRECTS);
    const ra = tam();
    xuatNoiDung(db, ra, 'production');
    const nhap = readdirSync(join(NOI_DUNG, 'bai-viet')).filter((f) =>
      parseBai(readFileSync(join(NOI_DUNG, 'bai-viet', f), 'utf8')).bai.draft,
    );
    expect(nhap.length).toBeGreaterThan(0);
    for (const f of nhap) expect(existsSync(join(ra, 'bai-viet', f))).toBe(false);
  });

  it('production chỉ xuất bài đã đăng, draft = false trong file', () => {
    const db = moDb(':memory:');
    nhapTuThuMuc(db, NOI_DUNG, REDIRECTS);
    const goc = parseBai(readFileSync(join(NOI_DUNG, 'bai-viet/vung-tau-can-ho-banh-canh.md'), 'utf8'));
    luuBai(db, {
      id: db.prepare("SELECT bai_id AS id FROM ban_dich WHERE slug = ?").pluck().get(goc.bai.slug) as number,
      ngonNgu: 'vi', bai: goc.bai, noiDung: goc.noiDung, trangThai: 'da-dang',
    });
    const ra = tam();
    expect(xuatNoiDung(db, ra, 'production').soBai).toBe(1);
    expect(parseBai(readFileSync(join(ra, 'bai-viet', `${goc.bai.slug}.md`), 'utf8')).bai.draft).toBe(false);
  });

  it('bài trong thùng rác (xoa_luc) không xuất ở cả hai target', () => {
    const db = moDb(':memory:');
    nhapTuThuMuc(db, NOI_DUNG, REDIRECTS);
    db.prepare('UPDATE bai SET xoa_luc = 1').run();
    for (const target of ['preview', 'production'] as const) {
      const ra = tam();
      expect(xuatNoiDung(db, ra, target).soBai).toBe(0);
      expect(readdirSync(join(ra, 'bai-viet'))).toEqual([]);
    }
  });

  it('nhập hai lần không nhân đôi', () => {
    const db = moDb(':memory:');
    const a = nhapTuThuMuc(db, NOI_DUNG, REDIRECTS);
    const dem = () => (db.prepare('SELECT count(*) AS n FROM bai').get() as { n: number }).n;
    const n1 = dem();
    const b = nhapTuThuMuc(db, NOI_DUNG, REDIRECTS);
    expect(dem()).toBe(n1);
    expect(b).toEqual(a);
    expect((db.prepare('SELECT count(*) AS n FROM ban_dich').get() as { n: number }).n).toBe(n1);
  });

  it('nhapNeuDbRong chỉ nhập khi DB chưa có bài', () => {
    const db = moDb(':memory:');
    expect(nhapNeuDbRong(db, NOI_DUNG, REDIRECTS)).not.toBeNull();
    const n = (db.prepare('SELECT count(*) AS n FROM bai').get() as { n: number }).n;
    db.prepare('DELETE FROM bai WHERE id = (SELECT min(id) FROM bai)').run();
    expect(nhapNeuDbRong(db, NOI_DUNG, REDIRECTS)).toBeNull();
    expect((db.prepare('SELECT count(*) AS n FROM bai').get() as { n: number }).n).toBe(n - 1);
  });
});

describe('luuBai', () => {
  const goc = parseBai(readFileSync(join(NOI_DUNG, 'bai-viet/vung-tau-can-ho-banh-canh.md'), 'utf8'));

  it('moTa 50 ký tự → lỗi nêu moTa', () => {
    const db = moDb(':memory:');
    const bai: BaiViet = { ...goc.bai, moTa: 'x'.repeat(50) };
    expect(() => luuBai(db, { ngonNgu: 'vi', bai, noiDung: 'a', trangThai: 'nhap' })).toThrow(/moTa/);
  });

  it('mỗi luuBai tăng noi_dung_phien đúng 1, ghi 1 phiên bản, đọc lại được', async () => {
    const { docBai } = await import('./bai');
    const db = moDb(':memory:');
    const truoc = phien(db);
    const { id } = luuBai(db, { ngonNgu: 'vi', bai: goc.bai, noiDung: goc.noiDung, trangThai: 'da-dang', nguoiId: undefined });
    expect(phien(db)).toBe(truoc + 1);
    expect((db.prepare('SELECT count(*) AS n FROM phien_ban WHERE bai_id=?').get(id) as { n: number }).n).toBe(1);
    const doc = docBai(db, id)!;
    expect(doc.bai).toEqual({ ...goc.bai, draft: false });
    expect(doc.noiDung).toBe(goc.noiDung);
    expect(doc.trangThai).toBe('da-dang');
    luuBai(db, { id, ngonNgu: 'vi', bai: { ...goc.bai, tieuDe: 'Đổi' }, noiDung: 'b', trangThai: 'da-dang' });
    expect(phien(db)).toBe(truoc + 2);
    expect(docBai(db, id)!.bai.tieuDe).toBe('Đổi');
  });
});

describe('xuất kèm maBai', () => {
  it('frontmatter có maBai = id trong DB (để trang bài nạp bình luận); không ảnh hưởng schema bài', () => {
    const db = moDb(':memory:');
    nhapTuThuMuc(db, NOI_DUNG, REDIRECTS);
    const ra = tam();
    xuatNoiDung(db, ra, 'preview');
    for (const f of readdirSync(join(ra, 'bai-viet'))) {
      const { bai } = parseBai(readFileSync(join(ra, 'bai-viet', f), 'utf8'));
      const id = db.prepare("SELECT bai_id AS id FROM ban_dich WHERE slug = ?").pluck().get(bai.slug) as number;
      expect(bai.maBai).toBe(id);
    }
  });
});
