// Tạo ảnh cho bộ bài mẫu của xem-thu.sh: tìm mọi mã ảnh trong thư mục nội dung mẫu, mỗi mã sinh
// <thuMucAnh>/<mã>/{480,960,1600}.{avif,webp} + meta.json {rong, cao} — đúng cấu trúc ảnh thật mà site đọc.
// Ảnh lấy từ picsum.photos (ảnh ngẫu nhiên cố định theo mã); không có mạng thì tự vẽ ảnh chuyển màu.
// Mã nào đã có meta.json thì bỏ qua (chạy lại nhanh). Ảnh chỉ nằm trong .xem-thu/ (gitignore), không lên repo.
// Cách dùng: node site/demo/tao-anh.mjs <thuMucNoiDung> <thuMucAnh>
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

const [noiDung, thuMucAnh] = process.argv.slice(2);
if (!noiDung || !thuMucAnh) {
  console.error('Cách dùng: node site/demo/tao-anh.mjs <thuMucNoiDung> <thuMucAnh>');
  process.exit(1);
}

async function tatCaFileMd(dir) {
  const ra = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) ra.push(...(await tatCaFileMd(p)));
    else if (e.name.endsWith('.md')) ra.push(p);
  }
  return ra;
}

const ma = new Set();
for (const f of await tatCaFileMd(noiDung)) {
  const t = await readFile(f, 'utf8');
  for (const m of t.matchAll(/\bma:\s*([a-z0-9-]+)/g)) ma.add(m[1]);
  for (const m of t.matchAll(/\(anh:([a-z0-9-]+)\)/g)) ma.add(m[1]);
}

// Ảnh dự phòng khi không tải được: dải màu chuyển theo mã (mỗi mã một màu).
function anhChuyenMau(m) {
  let h = 0;
  for (const c of m) h = (h * 31 + c.charCodeAt(0)) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1067"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="hsl(${h},55%,62%)"/><stop offset="1" stop-color="hsl(${(h + 50) % 360},60%,35%)"/></linearGradient></defs>
<rect width="1600" height="1067" fill="url(#g)"/></svg>`;
  return Buffer.from(svg);
}

async function taiAnh(m) {
  try {
    const r = await fetch(`https://picsum.photos/seed/${m}/1600/1067`, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error(String(r.status));
    return { buf: Buffer.from(await r.arrayBuffer()), nguon: 'picsum' };
  } catch {
    return { buf: anhChuyenMau(m), nguon: 'màu' };
  }
}

let moi = 0;
for (const m of [...ma].sort()) {
  const dir = join(thuMucAnh, m);
  if (existsSync(join(dir, 'meta.json'))) continue;
  const { buf, nguon } = await taiAnh(m);
  const goc = await sharp(buf).resize({ width: 1600, height: 1600, fit: 'inside' }).toBuffer({ resolveWithObject: true });
  await mkdir(dir, { recursive: true });
  for (const rong of [480, 960, 1600]) {
    const anh = sharp(goc.data).resize({ width: rong });
    await anh.clone().webp({ quality: 75 }).toFile(join(dir, `${rong}.webp`));
    await anh.clone().avif({ quality: 50 }).toFile(join(dir, `${rong}.avif`));
  }
  await writeFile(join(dir, 'meta.json'), JSON.stringify({ rong: goc.info.width, cao: goc.info.height }));
  moi++;
  console.log(`  ảnh ${m} (${nguon})`);
}
console.log(`  ${ma.size} mã ảnh, tạo mới ${moi}.`);
