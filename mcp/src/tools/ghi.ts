// Các tool GHI bài qua CÙNG lớp nội dung (SQLite, `luuBai`) với trang quản trị: cùng luật kiểm tra, cùng phiên bản/lịch sử, cùng 409.
// Mọi tool kiểm `coQuyen(ctx.nguoiDung, …)` — token MCP của người viết chỉ đụng được bài của chính họ, giống API admin.
// Nguyên tắc an toàn (thiết kế mục 10):
//  - Bài chỉ lên production qua dang_bai; dang_bai từ chối nếu kiểm tra không đạt HOẶC bản xem trước chưa build tới phiên nội dung
//    lúc bài được lưu lần cuối (nghĩa là chưa ai có thể đã xem đúng bản sắp đăng).
//  - go_bai (gỡ khẩn cấp) có hiệu lực khi build xong, không xoá dữ liệu.
import { baiVietSchema, coQuyen, urlBai, type BaiViet, type HanhDong } from '@vntraveltips/schema';
import { docBuildJson } from '../admin-api/build';
import type { TrangThaiBuild } from '../build/hang-doi';
import { ngayVN } from '../mail/ngay-vn';
import { luuBai, XungDotPhienBan, type BaiDoc } from '../noi-dung/bai';
import { ghiNhatKy } from '../tai-khoan/nhat-ky';
import type { ToolCtx } from './ctx';
import { kiemTraBaiToolTuDb, timBai, type ThamChieuBai } from './doc-db';

const dongLoi = (l: string[]) => l.map((x) => `- ${x}`).join('\n');
const MO_TA_QUYEN: Record<string, string> = { 'bai.tao': 'tạo bài', 'bai.sua': 'sửa bài này', 'bai.dang': 'đăng/gỡ bài này', 'ban-dich.kiem-tra': 'đánh dấu bản dịch' };

/** Kiểm quyền như API admin; thiếu quyền → ném lỗi (tool trả isError). */
export function canQuyen(ctx: ToolCtx, hd: HanhDong, tacGiaId?: number | null): void {
  if (!coQuyen(ctx.nguoiDung, hd, { tacGiaId })) {
    throw new Error(`Tài khoản của bạn không có quyền ${MO_TA_QUYEN[hd] ?? hd}${hd === 'bai.tao' ? '' : ' (người viết chỉ làm được với bài của chính mình)'}.`);
  }
}
const nhatKy = (ctx: ToolCtx, loai: string, chiTiet: object) =>
  ghiNhatKy(ctx.db, { nguoiDungId: ctx.nguoiDung.id, loai, chiTiet: { qua: 'mcp', ...chiTiet } }, ctx.now);

const loiLuu = (e: unknown): Error => {
  if (e instanceof XungDotPhienBan) return new Error(`Bài vừa được ${e.nguoiSua ?? 'người khác'} sửa (lần lưu cuối); hãy doc_bai lại rồi sửa tiếp.`);
  if (/UNIQUE/.test((e as Error).message)) return new Error('Slug này đã có bài khác dùng.');
  return e as Error;
};

// ---------- tao_ban_nhap ----------
export async function taoBanNhap(
  ctx: ToolCtx,
  input: { bai: Record<string, unknown>; noiDung: string },
): Promise<{ id: number; slug: string; linkXemTruoc: string; ghiChu: string }> {
  canQuyen(ctx, 'bai.tao');
  const duLieu = { ...input.bai, draft: true }; // luôn là nháp, bất kể đầu vào
  const kt = await kiemTraBaiToolTuDb(ctx, { bai: duLieu, noiDung: input.noiDung });
  if (!kt.dat) throw new Error(`Bài chưa đạt kiểm tra, chưa lưu gì cả:\n${dongLoi(kt.loi)}`);
  const bai = baiVietSchema.parse(duLieu);
  let id: number;
  try {
    ({ id } = luuBai(ctx.db, { ngonNgu: 'vi', bai, noiDung: input.noiDung, trangThai: 'nhap', nguoiId: ctx.nguoiDung.id }, ctx.now));
  } catch (e) {
    throw loiLuu(e);
  }
  ctx.hangDoi.yeuCau();
  nhatKy(ctx, 'tao-bai', { baiId: id });
  return {
    id,
    slug: bai.slug,
    linkXemTruoc: `${ctx.config.previewBaseUrl}${urlBai(bai)}`,
    ghiChu: `Bản xem trước sẽ có sau vài phút (đợi build). Dùng xem_trang_thai để biết khi nào xong. Chủ blog cũng sửa được bài này ở ${ctx.config.publicBaseUrl}/quan-tri/bai/${id}.`,
  };
}

// ---------- sua_bai ----------
export async function suaBai(
  ctx: ToolCtx,
  input: ThamChieuBai & { bai?: Record<string, unknown>; noiDung?: string },
): Promise<{ id: number; slug: string; ghiChu: string[] }> {
  const cu = timBai(ctx, input);
  const tacGia = (ctx.db.prepare('SELECT tac_gia_id FROM bai WHERE id = ?').get(cu.id) as { tac_gia_id: number | null }).tac_gia_id;
  canQuyen(ctx, 'bai.sua', tacGia);
  const patch = { ...(input.bai ?? {}) };
  if ('draft' in patch) throw new Error('Không đổi trạng thái đăng qua sua_bai. Dùng dang_bai (đăng) hoặc go_bai (gỡ).');
  if (patch.slug !== undefined && patch.slug !== cu.bai.slug) throw new Error('Không đổi slug của bài đã tạo (URL không được đổi).');

  const daDang = cu.trangThai === 'da-dang';
  const gop: Record<string, unknown> = { ...cu.bai, ...patch };
  if (patch.tinh === null) delete gop.tinh; // tinh: null = bỏ tỉnh
  if (daDang && patch.ngayCapNhat === undefined) gop.ngayCapNhat = ngayVN(ctx.now());
  const noiDung = input.noiDung ?? cu.noiDung;

  const kt = await kiemTraBaiToolTuDb(ctx, { bai: gop, noiDung, slugDangSua: cu.bai.slug });
  if (!kt.dat) throw new Error(`Bài chưa đạt kiểm tra, chưa lưu gì cả:\n${dongLoi(kt.loi)}`);
  const moi: BaiViet = baiVietSchema.parse(gop);
  const ghiChu = ['Bản xem trước và site sẽ cập nhật sau khi build xong (xem_trang_thai).'];
  try {
    luuBai(ctx.db, { id: cu.id, ngonNgu: 'vi', bai: moi, noiDung, trangThai: cu.trangThai, henGio: cu.henGio ?? undefined, nguoiId: ctx.nguoiDung.id, phienSo: cu.phienSo }, ctx.now);
  } catch (e) {
    throw loiLuu(e);
  }
  ctx.hangDoi.yeuCau();
  nhatKy(ctx, 'sua-bai', { baiId: cu.id });
  // Đổi tỉnh của bài ĐÃ ĐĂNG làm đổi URL → luuBai đã tự thêm redirect 301 (cả URL các bản dịch).
  if (daDang && moi.tinh !== cu.bai.tinh) ghiChu.push(`Đã thêm redirect 301: ${urlBai(cu.bai)} → ${urlBai(moi)}`);
  if (!daDang && moi.tinh !== cu.bai.tinh) {
    ghiChu.push(
      `URL của bài đổi từ ${urlBai(cu.bai)} sang ${urlBai(moi)}. Nếu bài này TỪNG đăng trước đây, URL cũ sẽ báo 404 ` +
        '(không tự tạo redirect được vì bài đang là nháp) — hãy báo chủ blog trước khi dang_bai.',
    );
  }
  return { id: cu.id, slug: cu.bai.slug, ghiChu };
}

// ---------- xem_trang_thai ----------
export interface TrangThai {
  build: TrangThaiBuild;
  previewNoiDungPhien: number | null;
  productionNoiDungPhien: number | null;
  linkXemTruoc: string;
  bai?: { id: number; slug: string; trangThai: string; noiDungPhienLuu: number | null; previewDaCoBanNay: boolean; linkXemTruoc: string };
  ghiChu?: string;
}

const phienLuu = (ctx: ToolCtx, id: number): number | null =>
  (ctx.db.prepare("SELECT noi_dung_phien_luu AS p FROM ban_dich WHERE bai_id = ? AND ngon_ngu = 'vi'").get(id) as { p: number | null }).p;

// build.json do bản build ghi lúc build (noiDungPhien); đọc thẳng từ volume (cùng đĩa với container web).
export async function xemTrangThai(ctx: ToolCtx, ref?: ThamChieuBai): Promise<TrangThai> {
  const [previewNoiDungPhien, productionNoiDungPhien] = await Promise.all([docBuildJson(ctx.config.previewDir), docBuildJson(ctx.config.siteDir)]);
  const tt: TrangThai = { build: ctx.hangDoi.trangThai(), previewNoiDungPhien, productionNoiDungPhien, linkXemTruoc: ctx.config.previewBaseUrl };
  if (previewNoiDungPhien === null) tt.ghiChu = 'Chưa đọc được build.json của bản xem trước (chưa build lần nào hoặc đang build).';
  if (ref && (ref.id !== undefined || ref.slug !== undefined)) {
    const d = timBai(ctx, ref);
    const p = phienLuu(ctx, d.id);
    tt.bai = {
      id: d.id, slug: d.bai.slug, trangThai: d.trangThai, noiDungPhienLuu: p,
      previewDaCoBanNay: previewNoiDungPhien !== null && p !== null && previewNoiDungPhien >= p,
      linkXemTruoc: `${ctx.config.previewBaseUrl}${urlBai(d.bai)}`,
    };
  }
  return tt;
}

// ---------- dang_bai ----------
export async function dangBai(ctx: ToolCtx, ref: ThamChieuBai): Promise<{ id: number; slug: string; linkBai: string; ghiChu: string }> {
  const d: BaiDoc = timBai(ctx, ref);
  const tacGia = (ctx.db.prepare('SELECT tac_gia_id FROM bai WHERE id = ?').get(d.id) as { tac_gia_id: number | null }).tac_gia_id;
  canQuyen(ctx, 'bai.dang', tacGia);
  if (d.trangThai === 'da-dang') throw new Error(`Bài "${d.bai.slug}" đã được đăng rồi.`);

  const bai = { ...d.bai, ngayDang: d.bai.ngayDang ?? ngayVN(ctx.now()), draft: false } as BaiViet;
  const kt = await kiemTraBaiToolTuDb(ctx, { bai, noiDung: d.noiDung, slugDangSua: d.bai.slug });
  if (!kt.dat) throw new Error(`Bài chưa đạt kiểm tra nên chưa đăng:\n${dongLoi(kt.loi)}`);

  // Cổng: bản xem trước đã build tới phiên nội dung lúc bài được lưu lần cuối (chủ blog đã có thể xem đúng thứ sắp đăng).
  const tt = await xemTrangThai(ctx, { id: d.id });
  if (!tt.bai!.previewDaCoBanNay) {
    if (tt.build.lanCuoi?.ok === false) {
      throw new Error('Bản xem trước chưa có bản mới nhất của bài vì lần build gần nhất bị lỗi (site vẫn giữ bản cũ). Hãy xem lỗi bằng xem_trang_thai, sửa bài rồi thử lại.');
    }
    throw new Error(
      `Bản xem trước chưa build tới bản mới nhất của bài (xem trước: phiên ${tt.previewNoiDungPhien ?? 'chưa có'}, bài lưu ở phiên ${tt.bai!.noiDungPhienLuu ?? '?'}). ` +
        'Hãy đợi build xong (xem_trang_thai), mở link xem trước kiểm tra lại rồi đăng.',
    );
  }
  try {
    luuBai(ctx.db, { id: d.id, ngonNgu: 'vi', bai, noiDung: d.noiDung, trangThai: 'da-dang', nguoiId: ctx.nguoiDung.id, phienSo: d.phienSo }, ctx.now);
  } catch (e) {
    throw loiLuu(e);
  }
  ctx.hangDoi.yeuCau();
  nhatKy(ctx, 'dang-bai', { baiId: d.id });
  return { id: d.id, slug: d.bai.slug, linkBai: `${ctx.config.publicBaseUrl}${urlBai(bai)}`, ghiChu: 'Bài sẽ hiện trên site sau vài phút, khi build xong.' };
}

// ---------- go_bai ----------
export async function goBai(ctx: ToolCtx, ref: ThamChieuBai): Promise<{ id: number; slug: string; ghiChu: string }> {
  const d = timBai(ctx, ref);
  const tacGia = (ctx.db.prepare('SELECT tac_gia_id FROM bai WHERE id = ?').get(d.id) as { tac_gia_id: number | null }).tac_gia_id;
  canQuyen(ctx, 'bai.dang', tacGia);
  if (d.trangThai === 'nhap') return { id: d.id, slug: d.bai.slug, ghiChu: 'Bài này đã là nháp (đã gỡ khỏi site).' };
  try {
    luuBai(ctx.db, { id: d.id, ngonNgu: 'vi', bai: d.bai, noiDung: d.noiDung, trangThai: 'nhap', nguoiId: ctx.nguoiDung.id }, ctx.now);
  } catch (e) {
    throw loiLuu(e);
  }
  ctx.hangDoi.yeuCau();
  nhatKy(ctx, 'go-bai', { baiId: d.id });
  return {
    id: d.id,
    slug: d.bai.slug,
    ghiChu:
      'Đã chuyển về nháp: bài biến khỏi site chính sau khi build xong (vài phút); các bản dịch của bài cũng biến theo. ' +
      'LƯU Ý nếu gỡ vì lộ thông tin riêng tư: go_bai KHÔNG xoá sạch — bản xem trước (nhap-vntraveltips…) vẫn hiển thị bài nháp, ' +
      'ảnh trong thư mục anh/ của VPS vẫn truy cập được nếu biết mã ảnh, và lịch sử phiên bản trong trang quản trị vẫn giữ nội dung. ' +
      'Hãy báo chủ blog xoá ảnh/xoá hẳn bài (thùng rác) nếu cần.',
  };
}

// ---------- dich_ai_ban_dich ----------
import { slugKhongTrung } from '../noi-dung/bai';
import { truongChuBanGoc } from '../noi-dung/ban-dich';
import { lietKeNgonNgu } from '../noi-dung/ngon-ngu';

/** Dịch bằng AI và TRẢ bản dịch để Claude đưa người dùng xem — KHÔNG lưu, KHÔNG đăng. */
export async function dichAiBanDich(ctx: ToolCtx, input: ThamChieuBai & { ngonNgu: string }): Promise<{ ketQua: unknown; canhBao: string[]; ghiChu: string }> {
  if (!ctx.dichVuAi) throw new Error('Chưa cấu hình AI dịch bài (chủ blog nhập API key ở /quan-tri/cai-dat-ai).');
  const d = timBai(ctx, input);
  const tacGia = (ctx.db.prepare('SELECT tac_gia_id FROM bai WHERE id = ?').get(d.id) as { tac_gia_id: number | null }).tac_gia_id;
  canQuyen(ctx, 'bai.sua', tacGia);
  const den = lietKeNgonNgu(ctx.db).find((n) => n.ma === input.ngonNgu && n.ma !== 'vi' && n.bat);
  if (!den) throw new Error(`Chưa có ngôn ngữ "${input.ngonNgu}" đang bật (thêm ở /quan-tri/ngon-ngu).`);
  const goc = truongChuBanGoc(ctx.db, d.id);
  if (!goc) throw new Error('Bản tiếng Việt chưa đủ trường theo luật bài viết nên chưa dịch được.');
  const kq = await ctx.dichVuAi.dichBai(goc, den);
  nhatKy(ctx, 'dich-ai', { baiId: d.id, ngonNgu: den.ma, tokenVao: kq.soToken.vao, tokenRa: kq.soToken.ra });
  return {
    ketQua: { ...kq.ketQua, slug: slugKhongTrung(ctx.db, den.ma, kq.ketQua.slug, d.id) },
    canhBao: kq.canhBao,
    ghiChu: `CHƯA LƯU gì cả. Hãy đưa bản dịch cho người dùng đọc; họ lưu/đăng ở ${ctx.config.publicBaseUrl}/quan-tri/bai/${d.id}/ban-dich/${den.ma}.`,
  };
}
