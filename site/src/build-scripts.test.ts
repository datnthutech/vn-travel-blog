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
