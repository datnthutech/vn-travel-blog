// Kiểm tra hai script sau build bằng cách chạy thật bằng node.
// Chủ yếu để ghim tên biến môi trường: build chạy trong container mcp (không còn GitHub Actions),
// nên script phải đọc BUILD_SHA và GITHUB_REPO do runner đặt.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const siteDir = join(__dirname, '..');
const script = (ten: string) => join(siteDir, 'scripts', ten);

describe('write-build-json', () => {
  it('ghi sha từ BUILD_SHA và target từ BUILD_TARGET', () => {
    const thuMuc = mkdtempSync(join(tmpdir(), 'vtt-wbj-'));
    mkdirSync(join(thuMuc, 'dist'));
    execFileSync('node', [script('write-build-json.mjs')], {
      cwd: thuMuc,
      env: { PATH: process.env.PATH, BUILD_SHA: 'abc123', BUILD_TARGET: 'production' },
    });
    const json = JSON.parse(readFileSync(join(thuMuc, 'dist/build.json'), 'utf8'));
    expect(json.sha).toBe('abc123');
    expect(json.target).toBe('production');
  });

  it('không đặt BUILD_SHA → sha là "local"', () => {
    const thuMuc = mkdtempSync(join(tmpdir(), 'vtt-wbj-'));
    mkdirSync(join(thuMuc, 'dist'));
    execFileSync('node', [script('write-build-json.mjs')], {
      cwd: thuMuc,
      env: { PATH: process.env.PATH },
    });
    const json = JSON.parse(readFileSync(join(thuMuc, 'dist/build.json'), 'utf8'));
    expect(json.sha).toBe('local');
  });
});

describe('build-cms', () => {
  it('điền repo từ GITHUB_REPO, không còn OWNER/REPO', () => {
    const dist = mkdtempSync(join(tmpdir(), 'vtt-cms-'));
    execFileSync('node', [script('build-cms.mjs'), dist], {
      cwd: siteDir,
      env: { PATH: process.env.PATH, GITHUB_REPO: 'chu/repo', SITE_URL: 'https://vntraveltips.monai.click' },
    });
    const yml = readFileSync(join(dist, 'admin/config.yml'), 'utf8');
    expect(yml).toContain('chu/repo');
    expect(yml).not.toContain('OWNER/REPO');
  });
});

// Image mcp đặt NODE_ENV=production nên `npm ci` trong container bỏ qua devDependencies.
// Gói nào script build dùng tới phải nằm trong dependencies, nếu không build trong container sẽ lỗi.
describe('package.json của site', () => {
  it('gói cần lúc build (@sveltia/cms cho build-cms.mjs) nằm trong dependencies', () => {
    const pkg = JSON.parse(readFileSync(join(siteDir, 'package.json'), 'utf8'));
    expect(pkg.dependencies).toHaveProperty('@sveltia/cms');
    expect(pkg.devDependencies ?? {}).not.toHaveProperty('@sveltia/cms');
  });
});
