// Xuất nội dung từ DB ra file đúng định dạng cũ (bai-viet/*.md, tinh/*.md, redirects.json) để Astro build đọc qua NOI_DUNG_DIR.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { stringify } from 'yaml';
import { serializeBai } from '../bai/serialize';
import type { Db } from '../db/ket-noi';
import { lietKeBai } from './bai';

export function xuatNoiDung(db: Db, dich: string, target: 'production' | 'preview'): { soBai: number } {
  rmSync(dich, { recursive: true, force: true });
  mkdirSync(join(dich, 'bai-viet'), { recursive: true });
  mkdirSync(join(dich, 'tinh'), { recursive: true });

  const bai = lietKeBai(db, 'vi').filter((b) => target === 'preview' || b.trangThai === 'da-dang');
  for (const b of bai) writeFileSync(join(dich, 'bai-viet', `${b.bai.slug}.md`), serializeBai(b.bai, b.noiDung));

  for (const r of db.prepare('SELECT slug, du_lieu FROM tinh ORDER BY slug').all() as { slug: string; du_lieu: string }[]) {
    writeFileSync(join(dich, 'tinh', `${r.slug}.md`), `---\n${stringify(JSON.parse(r.du_lieu), { lineWidth: 0 })}---\n`);
  }

  const redirects = db.prepare('SELECT tu, den FROM redirect ORDER BY tu').all();
  writeFileSync(join(dich, 'redirects.json'), JSON.stringify(redirects, null, 2) + '\n');
  return { soBai: bai.length };
}
