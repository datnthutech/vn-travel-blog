// Bản dịch của bài viết: dòng `ban_dich` với ngon_ngu ≠ 'vi'. `du_lieu` chỉ chứa TRƯỜNG CHỮ (BanDichChu trừ noiDung — thân bài nằm ở cột `noi_dung`);
// khi xuất/đăng thì ghép với phần không phải chữ của bản tiếng Việt (ghepBanDich). `ban_goc_bam` = băm bản vi lúc lưu → biết bản dịch có "cũ hơn bản gốc".
import { bamBanGoc, ghepBanDich, tachTruongChu, urlBai, type BaiViet, type BanDichChu } from '@vntraveltips/schema';
import type { Db } from '../db/ket-noi';
import { docBai, themRedirectKhiDoiUrl, XungDotPhienBan, type TrangThaiBan } from './bai';
import { danhDauNoiDungDoi } from './phien-noi-dung';

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export type DichLuu = Partial<Omit<BanDichChu, 'noiDung'>> & { tieuDe: string; slug: string };

export interface BanDichDoc {
  baiId: number;
  ngonNgu: string;
  dich: DichLuu;
  noiDung: string;
  trangThai: TrangThaiBan;
  henGio: number | null;
  phienSo: number;
  suaLuc: number;
  dangLuc: number | null;
  banGocBam: string | null;
  daKiemTra: boolean;
  ghiChuKiemTra: string | null;
  nguoiKiemTraId: number | null;
  kiemTraLuc: number | null;
  nguoiSuaCuoiId: number | null;
  nhapTuLuu: { dich: unknown; noiDung: string; luc: number } | null;
}

interface Dong {
  bai_id: number; ngon_ngu: string; slug: string; trang_thai: TrangThaiBan; hen_gio: number | null; du_lieu: string; noi_dung: string;
  dang_luc: number | null; sua_luc: number; phien_so: number; nhap_tu_luu: string | null; ban_goc_bam: string | null; da_kiem_tra: number;
  ghi_chu_kiem_tra: string | null; nguoi_kiem_tra_id: number | null; kiem_tra_luc: number | null; nguoi_sua_cuoi_id: number | null;
}

const CHON = `SELECT d.bai_id, d.ngon_ngu, d.slug, d.trang_thai, d.hen_gio, d.du_lieu, d.noi_dung, d.dang_luc, d.sua_luc, d.phien_so, d.nhap_tu_luu,
  d.ban_goc_bam, d.da_kiem_tra, d.ghi_chu_kiem_tra, d.nguoi_kiem_tra_id, d.kiem_tra_luc, b.nguoi_sua_cuoi_id
  FROM ban_dich d JOIN bai b ON b.id = d.bai_id`;

const toDoc = (r: Dong): BanDichDoc => ({
  baiId: r.bai_id, ngonNgu: r.ngon_ngu, dich: { ...(JSON.parse(r.du_lieu) as DichLuu), slug: r.slug }, noiDung: r.noi_dung, trangThai: r.trang_thai, henGio: r.hen_gio,
  phienSo: r.phien_so, suaLuc: r.sua_luc, dangLuc: r.dang_luc, banGocBam: r.ban_goc_bam, daKiemTra: r.da_kiem_tra === 1, ghiChuKiemTra: r.ghi_chu_kiem_tra,
  nguoiKiemTraId: r.nguoi_kiem_tra_id, kiemTraLuc: r.kiem_tra_luc, nguoiSuaCuoiId: r.nguoi_sua_cuoi_id, nhapTuLuu: r.nhap_tu_luu ? JSON.parse(r.nhap_tu_luu) : null,
});

export const docBanDich = (db: Db, baiId: number, ngonNgu: string): BanDichDoc | null => {
  const r = db.prepare(`${CHON} WHERE d.bai_id = ? AND d.ngon_ngu = ?`).get(baiId, ngonNgu) as Dong | undefined;
  return r ? toDoc(r) : null;
};

/** Bản tiếng Việt DÙNG LÀM GỐC (phải đủ trường, qua schema): null nếu chưa. */
export function banGocVi(db: Db, baiId: number): { bai: BaiViet; noiDung: string; trangThai: TrangThaiBan; daXoa: boolean } | null {
  const d = docBai(db, baiId, 'vi');
  return d && d.hopLe ? { bai: d.bai, noiDung: d.noiDung, trangThai: d.trangThai, daXoa: d.xoaLuc !== null } : null;
}

export function cuHonBanGoc(db: Db, ban: Pick<BanDichDoc, 'baiId' | 'banGocBam'>): boolean {
  const g = banGocVi(db, ban.baiId);
  return !!g && ban.banGocBam !== bamBanGoc(g.bai, g.noiDung);
}

/** Phần chữ của bản gốc để người dịch đối chiếu (và AI dịch). */
export const truongChuBanGoc = (db: Db, baiId: number): BanDichChu | null => {
  const g = banGocVi(db, baiId);
  return g ? tachTruongChu(g.bai, g.noiDung) : null;
};

/** Ghép bản dịch + bản gốc thành BaiViet đầy đủ (ném lỗi nêu mảng lệch nếu cấu trúc không khớp). */
export function ghepDayDu(db: Db, ban: BanDichDoc): { bai: BaiViet; noiDung: string } {
  const g = banGocVi(db, ban.baiId);
  if (!g) throw new Error('Bản tiếng Việt chưa đủ trường nên chưa ghép được bản dịch');
  const bai = ghepBanDich(g.bai, { ...(ban.dich as BanDichChu), noiDung: ban.noiDung, diaDiem: (ban.dich.diaDiem ?? []) as BanDichChu['diaDiem'], doMangChoBe: ban.dich.doMangChoBe ?? [], faq: ban.dich.faq ?? [] });
  return { bai, noiDung: ban.noiDung };
}

export interface LuuBanDichInput {
  baiId: number;
  ngonNgu: string;
  dich: unknown;
  noiDung: string;
  trangThai: TrangThaiBan;
  henGio?: number;
  nguoiId?: number;
  phienSo?: number;
}

function kiemCoBan(dich: unknown): DichLuu {
  const d = dich as Record<string, unknown> | null;
  if (!d || typeof d !== 'object' || Array.isArray(d)) throw new Error('Bản dịch không hợp lệ: cần là một đối tượng');
  if (typeof d.tieuDe !== 'string') throw new Error('Bản dịch không hợp lệ: tieuDe: cần là chuỗi');
  if (typeof d.slug !== 'string' || !SLUG.test(d.slug)) throw new Error('Bản dịch không hợp lệ: slug: chỉ gồm a-z, 0-9 và dấu gạch ngang');
  const { noiDung: _n, ...con } = d;
  return con as DichLuu;
}

/** Lưu (tạo mới hoặc ghi đè) một bản dịch + ghi lịch sử. Có `phienSo` mà lệch → XungDotPhienBan. Xoá dấu "đã kiểm tra" (nội dung đã đổi). */
export function luuBanDich(db: Db, input: LuuBanDichInput, now: () => number = Date.now): { phienSo: number } {
  const du = kiemCoBan(input.dich);
  const g = banGocVi(db, input.baiId);
  if (!g) throw new Error('Hoàn thiện bản tiếng Việt (đủ trường theo luật bài viết) trước khi dịch');
  const t = now();
  const bam = bamBanGoc(g.bai, g.noiDung);
  const json = JSON.stringify(du);
  return db.transaction(() => {
    const cu = db
      .prepare(
        `SELECT d.slug, d.trang_thai, d.phien_so, d.sua_luc, d.dang_luc, u.ten AS nguoi_sua FROM ban_dich d JOIN bai b ON b.id = d.bai_id
         LEFT JOIN nguoi_dung u ON u.id = b.nguoi_sua_cuoi_id WHERE d.bai_id = ? AND d.ngon_ngu = ?`,
      )
      .get(input.baiId, input.ngonNgu) as { slug: string; trang_thai: TrangThaiBan; phien_so: number; sua_luc: number; dang_luc: number | null; nguoi_sua: string | null } | undefined;
    let phienSo = 1;
    if (!cu) {
      db.prepare(
        'INSERT INTO ban_dich (bai_id, ngon_ngu, slug, trang_thai, hen_gio, du_lieu, noi_dung, dang_luc, sua_luc, phien_so, phien_ban_cuoi_luc, ban_goc_bam) VALUES (?,?,?,?,?,?,?,?,?,1,?,?)',
      ).run(input.baiId, input.ngonNgu, du.slug, input.trangThai, input.henGio ?? null, json, input.noiDung, input.trangThai === 'da-dang' ? t : null, t, t, bam);
    } else {
      if (input.phienSo !== undefined && input.phienSo !== cu.phien_so) throw new XungDotPhienBan(cu.nguoi_sua, cu.sua_luc);
      phienSo = cu.phien_so + 1;
      if (cu.trang_thai === 'da-dang' && cu.slug !== du.slug) {
        const tinh = g.bai.tinh;
        themRedirectKhiDoiUrl(db, `/${input.ngonNgu}${urlBai({ slug: cu.slug, tinh })}`, `/${input.ngonNgu}${urlBai({ slug: du.slug, tinh })}`);
      }
      db.prepare(
        `UPDATE ban_dich SET slug = ?, trang_thai = ?, hen_gio = ?, du_lieu = ?, noi_dung = ?, dang_luc = ?, sua_luc = ?, phien_so = ?, nhap_tu_luu = NULL, phien_ban_cuoi_luc = ?, ban_goc_bam = ?,
           da_kiem_tra = 0, ghi_chu_kiem_tra = NULL, nguoi_kiem_tra_id = NULL, kiem_tra_luc = NULL WHERE bai_id = ? AND ngon_ngu = ?`,
      ).run(du.slug, input.trangThai, input.henGio ?? null, json, input.noiDung, input.trangThai === 'da-dang' ? (cu.dang_luc ?? t) : cu.dang_luc, t, phienSo, t, bam, input.baiId, input.ngonNgu);
    }
    db.prepare('INSERT INTO phien_ban (bai_id, ngon_ngu, nguoi_dung_id, luc, du_lieu, noi_dung) VALUES (?,?,?,?,?,?)').run(input.baiId, input.ngonNgu, input.nguoiId ?? null, t, json, input.noiDung);
    db.prepare('UPDATE bai SET nguoi_sua_cuoi_id = ?, sua_luc = ? WHERE id = ?').run(input.nguoiId ?? null, t, input.baiId);
    danhDauNoiDungDoi(db);
    return { phienSo };
  })();
}

/** Đổi trạng thái (gỡ, hẹn giờ…) mà không đổi nội dung. */
export function datTrangThaiBanDich(db: Db, baiId: number, ngonNgu: string, trangThai: TrangThaiBan, henGio: number | null, nguoiId: number | null, now: () => number): void {
  db.transaction(() => {
    const cu = db.prepare('SELECT dang_luc FROM ban_dich WHERE bai_id = ? AND ngon_ngu = ?').get(baiId, ngonNgu) as { dang_luc: number | null };
    db.prepare('UPDATE ban_dich SET trang_thai = ?, hen_gio = ?, dang_luc = ?, sua_luc = ?, phien_so = phien_so + 1, hen_gio_nguoi_id = ? WHERE bai_id = ? AND ngon_ngu = ?').run(
      trangThai, henGio, trangThai === 'da-dang' ? (cu.dang_luc ?? now()) : cu.dang_luc, now(), trangThai === 'hen-gio' ? nguoiId : null, baiId, ngonNgu,
    );
    danhDauNoiDungDoi(db);
  })();
}

/** Số bài tiếng Việt ĐÃ ĐĂNG chưa có bản dịch `ma`, và số bản dịch cũ hơn bản gốc (bài trong thùng rác không tính). */
export function thongKeBanDich(db: Db, ma: string): { chua: number; cu: number } {
  const ids = (db.prepare("SELECT d.bai_id AS id FROM ban_dich d JOIN bai b ON b.id = d.bai_id WHERE d.ngon_ngu = 'vi' AND d.trang_thai = 'da-dang' AND b.xoa_luc IS NULL").all() as { id: number }[]).map((r) => r.id);
  let chua = 0;
  let cu = 0;
  for (const id of ids) {
    const ban = docBanDich(db, id, ma);
    if (!ban) chua++;
    else if (cuHonBanGoc(db, ban)) cu++;
  }
  return { chua, cu };
}
