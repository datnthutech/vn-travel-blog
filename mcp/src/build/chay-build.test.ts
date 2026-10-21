import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Config } from '../config';
import { daCoBanBuild, taoChayBuild, type Exec } from './chay-build';

const TOKEN = 'ghp_bi_mat_khong_duoc_lo_123456';
const SHA = 'c'.repeat(40);

function configTam(): Config {
  return {
    port: 8091,
    githubToken: TOKEN,
    githubRepo: 'chu/repo',
    allowedGithubUser: 'chu-blog',
    publicBaseUrl: 'https://vntraveltips.monai.click',
    previewBaseUrl: 'https://nhap-vntraveltips.monai.click',
    anhDir: '/data/anh',
    dataDir: mkdtempSync(join(tmpdir(), 'vtt-data-')),
    siteDir: '',
    previewDir: '',
    webhookSecret: 'whsec',
    buildEnv: { NOINDEX_ALL: 'true', GOATCOUNTER_CODE: 'gc' },
    sessionSecret: 'x'.repeat(32),
    githubOauthClientId: 'id',
    githubOauthClientSecret: 'secret',
  };
}

// Exec giả: ghi lại mọi lệnh; mô phỏng git clone, git rev-parse, npm ci và npm run build.
function execGia(opt: { hongBuild?: 'production' | 'preview'; inToken?: boolean; sha?: string; revParse?: { code: number; out: string } } = {}) {
  const goi: Array<{ lenh: string; args: string[]; env: Record<string, string> }> = [];
  const exec: Exec = async (lenh, args, o) => {
    goi.push({ lenh, args, env: o.env });
    if (lenh === 'git' && args[0] === 'clone') {
      mkdirSync(join(args[args.length - 1], '.git'), { recursive: true });
      writeFileSync(join(args[args.length - 1], 'package-lock.json'), '{}');
      return { code: 0, out: opt.inToken ? `lỗi với ${TOKEN}` : '' };
    }
    if (lenh === 'git' && args[0] === 'rev-parse') return opt.revParse ?? { code: 0, out: (opt.sha ?? SHA) + '\n' };
    if (lenh === 'npm' && args[0] === 'run') {
      const target = o.env.BUILD_TARGET;
      if (target === opt.hongBuild) return { code: 1, out: 'astro lỗi' };
      mkdirSync(join(o.cwd, 'site', 'dist'), { recursive: true });
      writeFileSync(join(o.cwd, 'site', 'dist', 'index.html'), target!);
    }
    return { code: 0, out: '' };
  };
  return { exec, goi };
}

describe('taoChayBuild', () => {
  it('lần đầu clone bằng token trong env, token không xuất hiện trong lệnh, log hay kết quả', async () => {
    const config = configTam();
    const { exec, goi } = execGia({ inToken: true });
    const kq = await taoChayBuild(config, exec)();
    const clone = goi.find((g) => g.lenh === 'git' && g.args[0] === 'clone')!;
    expect(clone).toBeDefined();
    expect(JSON.stringify(goi.map((g) => g.args))).not.toContain(TOKEN);
    expect(clone.env.GIT_CONFIG_VALUE_0).toContain('basic ');
    expect(Object.keys(clone.env)).toContain('GIT_CONFIG_VALUE_0');
    expect(JSON.stringify(kq)).not.toContain(TOKEN);
  });

  it('thành công: build production rồi preview, mỗi lần một process, đúng env', async () => {
    const config = configTam();
    const { exec, goi } = execGia();
    const kq = await taoChayBuild(config, exec)();
    expect(kq).toEqual({ ok: true, sha: SHA });
    const builds = goi.filter((g) => g.lenh === 'npm' && g.args[0] === 'run');
    expect(builds.map((g) => g.env.BUILD_TARGET)).toEqual(['production', 'preview']);
    const prod = builds[0].env;
    expect(prod.SITE_URL).toBe(config.publicBaseUrl);
    expect(prod.ANH_BASE_URL).toBe(config.publicBaseUrl);
    expect(prod.BUILD_SHA).toBe(SHA);
    expect(prod.GITHUB_REPO).toBe('chu/repo');
    expect(prod.NOINDEX_ALL).toBe('true');
    const preview = builds[1].env;
    expect(preview.SITE_URL).toBe(config.previewBaseUrl);
    expect(preview.NOINDEX_ALL).toBeUndefined();
    // Build đọc meta.json của ảnh từ đĩa (cùng volume), không qua mạng → cả hai lần build phải có ANH_META_DIR.
    expect(prod.ANH_META_DIR).toBe(config.anhDir);
    expect(preview.ANH_META_DIR).toBe(config.anhDir);
  });

  it('sau thành công: site và preview là symlink tương đối tới builds/<id>/<target>', async () => {
    const config = configTam();
    await taoChayBuild(config, execGia().exec)();
    for (const ten of ['site', 'preview']) {
      const duong = join(config.dataDir, ten);
      expect(lstatSync(duong).isSymbolicLink()).toBe(true);
      const dich = readlinkSync(duong);
      expect(dich.startsWith('builds/')).toBe(true);
      expect(dich.endsWith(ten === 'site' ? '/production' : '/preview')).toBe(true);
      expect(existsSync(join(config.dataDir, dich, 'index.html'))).toBe(true);
    }
  });

  it('build lỗi → symlink không đổi, thư mục build hỏng bị xoá, ok:false, log ≤ 2000 ký tự', async () => {
    const config = configTam();
    await taoChayBuild(config, execGia().exec)(); // bản tốt đầu tiên
    const cu = readlinkSync(join(config.dataDir, 'site'));
    const { exec } = execGia({ hongBuild: 'preview', sha: 'd'.repeat(40) });
    const kq = await taoChayBuild(config, exec)();
    expect(kq.ok).toBe(false);
    if (!kq.ok) expect(kq.log.length).toBeLessThanOrEqual(2000);
    expect(readlinkSync(join(config.dataDir, 'site'))).toBe(cu);
  });

  it('giữ 3 bản gần nhất, không xoá bản đang được symlink trỏ tới', async () => {
    const config = configTam();
    const builds = join(config.dataDir, 'builds');
    for (let i = 1; i <= 5; i++) mkdirSync(join(builds, `00000000000${i}-old`), { recursive: true });
    await taoChayBuild(config, execGia().exec)();
    const con = readdirSync(builds);
    expect(con).toHaveLength(3);
    expect(existsSync(join(config.dataDir, 'site', 'index.html'))).toBe(true);
  });

  it('chỉ npm ci khi package-lock.json đổi', async () => {
    const config = configTam();
    const run = taoChayBuild(config, execGia().exec);
    await run();
    const { exec, goi } = execGia();
    await taoChayBuild(config, exec)();
    expect(goi.some((g) => g.lenh === 'npm' && g.args[0] === 'ci')).toBe(false);
    writeFileSync(join(config.dataDir, 'repo', 'package-lock.json'), '{"doi":1}');
    const lanNay = execGia({ sha: 'd'.repeat(40) });
    await taoChayBuild(config, lanNay.exec)();
    const ci = lanNay.goi.find((g) => g.lenh === 'npm' && g.args[0] === 'ci');
    // Chỉ phụ thuộc chạy của site (+ packages/schema); không cài công cụ test của gốc repo lên VPS.
    expect(ci?.args).toEqual(['ci', '--workspace', 'site', '--omit=dev']);
  });

  it('cùng commit và cùng cấu hình với lần thành công trước → bỏ qua, không build lại', async () => {
    const config = configTam();
    await taoChayBuild(config, execGia().exec)();
    const cu = readlinkSync(join(config.dataDir, 'site'));
    const lan2 = execGia();
    const kq = await taoChayBuild(config, lan2.exec)();
    expect(kq).toEqual({ ok: true, sha: SHA });
    expect(lan2.goi.some((g) => g.lenh === 'npm')).toBe(false);
    expect(lan2.goi.some((g) => g.lenh === 'git' && g.args[0] === 'fetch')).toBe(true); // vẫn hỏi GitHub commit mới
    expect(readlinkSync(join(config.dataDir, 'site'))).toBe(cu);
  });

  it('đổi cấu hình build (NOINDEX_ALL) dù cùng commit → build lại', async () => {
    const config = configTam();
    await taoChayBuild(config, execGia().exec)();
    const lan2 = execGia();
    await taoChayBuild({ ...config, buildEnv: { NOINDEX_ALL: 'false' } }, lan2.exec)();
    expect(lan2.goi.filter((g) => g.lenh === 'npm' && g.args[0] === 'run')).toHaveLength(2);
  });

  it('lần trước lỗi → lần sau cùng commit vẫn build (chỉ ghi dấu khi thành công)', async () => {
    const config = configTam();
    await taoChayBuild(config, execGia({ hongBuild: 'production' }).exec)();
    const lan2 = execGia();
    const kq = await taoChayBuild(config, lan2.exec)();
    expect(kq.ok).toBe(true);
    expect(lan2.goi.filter((g) => g.lenh === 'npm' && g.args[0] === 'run')).toHaveLength(2);
  });

  it('git rev-parse lỗi hoặc không ra sha → ok:false, không build', async () => {
    for (const revParse of [{ code: 128, out: 'fatal: bad object HEAD' }, { code: 0, out: '\n' }]) {
      const config = configTam();
      const { exec, goi } = execGia({ revParse });
      const kq = await taoChayBuild(config, exec)();
      expect(kq.ok).toBe(false);
      expect(goi.some((g) => g.lenh === 'npm')).toBe(false);
    }
  });
});

describe('daCoBanBuild', () => {
  it('false khi chưa có site, true sau build thành công', async () => {
    const config = configTam();
    expect(await daCoBanBuild(config)).toBe(false);
    await taoChayBuild(config, execGia().exec)();
    expect(await daCoBanBuild(config)).toBe(true);
    expect(readFileSync(join(config.dataDir, 'site', 'index.html'), 'utf8')).toBe('production');
  });
});
