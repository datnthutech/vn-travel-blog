// Nhập nội dung cũ (file Markdown trong repo) vào DB. Idempotent: khoá theo slug nên chạy lại không nhân đôi.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tinhSchema, type Redirect } from '@vntraveltips/schema';
import { parse } from 'yaml';
import { parseBai } from '../bai/serialize';
import type { Db } from '../db/ket-noi';
import { luuBai, timIdTheoSlug } from './bai';
import { danhDauNoiDungDoi } from './phien-noi-dung';

const docTinh = (text: string) => {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!m) throw new Error('File tỉnh thiếu frontmatter.');
  return tinhSchema.parse(parse(m[1]));
};

/** `redirectsFile` mặc định là `<thuMuc>/redirects.json` nếu có (bản cũ để ở site/redirects.json, ngoài thư mục content). */
export function nhapTuThuMuc(db: Db, thuMuc: string, redirectsFile?: string): { soBai: number; soTinh: number; soRedirect: number } {
  // Một transaction duy nhất: lỗi giữa chừng thì không có gì được ghi (tránh DB nhập dở rồi không bao giờ nhập tiếp).
  return db.transaction(() => nhapTrongTransaction(db, thuMuc, redirectsFile))();
}

function nhapTrongTransaction(db: Db, thuMuc: string, redirectsFile?: string): { soBai: number; soTinh: number; soRedirect: number } {
  const dsBai = join(thuMuc, 'bai-viet');
  const dsTinh = join(thuMuc, 'tinh');
  const file = redirectsFile ?? join(thuMuc, 'redirects.json');
  let soBai = 0;
  let soTinh = 0;
  let soRedirect = 0;

  if (existsSync(dsBai)) {
    for (const f of readdirSync(dsBai).filter((x) => /\.mdx?$/.test(x)).sort()) {
      const { bai, noiDung } = parseBai(readFileSync(join(dsBai, f), 'utf8'));
      luuBai(db, {
        id: timIdTheoSlug(db, 'vi', bai.slug) ?? undefined,
        ngonNgu: 'vi',
        bai,
        noiDung,
        trangThai: bai.draft ? 'nhap' : 'da-dang',
      });
      soBai++;
    }
  }
  const ghiTinh = db.prepare('INSERT OR REPLACE INTO tinh (slug, du_lieu) VALUES (?, ?)');
  if (existsSync(dsTinh)) {
    for (const f of readdirSync(dsTinh).filter((x) => x.endsWith('.md')).sort()) {
      const t = docTinh(readFileSync(join(dsTinh, f), 'utf8'));
      ghiTinh.run(t.slug, JSON.stringify(t));
      soTinh++;
    }
  }
  if (existsSync(file)) {
    const ghiRd = db.prepare('INSERT OR REPLACE INTO redirect (tu, den) VALUES (?, ?)');
    for (const r of JSON.parse(readFileSync(file, 'utf8')) as Redirect[]) {
      ghiRd.run(r.tu, r.den);
      soRedirect++;
    }
  }
  danhDauNoiDungDoi(db);
  return { soBai, soTinh, soRedirect };
}

/**
 * Chỉ nhập khi DB chưa có bài nào VÀ chưa từng nhập (dùng ở lần build đầu). Trả null nếu bỏ qua.
 * Cờ `da_nhap_noi_dung_cu` ngăn nhập lại nội dung cũ nếu sau này chủ blog xoá hết bài.
 */
export function nhapNeuDbRong(db: Db, thuMuc: string, redirectsFile?: string) {
  const n = (db.prepare('SELECT count(*) AS n FROM bai').get() as { n: number }).n;
  const daNhap = db.prepare("SELECT 1 FROM he_thong WHERE khoa = 'da_nhap_noi_dung_cu'").get();
  if (n > 0 || daNhap) return null;
  const kq = nhapTuThuMuc(db, thuMuc, redirectsFile);
  if (kq.soBai > 0) db.prepare("INSERT OR REPLACE INTO he_thong (khoa, gia_tri) VALUES ('da_nhap_noi_dung_cu', '1')").run();
  return kq;
}
