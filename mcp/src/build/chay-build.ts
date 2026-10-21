// Quy trình build site trong container: fetch CODE site từ GitHub vào <dataDir>/code, xuất NỘI DUNG từ SQLite ra
// <dataDir>/xuat-build/<id>/<target>/ (Astro đọc qua NOI_DUNG_DIR), build production và preview vào builds/<id>/,
// rồi đổi symlink site/ và preview/ bằng rename nguyên tử. Build lỗi thì giữ bản cũ.
// Token GitHub chỉ đi qua biến môi trường (không nằm trong tham số lệnh) và được che khỏi mọi log trả về.
// Cùng commit + cùng cấu hình build với lần thành công trước thì bỏ qua (webhook trùng với lần ghi qua MCP,
// container khởi động lại mà không có gì đổi) — tiết kiệm RAM/CPU trên VPS.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, readlinkSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Config } from '../config';
import type { Db } from '../db/ket-noi';
import { nhapNeuDbRong } from '../noi-dung/nhap';
import { docNoiDungPhien } from '../noi-dung/phien-noi-dung';
import { xuatNoiDung } from '../noi-dung/xuat';
import type { KetQuaBuild } from './hang-doi';

export type Exec = (lenh: string, args: string[], opt: { cwd: string; env: Record<string, string> }) => Promise<{ code: number; out: string }>;

const GIU_BAN = 3;
const LOG_MAX = 2000;
const OUT_MAX = 64 * 1024;

// Chạy lệnh không qua shell; gom đầu ra (chỉ giữ phần cuối) để đưa vào log khi lỗi.
const chayLenh: Exec = (lenh, args, opt) =>
  new Promise((resolve) => {
    const p = spawn(lenh, args, { cwd: opt.cwd, env: opt.env, shell: false });
    let out = '';
    const gom = (d: Buffer) => {
      out = (out + d.toString()).slice(-OUT_MAX);
    };
    p.stdout.on('data', gom);
    p.stderr.on('data', gom);
    p.on('error', (e) => resolve({ code: 127, out: e.message }));
    p.on('close', (code) => resolve({ code: code ?? 1, out }));
  });

export function taoChayBuild(config: Config, db: Db, exec: Exec = chayLenh): () => Promise<KetQuaBuild> {
  const basic = Buffer.from(`x-access-token:${config.githubToken}`).toString('base64');
  // Che mọi dạng của token trước khi đưa vào log: token thô và chuỗi Basic đã mã hoá.
  const che = (s: string) => s.split(config.githubToken).join('***').split(basic).join('***');
  const duoi = (s: string) => che(s).slice(-LOG_MAX);
  const moiTruong = { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '' };
  // Token đi vào git qua cấu hình môi trường (GIT_CONFIG_*), không nằm trong danh sách tham số.
  const envGit = {
    ...moiTruong,
    GIT_TERMINAL_PROMPT: '0',
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
    GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${basic}`,
  };

  return async () => {
    const repo = join(config.dataDir, 'code');
    const buildsDir = join(config.dataDir, 'builds');
    const id = `${String(Date.now()).padStart(15, '0')}-${Math.random().toString(36).slice(2, 9)}`;
    const xuatDir = join(config.dataDir, 'xuat-build', id);
    try {
      mkdirSync(config.dataDir, { recursive: true });

      // 0. Volume cũ có thư mục repo/ (trước khi tách code và nội dung): đổi tên một lần thành code/.
      const repoCu = join(config.dataDir, 'repo');
      if (!existsSync(repo) && existsSync(repoCu)) renameSync(repoCu, repo);

      // 1. Clone lần đầu, sau đó chỉ fetch và đưa về đúng origin/main.
      if (!existsSync(join(repo, '.git'))) {
        const r = await exec('git', ['clone', '--quiet', `https://github.com/${config.githubRepo}.git`, repo], {
          cwd: config.dataDir,
          env: envGit,
        });
        if (r.code !== 0) return { ok: false, log: duoi(r.out) };
      } else {
        const f = await exec('git', ['fetch', '--quiet', 'origin', 'main'], { cwd: repo, env: envGit });
        if (f.code !== 0) return { ok: false, log: duoi(f.out) };
        const r = await exec('git', ['reset', '--hard', '--quiet', 'FETCH_HEAD'], { cwd: repo, env: envGit });
        if (r.code !== 0) return { ok: false, log: duoi(r.out) };
      }

      // Lần đầu (DB chưa có bài và chưa từng nhập): đưa nội dung đang nằm trong code vào DB.
      nhapNeuDbRong(db, join(repo, 'site', 'src', 'content'), join(repo, 'site', 'redirects.json'));

      const rev = await exec('git', ['rev-parse', 'HEAD'], { cwd: repo, env: moiTruong });
      const sha = rev.out.trim();
      if (rev.code !== 0 || !/^[0-9a-f]{40}$/.test(sha)) return { ok: false, log: duoi(`git rev-parse HEAD lỗi: ${rev.out}`) };

      // Dấu của lần build: commit + mọi thứ ảnh hưởng nội dung build. Trùng lần thành công trước → không cần build.
      const fileDau = join(config.dataDir, '.dau-build');
      const noiDungPhien = docNoiDungPhien(db);
      const dau = JSON.stringify({ sha, noiDungPhien, buildEnv: config.buildEnv, publicBaseUrl: config.publicBaseUrl, previewBaseUrl: config.previewBaseUrl, anhDir: config.anhDir });
      if (existsSync(fileDau) && readFileSync(fileDau, 'utf8') === dau && (await daCoBanBuild(config))) return { ok: true, sha };
      const envBuild = {
        ...moiTruong,
        NODE_OPTIONS: '--max-old-space-size=512',
        ANH_BASE_URL: config.publicBaseUrl,
        BUILD_SHA: sha,
        NOI_DUNG_PHIEN: String(noiDungPhien), // site ghi vào build.json để trang quản trị biết bản xem trước đã chứa thay đổi mới chưa
        GITHUB_REPO: config.githubRepo,
        // Site đọc meta.json của ảnh từ đĩa (thư mục anh/ trong volume), không tải qua mạng.
        ANH_META_DIR: config.anhDir,
      };

      // 2. npm ci chỉ khi package-lock.json đổi; chỉ cài phụ thuộc chạy của site và packages/schema (không công cụ test).
      const lockHash = createHash('sha256').update(readFileSync(join(repo, 'package-lock.json'))).digest('hex');
      const fileHash = join(repo, '.lock-hash');
      const hashCu = existsSync(fileHash) ? readFileSync(fileHash, 'utf8').trim() : '';
      if (hashCu !== lockHash) {
        const ci = await exec('npm', ['ci', '--workspace', 'site', '--omit=dev'], { cwd: repo, env: envBuild });
        if (ci.code !== 0) return { ok: false, sha, log: duoi(ci.out) };
        writeFileSync(fileHash, lockHash + '\n');
      }

      // 3. Build từng bản, mỗi lần một process; bản preview không nhận NOINDEX_ALL/GOATCOUNTER_CODE.
      const dich = join(buildsDir, id);
      mkdirSync(dich, { recursive: true });
      const cauHinh: Array<['production' | 'preview', string, Record<string, string>]> = [
        ['production', config.publicBaseUrl, config.buildEnv],
        ['preview', config.previewBaseUrl, {}],
      ];
      for (const [target, siteUrl, them] of cauHinh) {
        const nguon = join(repo, 'site', 'dist');
        rmSync(nguon, { recursive: true, force: true });
        const noiDungDir = join(xuatDir, target);
        xuatNoiDung(db, noiDungDir, target);
        const b = await exec('npm', ['run', 'build', '-w', 'site'], {
          cwd: repo,
          env: { ...envBuild, ...them, BUILD_TARGET: target, SITE_URL: siteUrl, NOI_DUNG_DIR: noiDungDir },
        });
        if (b.code !== 0 || !existsSync(join(nguon, 'index.html'))) {
          rmSync(dich, { recursive: true, force: true });
          return { ok: false, sha, log: duoi(b.out) };
        }
        renameSync(nguon, join(dich, target));
      }

      // 4. Đổi symlink: tạo link tạm rồi rename đè lên link cũ (không có lúc site trống).
      for (const [ten, target] of [['site', 'production'], ['preview', 'preview']] as const) {
        const tam = join(config.dataDir, `${ten}.tmp`);
        rmSync(tam, { force: true });
        symlinkSync(join('builds', id, target), tam);
        renameSync(tam, join(config.dataDir, ten));
      }

      // 5. Giữ GIU_BAN bản mới nhất; không bao giờ xoá bản đang được symlink trỏ tới.
      const dangDung = new Set(
        ['site', 'preview'].map((ten) => readlinkSync(join(config.dataDir, ten)).split('/')[1]),
      );
      const cacBan = readdirSync(buildsDir).sort();
      for (const ban of cacBan.slice(0, Math.max(0, cacBan.length - GIU_BAN))) {
        if (!dangDung.has(ban)) rmSync(join(buildsDir, ban), { recursive: true, force: true });
      }
      writeFileSync(fileDau, dau);

      return { ok: true, sha };
    } catch (e) {
      return { ok: false, log: duoi(e instanceof Error ? e.message : String(e)) };
    } finally {
      rmSync(xuatDir, { recursive: true, force: true }); // thư mục xuất chỉ sống trong lúc build
    }
  };
}

// Kiểm tra site đã có bản build hợp lệ (symlink site/ trỏ tới thư mục có index.html) chưa.
export async function daCoBanBuild(config: Config): Promise<boolean> {
  return existsSync(join(config.dataDir, 'site', 'index.html'));
}
