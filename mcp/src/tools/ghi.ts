// Các tool GHI vào GitHub: tạo nháp, sửa, xem trạng thái build, đăng, gỡ.
// Nguyên tắc an toàn (thiết kế mục 10):
//  - Bài chỉ lên production qua dang_bai; dang_bai từ chối nếu kiểm tra không đạt HOẶC bản xem trước chưa build từ đúng
//    commit mới nhất trên main (nghĩa là người dùng chưa thể đã xem đúng bản sắp đăng).
//  - go_bai (gỡ khẩn cấp) có hiệu lực ngay, không qua cổng nào, và không xoá file.
//  - Mọi lần ghi kèm sha đã đọc → có ai sửa chen vào thì báo xung đột chứ không ghi đè.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { baiVietSchema, kiemTraRedirects, urlBai, type BaiViet, type Redirect } from '@vntraveltips/schema';
import type { TrangThaiBuild } from '../build/hang-doi';
import { serializeBai } from '../bai/serialize';
import { REDIRECTS_PATH, duongDanBai, type ToolCtx } from './ctx';
import { docBai, kiemTraBaiTool, lietKeBai } from './doc';

const dongLoi = (l: string[]) => l.map((x) => `- ${x}`).join('\n');
// Thông điệp commit một dòng, không xuống dòng/ký tự lạ từ tiêu đề.
const tomTat = (tien: string, tieuDe: string) => `${tien}: ${tieuDe}`.replace(/\s+/g, ' ').slice(0, 100);
const homNay = (ctx: ToolCtx) => new Date(ctx.now()).toISOString().slice(0, 10);

async function docRedirects(ctx: ToolCtx): Promise<{ redirects: Redirect[]; sha?: string }> {
  const f = await ctx.github.docFile(REDIRECTS_PATH);
  if (!f) return { redirects: [] };
  try {
    const d = JSON.parse(f.noiDung);
    if (!Array.isArray(d) || d.some((r) => typeof r?.tu !== 'string' || typeof r?.den !== 'string')) throw new Error();
    return { redirects: d as Redirect[], sha: f.sha };
  } catch {
    throw new Error(`${REDIRECTS_PATH} bị hỏng (không phải mảng {tu, den}). Hãy sửa file redirect rồi thử lại.`);
  }
}
const jsonRedirects = (r: Redirect[]) => JSON.stringify(r, null, 2) + '\n';

// ---------- tao_ban_nhap ----------
export async function taoBanNhap(
  ctx: ToolCtx,
  input: { bai: Record<string, unknown>; noiDung: string },
): Promise<{ slug: string; commitSha: string; linkXemTruoc: string; ghiChu: string }> {
  const duLieu = { ...input.bai, draft: true }; // luôn là nháp, bất kể đầu vào
  const kt = await kiemTraBaiTool(ctx, { bai: duLieu, noiDung: input.noiDung });
  if (!kt.dat) throw new Error(`Bài chưa đạt kiểm tra, chưa lưu gì cả:\n${dongLoi(kt.loi)}`);
  const bai = baiVietSchema.parse(duLieu);
  const { commitSha } = await ctx.github.ghiFile(duongDanBai(bai.slug), serializeBai(bai, input.noiDung), tomTat('Thêm bản nháp', bai.tieuDe));
  ctx.hangDoi.yeuCau();
  return {
    slug: bai.slug,
    commitSha,
    linkXemTruoc: `${ctx.config.previewBaseUrl}${urlBai(bai)}`,
    ghiChu: 'Bản xem trước sẽ có sau vài phút (đợi build). Dùng xem_trang_thai để biết khi nào xong.',
  };
}

// ---------- sua_bai ----------
export async function suaBai(
  ctx: ToolCtx,
  input: { slug: string; bai?: Record<string, unknown>; noiDung?: string },
): Promise<{ slug: string; commitSha: string; ghiChu: string[] }> {
  const patch = { ...(input.bai ?? {}) };
  if ('draft' in patch) throw new Error('Không đổi trạng thái đăng qua sua_bai. Dùng dang_bai (đăng) hoặc go_bai (gỡ).');
  if (patch.slug !== undefined && patch.slug !== input.slug) throw new Error('Không đổi slug của bài đã tạo (URL không được đổi).');

  const cu = await docBai(ctx, input.slug);
  const daDang = !cu.bai.draft;
  const gop: Record<string, unknown> = { ...cu.bai, ...patch };
  if (patch.tinh === null) delete gop.tinh; // tinh: null = bỏ tỉnh
  if (daDang && patch.ngayCapNhat === undefined) gop.ngayCapNhat = homNay(ctx);
  const noiDung = input.noiDung ?? cu.noiDung;

  const kt = await kiemTraBaiTool(ctx, { bai: gop, noiDung, slugDangSua: input.slug });
  if (!kt.dat) throw new Error(`Bài chưa đạt kiểm tra, chưa lưu gì cả:\n${dongLoi(kt.loi)}`);
  const moi: BaiViet = baiVietSchema.parse(gop);
  const duongDan = duongDanBai(input.slug);
  const text = serializeBai(moi, noiDung);
  const msg = tomTat('Sửa bài', moi.tieuDe);
  const ghiChu = ['Bản xem trước và site sẽ cập nhật sau khi build xong (xem_trang_thai).'];

  // Đổi tỉnh của bài ĐÃ ĐĂNG làm đổi URL → bắt buộc kèm redirect 301 cho URL cũ, cùng một commit.
  if (daDang && moi.tinh !== cu.bai.tinh) {
    const urlCu = urlBai(cu.bai);
    const urlMoi = urlBai(moi);
    const { redirects, sha: shaR } = await docRedirects(ctx);
    const tiep = redirects
      .filter((r) => r.tu !== urlMoi) // redirect đang đè lên URL thật mới thì bỏ
      .map((r) => (r.den === urlCu ? { ...r, den: urlMoi } : r)); // các redirect cũ trỏ vào URL cũ → trỏ thẳng URL mới
    if (!tiep.some((r) => r.tu === urlCu)) tiep.push({ tu: urlCu, den: urlMoi });
    const daDangKhac = (await lietKeBai(ctx, { draft: false })).bai.filter((b) => b.slug !== input.slug);
    try {
      kiemTraRedirects([...daDangKhac, { slug: moi.slug, tinh: moi.tinh }], tiep); // kiểm tra trước khi ghi
    } catch (e) {
      throw new Error(`Redirect không hợp lệ, chưa lưu gì cả: ${(e as Error).message}`);
    }
    const { commitSha } = await ctx.github.ghiNhieuFile(
      [
        { path: duongDan, noiDung: text, shaCu: cu.sha },
        { path: REDIRECTS_PATH, noiDung: jsonRedirects(tiep), shaCu: shaR },
      ],
      msg,
    );
    ctx.hangDoi.yeuCau();
    ghiChu.push(`Đã thêm redirect 301: ${urlCu} → ${urlMoi}`);
    return { slug: input.slug, commitSha, ghiChu };
  }

  if (!daDang && moi.tinh !== cu.bai.tinh) {
    ghiChu.push(
      `URL của bài đổi từ ${urlBai(cu.bai)} sang ${urlBai(moi)}. Nếu bài này TỪNG đăng trước đây, URL cũ sẽ báo 404 ` +
        '(không tự tạo redirect được vì bài đang là nháp) — hãy báo chủ blog trước khi dang_bai.',
    );
  }
  const { commitSha } = await ctx.github.ghiFile(duongDan, text, msg, cu.sha);
  ctx.hangDoi.yeuCau();
  return { slug: input.slug, commitSha, ghiChu };
}

// ---------- xem_trang_thai ----------
export interface TrangThai {
  commitMoiNhat: string;
  buildPreview: { sha: string; builtAt: string } | null;
  previewDaCapNhat: boolean;
  build: TrangThaiBuild;
  linkXemTruoc: string;
  ghiChu?: string;
}

// build.json do bản build preview ghi lúc build; đọc thẳng từ volume (cùng đĩa với container web).
export async function xemTrangThai(ctx: ToolCtx): Promise<TrangThai> {
  const commitMoiNhat = await ctx.github.shaMoiNhat();
  let buildPreview: TrangThai['buildPreview'] = null;
  let ghiChu: string | undefined;
  try {
    const d = JSON.parse(await readFile(join(ctx.config.previewDir, 'build.json'), 'utf8')) as { sha?: string; builtAt?: string };
    if (typeof d.sha !== 'string') throw new Error('thiếu sha');
    buildPreview = { sha: d.sha, builtAt: String(d.builtAt ?? '') };
  } catch {
    ghiChu = 'Chưa đọc được build.json của bản xem trước (chưa build lần nào hoặc đang build).';
  }
  return {
    commitMoiNhat,
    buildPreview,
    previewDaCapNhat: buildPreview?.sha === commitMoiNhat,
    build: ctx.hangDoi.trangThai(),
    linkXemTruoc: ctx.config.previewBaseUrl,
    ...(ghiChu ? { ghiChu } : {}),
  };
}

// ---------- dang_bai ----------
export async function dangBai(
  ctx: ToolCtx,
  slug: string,
): Promise<{ slug: string; commitSha: string; linkBai: string; ghiChu: string }> {
  const { bai, noiDung, sha } = await docBai(ctx, slug);
  if (!bai.draft) throw new Error(`Bài "${slug}" đã được đăng rồi.`);

  const kt = await kiemTraBaiTool(ctx, { bai: { ...bai, draft: false }, noiDung, slugDangSua: slug });
  if (!kt.dat) throw new Error(`Bài chưa đạt kiểm tra nên chưa đăng:\n${dongLoi(kt.loi)}`);

  // Điều kiện duy nhất: bản xem trước đã build đúng commit mới nhất (chủ blog đã xem đúng thứ sắp đăng).
  // Một lần build lỗi sau đó (vd lỗi mạng tạm thời) không chặn đăng nếu bản xem trước vẫn đúng.
  const tt = await xemTrangThai(ctx);
  if (!tt.previewDaCapNhat && tt.build.lanCuoi?.ok === false) {
    throw new Error('Bản xem trước chưa có commit mới nhất vì lần build gần nhất bị lỗi (site vẫn giữ bản cũ). Hãy xem lỗi bằng xem_trang_thai, sửa bài rồi thử lại.');
  }
  if (!tt.previewDaCapNhat) {
    throw new Error(
      `Bản xem trước chưa build từ commit mới nhất (xem trước: ${tt.buildPreview?.sha.slice(0, 7) ?? 'chưa có'}, mới nhất: ${tt.commitMoiNhat.slice(0, 7)}). ` +
        'Hãy đợi build xong (xem_trang_thai), mở link xem trước kiểm tra lại rồi đăng.',
    );
  }

  const { commitSha } = await ctx.github.ghiFile(
    duongDanBai(slug),
    serializeBai({ ...bai, draft: false }, noiDung),
    tomTat('Đăng bài', bai.tieuDe),
    sha,
  );
  ctx.hangDoi.yeuCau();
  return {
    slug,
    commitSha,
    linkBai: `${ctx.config.publicBaseUrl}${urlBai(bai)}`,
    ghiChu: 'Bài sẽ hiện trên site sau vài phút, khi build xong.',
  };
}

// ---------- go_bai ----------
export async function goBai(
  ctx: ToolCtx,
  slug: string,
): Promise<{ slug: string; commitSha?: string; ghiChu: string }> {
  const { bai, noiDung, sha } = await docBai(ctx, slug);
  if (bai.draft) return { slug, ghiChu: 'Bài này đã là nháp (đã gỡ khỏi site).' };

  const text = serializeBai({ ...bai, draft: true }, noiDung);
  const msg = tomTat('Gỡ bài', bai.tieuDe);
  const url = urlBai(bai);

  // Một redirect trỏ vào bài vừa gỡ sẽ làm build lỗi (đích không tồn tại) → site giữ bản cũ → bài VẪN còn trên mạng.
  // Vì vậy gỡ luôn các redirect đó trong cùng commit. Nếu redirects.json hỏng, vẫn gỡ bài (ưu tiên khẩn cấp) và cảnh báo.
  let moiRedirects: { redirects: Redirect[]; sha?: string } | null = null;
  const ghiChu = [
    'Đã đặt draft: bài biến mất khỏi site chính sau khi build xong (vài phút).',
    'LƯU Ý nếu gỡ vì lộ thông tin riêng tư: go_bai KHÔNG xoá sạch — bản xem trước (nhap-vntraveltips…) vẫn hiển thị bài nháp, ' +
      'các ảnh trong thư mục anh/ của volume vntraveltips_data vẫn truy cập được nếu biết mã ảnh, và nội dung vẫn nằm trong lịch sử GitHub. ' +
      'Hãy báo chủ blog xoá ảnh trên VPS (và xoá/viết lại nội dung trong GitHub) nếu cần xoá hẳn.',
  ];
  try {
    const r = await docRedirects(ctx);
    if (r.redirects.some((x) => x.den === url)) moiRedirects = { redirects: r.redirects.filter((x) => x.den !== url), sha: r.sha };
  } catch {
    ghiChu.push(`CẢNH BÁO: ${REDIRECTS_PATH} bị hỏng, build có thể lỗi. Hãy sửa file này ngay để việc gỡ bài có hiệu lực.`);
  }

  if (moiRedirects) {
    const { commitSha } = await ctx.github.ghiNhieuFile(
      [
        { path: duongDanBai(slug), noiDung: text, shaCu: sha },
        { path: REDIRECTS_PATH, noiDung: jsonRedirects(moiRedirects.redirects), shaCu: moiRedirects.sha },
      ],
      msg,
    );
    ghiChu.push('Đã gỡ kèm các redirect trỏ vào bài này.');
    ctx.hangDoi.yeuCau();
    return { slug, commitSha, ghiChu: ghiChu.join(' ') };
  }
  const { commitSha } = await ctx.github.ghiFile(duongDanBai(slug), text, msg, sha);
  ctx.hangDoi.yeuCau();
  return { slug, commitSha, ghiChu: ghiChu.join(' ') };
}

