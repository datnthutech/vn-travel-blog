// Kiểm tra cấu hình /admin (Sveltia CMS) khớp với luật dữ liệu dùng chung — thêm trường vào schema mà quên CMS là test đỏ.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { baiVietSchema, diaDiemSchema, tinhSchema, traNhanhSchema } from '@vntraveltips/schema';

const site = join(__dirname, '..');
const cfg = parse(readFileSync(join(site, 'admin/config.template.yml'), 'utf8'));
const html = readFileSync(join(site, 'public/admin/index.html'), 'utf8');

const bai = cfg.collections.find((c: any) => c.name === 'bai-viet');
const tinh = cfg.collections.find((c: any) => c.name === 'tinh');
const ten = (fields: any[]) => fields.map((f) => f.name);
const truong = (fields: any[], name: string) => fields.find((f) => f.name === name);

describe('config.yml của Sveltia CMS', () => {
  it('dùng backend GitHub trên nhánh main với proxy OAuth của MCP', () => {
    expect(cfg.backend).toMatchObject({
      name: 'github', branch: 'main', repo: '__GITHUB_REPO__',
      base_url: '__SITE_URL__', auth_endpoint: 'oauth/cms/auth',
    });
  });

  it('chỉ SỬA bài có sẵn: không tạo, không xoá (tạo bài đi qua MCP, gỡ bài qua go_bai)', () => {
    expect(bai.folder).toBe('site/src/content/bai-viet');
    expect(bai.create).toBe(false);
    expect(bai.delete).toBe(false);
  });

  it('có đủ mọi trường của baiVietSchema (+ thân bài markdown)', () => {
    const co = ten(bai.fields);
    for (const k of Object.keys(baiVietSchema.shape)) expect(co, `thiếu trường ${k}`).toContain(k);
    expect(truong(bai.fields, 'body')?.widget).toBe('markdown');
  });

  it('đủ trường con của traNhanh và diaDiem', () => {
    const tn = truong(bai.fields, 'traNhanh').fields;
    for (const k of Object.keys(traNhanhSchema.shape)) expect(ten(tn), k).toContain(k);
    const dd = truong(bai.fields, 'diaDiem').fields;
    for (const k of Object.keys(diaDiemSchema.shape)) expect(ten(dd), k).toContain(k);
  });

  it('slug và draft chỉ đọc: đổi trạng thái đăng phải qua dang_bai/go_bai (có cổng xem trước)', () => {
    expect(truong(bai.fields, 'slug').readonly).toBe(true);
    expect(truong(bai.fields, 'draft').readonly).toBe(true);
    expect(truong(bai.fields, 'draft').hint).toMatch(/dang_bai/);
  });

  it('tinh chỉ đọc ở /admin: đổi tỉnh làm đổi URL nên phải đi qua sua_bai (tự thêm redirect 301)', () => {
    const t = truong(bai.fields, 'tinh');
    expect(t.readonly).toBe(true);
    expect(t.hint).toMatch(/sua_bai/);
  });

  it('moTa ràng buộc 120–160 ký tự như schema', () => {
    const p = truong(bai.fields, 'moTa').pattern;
    expect(p[0]).toBe('^[\\s\\S]{120,160}$');
    expect(new RegExp(p[0]).test('a'.repeat(120))).toBe(true);
    expect(new RegExp(p[0]).test('a'.repeat(119))).toBe(false);
    expect(new RegExp(p[0]).test('a'.repeat(161))).toBe(false);
  });

  it('ảnh: ô mã ảnh có hướng dẫn lấy mã từ trang tải ảnh', () => {
    const ma = truong(truong(bai.fields, 'anhBia').fields, 'ma');
    expect(ma.hint).toMatch(/Tải ảnh|tải ảnh/);
  });

  it('tỉnh có đủ trường của tinhSchema và được phép tạo mới (MCP không có tool tạo tỉnh)', () => {
    expect(tinh.folder).toBe('site/src/content/tinh');
    expect(tinh.create).toBe(true);
    for (const k of Object.keys(tinhSchema.shape)) expect(ten(tinh.fields), k).toContain(k);
  });
});

describe('admin/index.html', () => {
  it('tự host script CMS (không tải từ CDN), trỏ tới config.yml', () => {
    expect(html).toContain('src="/admin/sveltia-cms.js"');
    expect(html).toContain('href="/admin/config.yml"');
    expect(html).not.toMatch(/unpkg|jsdelivr|cdnjs/);
  });

  it('có nút Tải ảnh trỏ tới /oauth/cms/tai-anh và noindex', () => {
    expect(html).toContain('href="/oauth/cms/tai-anh"');
    expect(html).toMatch(/<meta name="robots" content="noindex/);
  });
});
