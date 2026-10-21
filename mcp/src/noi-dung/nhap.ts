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

/** Chỉ nhập khi DB chưa có bài nào (dùng lúc khởi động container). Trả null nếu bỏ qua. */
export function nhapNeuDbRong(db: Db, thuMuc: string, redirectsFile?: string) {
  const n = (db.prepare('SELECT count(*) AS n FROM bai').get() as { n: number }).n;
  return n > 0 ? null : nhapTuThuMuc(db, thuMuc, redirectsFile);
}
