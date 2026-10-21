import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stringify } from 'yaml';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { baiVietSchema } from '@vntraveltips/schema';
import { parseBai, serializeBai } from '../bai/serialize';
import { loadConfig } from '../config';
import { BAI_DIR, TINH_DIR, duongDanBai, type ToolCtx } from './ctx';
import { FakeGithub } from './fake-github';
import { dangBai, goBai, suaBai, taoBanNhap, xemTrangThai } from './ghi';

const REDIRECTS = 'site/redirects.json';
let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'vtt-ghi-'));
  await mkdir(join(dir, 'abc'));
  await writeFile(join(dir, 'abc', 'meta.json'), '{"rong":1600,"cao":1067}');
});
afterAll(() => rm(dir, { recursive: true, force: true }));

const fileTinh = (slug: string, ten: string) =>
  `---\n${stringify({ ten, slug, gioiThieu: 'g', anhBia: { ma: 'abc', alt: 'y' }, moTa: 'm' })}---\n`;
const baiData = (slug: string, over: Record<string, unknown> = {}) => ({
  tieuDe: `Bài ${slug}`, slug, moTa: 'a'.repeat(130), loai: 'top-list', anhBia: { ma: 'abc', alt: 'Biển' },
  ngayDang: '2026-10-19', draft: false, ...over,
});
const THAN = 'Thân bài. '.repeat(160) + '[link](/vung-tau/x/)';
const fileBai = (slug: string, over: Record<string, unknown> = {}, than = THAN) =>
  serializeBai(baiVietSchema.parse(baiData(slug, over)), than);

// build: build.json có trên đĩa của bản xem trước (undefined/'loi' = chưa có file).
// lanCuoi: kết quả build gần nhất mà hàng đợi giả báo lại.
function setup(
  files: Record<string, string> = {},
  build?: { sha: string } | 'loi',
  lanCuoi: { ok: boolean; log?: string } | null = null,
) {
  const gh = new FakeGithub({
    [`${TINH_DIR}/vung-tau.md`]: fileTinh('vung-tau', 'Vũng Tàu'),
    [`${TINH_DIR}/da-lat.md`]: fileTinh('da-lat', 'Đà Lạt'),
    [REDIRECTS]: '[]\n',
    ...files,
  });
  const dataDir = mkdtempSync(join(tmpdir(), 'vtt-data-'));
  mkdirSync(join(dataDir, 'preview'));
  if (build && build !== 'loi') {
    writeFileSync(join(dataDir, 'preview', 'build.json'), JSON.stringify({ sha: build.sha, builtAt: '2026-10-20T00:00:00Z', target: 'preview' }));
  }
  const config = loadConfig({
    GITHUB_TOKEN: 't', GITHUB_REPO: 'a/b', ALLOWED_GITHUB_USER: 'u',
    PUBLIC_BASE_URL: 'https://vntraveltips.monai.click', PREVIEW_BASE_URL: 'https://nhap-vntraveltips.monai.click',
    ANH_DIR: dir, SESSION_SECRET: 'x'.repeat(32), GITHUB_OAUTH_CLIENT_ID: 'i', GITHUB_OAUTH_CLIENT_SECRET: 's', GITHUB_WEBHOOK_SECRET: 'whsec',
    DATA_DIR: dataDir,
  });
  const hangDoi = {
    yeuCau: vi.fn(),
    trangThai: () => ({ trangThai: 'roi' as const, dangCho: false, lanCuoi: lanCuoi && { ...lanCuoi, luc: '2026-10-20T08:00:00Z', sha: 'head0' } }),
    doiXong: async () => {},
  };
  const ctx: ToolCtx = { config, github: gh.asClient(), now: () => Date.parse('2026-10-20T08:00:00Z'), hangDoi };
  return { gh, ctx, hangDoi };
}

describe('tao_ban_nhap', () => {
  it('kiểm tra đạt → commit bài với draft:true (kể cả đầu vào draft:false), trả link xem trước', async () => {
    const { gh, ctx } = setup();
    const r = await taoBanNhap(ctx, { bai: baiData('moi', { tinh: 'vung-tau', draft: false }), noiDung: THAN });
    expect(r.linkXemTruoc).toBe('https://nhap-vntraveltips.monai.click/vung-tau/moi/');
    expect(gh.lanGhi).toHaveLength(1);
    const luu = parseBai(gh.doc(duongDanBai('moi'))!);
    expect(luu.bai.draft).toBe(true);
    expect(luu.noiDung).toBe(THAN);
  });

  it('bài không tỉnh → link /kinh-nghiem/', async () => {
    const { ctx } = setup();
    expect((await taoBanNhap(ctx, { bai: baiData('top'), noiDung: THAN })).linkXemTruoc).toBe('https://nhap-vntraveltips.monai.click/kinh-nghiem/top/');
  });

  it('kiểm tra không đạt → từ chối, nêu lỗi, KHÔNG ghi gì', async () => {
    const { gh, ctx } = setup();
    await expect(taoBanNhap(ctx, { bai: baiData('moi', { moTa: 'ngắn' }), noiDung: THAN })).rejects.toThrow(/moTa/);
    expect(gh.lanGhi).toHaveLength(0);
  });

  it('slug đã tồn tại → từ chối, không ghi đè', async () => {
    const { gh, ctx } = setup({ [duongDanBai('co')]: fileBai('co') });
    await expect(taoBanNhap(ctx, { bai: baiData('co'), noiDung: THAN })).rejects.toThrow(/trùng/);
    expect(gh.lanGhi).toHaveLength(0);
  });
});

describe('sua_bai', () => {
  it('sửa thân + trường của bài nháp: 1 commit, draft và slug giữ nguyên', async () => {
    const { gh, ctx } = setup({ [duongDanBai('a')]: fileBai('a', { draft: true }) });
    await suaBai(ctx, { slug: 'a', bai: { tieuDe: 'Tiêu đề mới' }, noiDung: THAN + ' thêm' });
    expect(gh.lanGhi).toHaveLength(1);
    const luu = parseBai(gh.doc(duongDanBai('a'))!);
    expect(luu.bai).toMatchObject({ tieuDe: 'Tiêu đề mới', slug: 'a', draft: true });
    expect(luu.noiDung).toBe(THAN + ' thêm');
  });

  it('không cho đổi draft hay slug qua sua_bai', async () => {
    const { gh, ctx } = setup({ [duongDanBai('a')]: fileBai('a', { draft: true }) });
    await expect(suaBai(ctx, { slug: 'a', bai: { draft: false } })).rejects.toThrow(/dang_bai/);
    await expect(suaBai(ctx, { slug: 'a', bai: { slug: 'b' } })).rejects.toThrow(/slug/);
    expect(gh.lanGhi).toHaveLength(0);
  });

  it('sửa bài ĐÃ ĐĂNG tự đặt ngayCapNhat = hôm nay', async () => {
    const { gh, ctx } = setup({ [duongDanBai('a')]: fileBai('a') });
    await suaBai(ctx, { slug: 'a', noiDung: THAN + ' sửa' });
    expect(parseBai(gh.doc(duongDanBai('a'))!).bai.ngayCapNhat?.toISOString().slice(0, 10)).toBe('2026-10-20');
  });

  it('đổi tỉnh bài ĐÃ ĐĂNG → 1 commit chứa cả bài và redirects.json (URL cũ → mới), sửa luôn redirect cũ trỏ vào URL cũ', async () => {
    const { gh, ctx } = setup({
      [duongDanBai('a')]: fileBai('a', { tinh: 'vung-tau' }),
      [REDIRECTS]: JSON.stringify([{ tu: '/cu-hon/a/', den: '/vung-tau/a/' }]),
    });
    await suaBai(ctx, { slug: 'a', bai: { tinh: 'da-lat' } });
    expect(gh.lanGhi).toHaveLength(1);
    expect(gh.lanGhi[0]).toMatchObject({ loai: 'ghiNhieuFile' });
    expect(gh.lanGhi[0].paths.sort()).toEqual([duongDanBai('a'), REDIRECTS].sort());
    expect(JSON.parse(gh.doc(REDIRECTS)!)).toEqual([
      { tu: '/cu-hon/a/', den: '/da-lat/a/' },
      { tu: '/vung-tau/a/', den: '/da-lat/a/' },
    ]);
  });

  it('đổi tỉnh về chỗ cũ → bỏ redirect đang đè lên URL thật', async () => {
    const { gh, ctx } = setup({
      [duongDanBai('a')]: fileBai('a', { tinh: 'da-lat' }),
      [REDIRECTS]: JSON.stringify([{ tu: '/vung-tau/a/', den: '/da-lat/a/' }]),
    });
    await suaBai(ctx, { slug: 'a', bai: { tinh: 'vung-tau' } });
    expect(JSON.parse(gh.doc(REDIRECTS)!)).toEqual([{ tu: '/da-lat/a/', den: '/vung-tau/a/' }]);
  });

  it('đổi tỉnh bài NHÁP → không cần redirect, chỉ 1 file', async () => {
    const { gh, ctx } = setup({ [duongDanBai('a')]: fileBai('a', { tinh: 'vung-tau', draft: true }) });
    await suaBai(ctx, { slug: 'a', bai: { tinh: 'da-lat' } });
    expect(gh.lanGhi[0]).toMatchObject({ loai: 'ghiFile' });
    expect(gh.doc(REDIRECTS)).toBe('[]\n');
  });

  it('đổi tỉnh bài NHÁP kèm cảnh báo: nếu bài từng đăng thì URL cũ sẽ 404 (không tự tạo redirect được vì bài chưa đăng)', async () => {
    const { ctx } = setup({ [duongDanBai('a')]: fileBai('a', { tinh: 'vung-tau', draft: true }) });
    const r = await suaBai(ctx, { slug: 'a', bai: { tinh: 'da-lat' } });
    expect(r.ghiChu.join(' ')).toMatch(/từng đăng/i);
    expect(r.ghiChu.join(' ')).toMatch(/\/vung-tau\/a\//);
  });

  it('sửa bài nháp KHÔNG đổi tỉnh → không cảnh báo URL', async () => {
    const { ctx } = setup({ [duongDanBai('a')]: fileBai('a', { tinh: 'vung-tau', draft: true }) });
    expect((await suaBai(ctx, { slug: 'a', bai: { tieuDe: 'x' } })).ghiChu.join(' ')).not.toMatch(/từng đăng/i);
  });

  it('đổi tỉnh bài đã đăng mà redirects.json hỏng → từ chối, không ghi gì', async () => {
    const { gh, ctx } = setup({ [duongDanBai('a')]: fileBai('a', { tinh: 'vung-tau' }), [REDIRECTS]: '{hỏng' });
    await expect(suaBai(ctx, { slug: 'a', bai: { tinh: 'da-lat' } })).rejects.toThrow(/redirect/i);
    expect(gh.lanGhi).toHaveLength(0);
  });

  it('đổi sang tỉnh không tồn tại / bài không có → từ chối', async () => {
    const { gh, ctx } = setup({ [duongDanBai('a')]: fileBai('a', { draft: true }) });
    await expect(suaBai(ctx, { slug: 'a', bai: { tinh: 'khong-co' } })).rejects.toThrow(/khong-co/);
    await expect(suaBai(ctx, { slug: 'khong-co', noiDung: 'x' })).rejects.toThrow(/Không có bài/);
    expect(gh.lanGhi).toHaveLength(0);
  });
});

describe('xem_trang_thai', () => {
  it('preview đã build đúng commit mới nhất → previewDaCapNhat, kèm trạng thái build', async () => {
    const { ctx } = setup({}, { sha: 'head0' });
    const r = await xemTrangThai(ctx);
    expect(r).toMatchObject({ previewDaCapNhat: true, commitMoiNhat: 'head0', build: { trangThai: 'roi', dangCho: false } });
    expect(r.buildPreview?.sha).toBe('head0');
    expect(r).not.toHaveProperty('workflow');
  });

  it('preview còn build cũ → false; không đọc được build.json → false và có ghi chú', async () => {
    expect((await xemTrangThai(setup({}, { sha: 'cu' }).ctx)).previewDaCapNhat).toBe(false);
    const r = await xemTrangThai(setup({}, 'loi').ctx);
    expect(r.previewDaCapNhat).toBe(false);
    expect(r.buildPreview).toBeNull();
    expect(r.ghiChu).toMatch(/build\.json/);
  });

  it('lần build gần nhất lỗi → báo kèm log rút gọn', async () => {
    const { ctx } = setup({}, { sha: 'head0' }, { ok: false, log: 'astro lỗi' });
    const r = await xemTrangThai(ctx);
    expect(r.build.lanCuoi).toMatchObject({ ok: false, log: 'astro lỗi' });
  });
});

describe('build sau khi commit (hàng đợi)', () => {
  it('tao_ban_nhap, sua_bai, go_bai: commit thành công → yeuCau đúng 1 lần mỗi tool', async () => {
    const { ctx, hangDoi } = setup({ [duongDanBai('a')]: fileBai('a', { draft: true, tinh: 'vung-tau' }), [duongDanBai('b')]: fileBai('b', { tinh: 'vung-tau' }) });
    await taoBanNhap(ctx, { bai: baiData('moi'), noiDung: THAN });
    expect(hangDoi.yeuCau).toHaveBeenCalledTimes(1);
    await suaBai(ctx, { slug: 'a', noiDung: THAN + ' sửa' });
    expect(hangDoi.yeuCau).toHaveBeenCalledTimes(2);
    await goBai(ctx, 'b');
    expect(hangDoi.yeuCau).toHaveBeenCalledTimes(3);
  });

  it('dang_bai commit thành công → yeuCau đúng 1 lần', async () => {
    const { ctx, hangDoi } = setup({ [duongDanBai('a')]: fileBai('a', { draft: true, tinh: 'vung-tau' }) }, { sha: 'head0' });
    await dangBai(ctx, 'a');
    expect(hangDoi.yeuCau).toHaveBeenCalledTimes(1);
  });

  it('commit lỗi (bài đã tồn tại) → không gọi yeuCau', async () => {
    const { ctx, hangDoi } = setup({ [duongDanBai('a')]: fileBai('a', { draft: true }) });
    await expect(taoBanNhap(ctx, { bai: baiData('a'), noiDung: THAN })).rejects.toThrow();
    expect(hangDoi.yeuCau).not.toHaveBeenCalled();
  });
});

describe('dang_bai (cổng an toàn)', () => {
  it('preview chưa build commit mới nhất → từ chối, KHÔNG ghi', async () => {
    const { gh, ctx } = setup({ [duongDanBai('a')]: fileBai('a', { draft: true }) }, { sha: 'cu' });
    await expect(dangBai(ctx, 'a')).rejects.toThrow(/xem trước/);
    expect(gh.lanGhi).toHaveLength(0);
  });

  it('preview chưa theo kịp VÀ lần build cuối lỗi → từ chối, KHÔNG ghi, báo build lỗi và nhắc xem_trang_thai', async () => {
    const { gh, ctx } = setup({ [duongDanBai('a')]: fileBai('a', { draft: true }) }, { sha: 'cu' }, { ok: false, log: 'x' });
    await expect(dangBai(ctx, 'a')).rejects.toThrow(/lỗi[\s\S]*xem_trang_thai/);
    expect(gh.lanGhi).toHaveLength(0);
  });

  it('lần build cuối lỗi (vd lỗi mạng tạm thời) nhưng preview đã build đúng commit mới nhất → vẫn đăng được', async () => {
    const { gh, ctx } = setup({ [duongDanBai('a')]: fileBai('a', { draft: true }) }, { sha: 'head0' }, { ok: false, log: 'x' });
    await dangBai(ctx, 'a');
    expect(gh.lanGhi).toHaveLength(1);
  });

  it('kiểm tra không đạt → từ chối, KHÔNG ghi (kể cả khi preview mới)', async () => {
    const { gh, ctx } = setup({ [duongDanBai('a')]: fileBai('a', { draft: true, anhBia: { ma: 'chuaco', alt: 'a' } }) }, { sha: 'head0' });
    await expect(dangBai(ctx, 'a')).rejects.toThrow(/chuaco/);
    expect(gh.lanGhi).toHaveLength(0);
  });

  it('đạt + preview mới → đặt draft:false, trả link bài thật', async () => {
    const { gh, ctx } = setup({ [duongDanBai('a')]: fileBai('a', { draft: true, tinh: 'vung-tau' }) }, { sha: 'head0' });
    const r = await dangBai(ctx, 'a');
    expect(r.linkBai).toBe('https://vntraveltips.monai.click/vung-tau/a/');
    expect(parseBai(gh.doc(duongDanBai('a'))!).bai.draft).toBe(false);
    expect(gh.lanGhi).toHaveLength(1);
  });

  it('bài đã đăng rồi / không tồn tại → từ chối', async () => {
    const { ctx } = setup({ [duongDanBai('a')]: fileBai('a') }, { sha: 'head0' });
    await expect(dangBai(ctx, 'a')).rejects.toThrow(/đã được đăng/);
    await expect(dangBai(ctx, 'khong-co')).rejects.toThrow(/Không có bài/);
  });
});

describe('go_bai', () => {
  it('đặt draft:true có hiệu lực ngay (không cần preview), KHÔNG xoá file', async () => {
    const { gh, ctx } = setup({ [duongDanBai('a')]: fileBai('a') }, 'loi');
    await goBai(ctx, 'a');
    expect(parseBai(gh.doc(duongDanBai('a'))!).bai.draft).toBe(true);
    expect(gh.doc(duongDanBai('a'))).toBeDefined();
    expect(gh.lanGhi).toHaveLength(1);
  });

  it('nói rõ cho Claude: bản xem trước, ảnh và lịch sử GitHub vẫn còn nội dung (go_bai KHÔNG xoá sạch)', async () => {
    const { ctx } = setup({ [duongDanBai('a')]: fileBai('a') });
    const { ghiChu } = await goBai(ctx, 'a');
    expect(ghiChu).toMatch(/bản xem trước/);
    expect(ghiChu).toMatch(/ảnh/);
    expect(ghiChu).toMatch(/GitHub/);
    expect(ghiChu).toMatch(/riêng tư/);
  });

  it('gỡ bài đang là đích của redirect → gỡ luôn redirect đó trong cùng commit (nếu không build sẽ lỗi và bài vẫn còn trên mạng)', async () => {
    const { gh, ctx } = setup({
      [duongDanBai('a')]: fileBai('a', { tinh: 'vung-tau' }),
      [REDIRECTS]: JSON.stringify([{ tu: '/cu/a/', den: '/vung-tau/a/' }, { tu: '/khac/', den: '/kinh-nghiem/b/' }]),
    });
    await goBai(ctx, 'a');
    expect(gh.lanGhi).toHaveLength(1);
    expect(gh.lanGhi[0].paths.sort()).toEqual([duongDanBai('a'), REDIRECTS].sort());
    expect(JSON.parse(gh.doc(REDIRECTS)!)).toEqual([{ tu: '/khac/', den: '/kinh-nghiem/b/' }]);
  });

  it('bài không tồn tại → từ chối; bài đã là nháp → báo đã gỡ, không ghi', async () => {
    const { gh, ctx } = setup({ [duongDanBai('n')]: fileBai('n', { draft: true }) });
    await expect(goBai(ctx, 'khong-co')).rejects.toThrow(/Không có bài/);
    const r = await goBai(ctx, 'n');
    expect(r.commitSha).toBeUndefined();
    expect(gh.lanGhi).toHaveLength(0);
  });
});

void BAI_DIR;
