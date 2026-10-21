import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { stringify } from 'yaml';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { baiVietSchema } from '@vntraveltips/schema';
import { ghiNhanAnh } from '../anh/gan-day';
import { trangThaiToken } from '../anh/token';
import { xuLyAnh } from '../anh/xu-ly';
import { serializeBai } from '../bai/serialize';
import { loadConfig } from '../config';
import type { GithubClient } from '../github/client';
import { huongDanVietBai } from '../huong-dan';
import { docBai, kiemTraBaiTool, lietKeAnh, lietKeBai, taoLinkTaiAnh } from './doc';
import type { ToolCtx } from './ctx';
import { BAI_DIR, TINH_DIR } from './ctx';

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'vtt-tool-'));
});
afterAll(() => rm(dir, { recursive: true, force: true }));

const bai = (slug: string, over: Record<string, unknown> = {}) =>
  baiVietSchema.parse({
    tieuDe: `Bài ${slug}`, slug, moTa: 'a'.repeat(130), loai: 'top-list', anhBia: { ma: 'abc', alt: 'Biển' },
    ngayDang: '2026-10-19', draft: false, ...over,
  });
const fileTinh = stringify({ ten: 'Vũng Tàu', slug: 'vung-tau', gioiThieu: 'g', anhBia: { ma: 'x', alt: 'y' }, moTa: 'm' });

function ctxVoi(files: Record<string, string>): ToolCtx {
  const github = {
    docFile: async (p: string) => (p in files ? { noiDung: files[p], sha: 'sha-' + p } : null),
    liet: async (d: string) => Object.keys(files).filter((p) => p.startsWith(d + '/')),
  } as unknown as GithubClient;
  const config = loadConfig({
    GITHUB_TOKEN: 't', GITHUB_REPO: 'a/b', ALLOWED_GITHUB_USER: 'u',
    PUBLIC_BASE_URL: 'https://vntraveltips.monai.click', PREVIEW_BASE_URL: 'https://nhap-vntraveltips.monai.click',
    ANH_DIR: dir, SESSION_SECRET: 'x'.repeat(32), GITHUB_OAUTH_CLIENT_ID: 'i', GITHUB_OAUTH_CLIENT_SECRET: 's', GITHUB_WEBHOOK_SECRET: 'whsec',
  });
  const hangDoi = { yeuCau() {}, trangThai: () => ({ trangThai: 'roi' as const, dangCho: false, lanCuoi: null }), doiXong: async () => {} };
  return { config, github, now: Date.now, hangDoi };
}

describe('huong_dan_viet_bai', () => {
  it('mỗi loại có mẫu riêng + phần giọng văn và checklist chung', () => {
    const nhatKy = huongDanVietBai('nhat-ky');
    expect(nhatKy).toMatch(/Tra nhanh/i);
    expect(nhatKy).toMatch(/checklist/i);
    expect(huongDanVietBai('top-list')).not.toBe(nhatKy);
    expect(huongDanVietBai('top-list')).toMatch(/Top/);
  });
  it('loại lạ → lỗi', () => {
    expect(() => huongDanVietBai('linh-tinh' as any)).toThrow(/nhat-ky/);
  });
});

describe('tao_link_tai_anh', () => {
  it('trả URL công khai chứa token còn hợp lệ, hết hạn sau 30 phút', async () => {
    const t0 = 1_000_000;
    const r = await taoLinkTaiAnh({ ...ctxVoi({}), now: () => t0 });
    const m = /^https:\/\/vntraveltips\.monai\.click\/tai-anh\/([a-f0-9]{64})$/.exec(r.url);
    expect(m).not.toBeNull();
    expect(trangThaiToken(m![1], () => t0 + 29 * 60_000)).toBe('ok');
    expect(trangThaiToken(m![1], () => t0 + 30 * 60_000)).toBe('het-han');
    expect(r.hetHan).toBe(new Date(t0 + 30 * 60_000).toISOString());
  });
});

describe('tao_link_tai_anh khi ổ gần đầy', () => {
  it('báo cho Claude ngay, không tạo link (khỏi để chủ blog chọn 15 ảnh rồi mới bị từ chối)', async () => {
    const ctx = { ...ctxVoi({}), conDungLuong: async () => false };
    await expect(taoLinkTaiAnh(ctx)).rejects.toThrow(/ổ đĩa.*2 GB/i);
  });
});

describe('liet_ke_anh', () => {
  it('mới nhất trước, kèm thumbnail WebP, giới hạn tối đa 20', async () => {
    const jpeg = await sharp({ create: { width: 900, height: 600, channels: 3, background: '#264653' } }).jpeg().toBuffer();
    const a = await xuLyAnh(jpeg, dir);
    const b = await xuLyAnh(jpeg, dir);
    await ghiNhanAnh(dir, { ma: a.ma, ten: 'a.jpg', luc: 1 });
    await ghiNhanAnh(dir, { ma: b.ma, ten: 'b.jpg', luc: 2 });
    const r = await lietKeAnh(ctxVoi({}), 5);
    expect(r.map((x) => x.ma)).toEqual([b.ma, a.ma]);
    expect(r[0].thumbnail?.mimeType).toBe('image/webp');
    expect(Buffer.from(r[0].thumbnail!.data, 'base64').length).toBeGreaterThan(100);
    expect(r[0].rong).toBe(900);
    expect(await lietKeAnh(ctxVoi({}), 999)).toHaveLength(2); // bị kẹp ≤ 20 nhưng chỉ có 2 ảnh
  });

  it('ảnh trong nhật ký nhưng thư mục đã mất → vẫn liệt kê, không thumbnail, không lỗi', async () => {
    await ghiNhanAnh(dir, { ma: 'daMat123', ten: 'mat.jpg', luc: 3 });
    const r = await lietKeAnh(ctxVoi({}), 1);
    expect(r[0]).toMatchObject({ ma: 'daMat123' });
    expect(r[0].thumbnail).toBeUndefined();
  });
});

describe('kiem_tra_bai (đọc tỉnh + slug từ repo, không ghi gì)', () => {
  const files = {
    [`${TINH_DIR}/vung-tau.md`]: `---\n${fileTinh}---\n`,
    [`${BAI_DIR}/co-san.md`]: serializeBai(bai('co-san'), 'x'),
  };

  it('slug đã có ở repo → lỗi trùng; slugDangSua loại trừ chính nó', async () => {
    const du = { ...bai('co-san') };
    const trung = await kiemTraBaiTool(ctxVoi(files), { bai: du, noiDung: 'x' });
    expect(trung.loi.join('\n')).toMatch(/trùng/);
    const sua = await kiemTraBaiTool(ctxVoi(files), { bai: du, noiDung: 'x', slugDangSua: 'co-san' });
    expect(sua.loi.join('\n')).not.toMatch(/trùng/);
  });

  it('mã ảnh chưa có trên đĩa → lỗi', async () => {
    const r = await kiemTraBaiTool(ctxVoi(files), { bai: { ...bai('moi'), anhBia: { ma: 'chuaco', alt: 'a' } }, noiDung: 'x' });
    expect(r.loi.join('\n')).toContain('chuaco');
  });

  it('tỉnh có trong repo → hợp lệ', async () => {
    const r = await kiemTraBaiTool(ctxVoi(files), { bai: { ...bai('moi', { tinh: 'vung-tau', loai: 'top-list' }), anhBia: { ma: 'daMat123', alt: 'a' } }, noiDung: 'x' });
    expect(r.loi.join('\n')).not.toMatch(/vung-tau/);
  });
});

describe('liet_ke_bai / doc_bai', () => {
  const files = {
    [`${BAI_DIR}/a.md`]: serializeBai(bai('a', { tinh: 'vung-tau' }), 'Nội dung A'),
    [`${BAI_DIR}/b.md`]: serializeBai(bai('b', { draft: true }), 'Nội dung B'),
    [`${BAI_DIR}/hong.md`]: 'không có frontmatter',
  };

  it('liệt kê tóm tắt, lọc theo draft, bài hỏng được báo riêng', async () => {
    const tatCa = await lietKeBai(ctxVoi(files), {});
    expect(tatCa.bai.map((x) => x.slug).sort()).toEqual(['a', 'b']);
    expect(tatCa.bai.find((x) => x.slug === 'a')).toMatchObject({ tieuDe: 'Bài a', draft: false, url: '/vung-tau/a/' });
    expect(tatCa.bai.find((x) => x.slug === 'b')?.url).toBe('/kinh-nghiem/b/');
    expect(tatCa.loiDoc).toEqual([`${BAI_DIR}/hong.md`]);
    expect((await lietKeBai(ctxVoi(files), { draft: true })).bai.map((x) => x.slug)).toEqual(['b']);
    expect((await lietKeBai(ctxVoi(files), { tinh: 'vung-tau' })).bai.map((x) => x.slug)).toEqual(['a']);
  });

  it('doc_bai trả dữ liệu + thân; không có → lỗi tiếng Việt', async () => {
    const r = await docBai(ctxVoi(files), 'a');
    expect(r.bai.slug).toBe('a');
    expect(r.noiDung).toBe('Nội dung A');
    await expect(docBai(ctxVoi(files), 'khong-co')).rejects.toThrow(/không có bài/i);
  });

  it('slug có ký tự lạ (chống đọc file ngoài thư mục bài) → lỗi', async () => {
    await expect(docBai(ctxVoi(files), '../../etc/passwd')).rejects.toThrow(/slug/i);
  });
});
