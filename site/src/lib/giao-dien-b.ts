// Logic chọn dữ liệu cho giao diện hướng B (thuần, không phụ thuộc Astro — test được bằng vitest).
// Component .astro chỉ trình bày kết quả ở đây.
import type { BaiViet } from '@vntraveltips/schema';
import { t } from '../i18n/giao-dien';
import type { ChuyenMuc } from './chuyen-muc';

export interface Nhan {
  bieuTuong?: string;
  chu: string;
}

export interface ChuDe {
  slug: string;
  ten: string;
  anh?: { ma: string; alt: string };
  soBai: number;
}

/** Bài mới nhất trước: ngayDang giảm dần, bằng nhau thì slug tăng dần. Không đổi mảng gốc. */
export function baiMoiNhat(bai: BaiViet[], toiDa = bai.length): BaiViet[] {
  return [...bai].sort((a, b) => b.ngayDang.getTime() - a.ngayDang.getTime() || a.slug.localeCompare(b.slug)).slice(0, toiDa);
}

/** 6800000 → "6.800.000đ" (vi-VN; ngôn ngữ khác dùng Intl theo mã, vẫn hậu tố "đ"). */
export function dinhDangTien(so: number, ngonNgu: string): string {
  return new Intl.NumberFormat(ngonNgu === 'vi' ? 'vi-VN' : ngonNgu).format(so) + 'đ';
}

/** Nhãn cho thẻ bài: [tên tỉnh?] [👶 "{n}/5 với bé" nếu có traNhanh] [💰 tổng chi phí nếu có traNhanh]. */
export function nhanTheBai(bai: BaiViet, ngonNgu: string, tenTinh?: string): Nhan[] {
  const nhan: Nhan[] = [];
  if (tenTinh) nhan.push({ chu: tenTinh });
  if (bai.traNhanh) {
    nhan.push({ bieuTuong: '👶', chu: t(ngonNgu, 'diem-voi-be', { n: bai.traNhanh.diemThanThienVoiBe }) });
    nhan.push({ bieuTuong: '💰', chu: dinhDangTien(bai.traNhanh.tongChiPhi, ngonNgu) });
  }
  return nhan;
}

/** Nhãn đầu bài: [tên tỉnh?] [tên loại bài] [👶 "{n}/5 với bé" nếu có traNhanh]. */
export function nhanDauBai(bai: BaiViet, ngonNgu: string, tenTinh?: string): Nhan[] {
  const nhan: Nhan[] = [];
  if (tenTinh) nhan.push({ chu: tenTinh });
  nhan.push({ chu: t(ngonNgu, `loai.${bai.loai}`) });
  if (bai.traNhanh) {
    nhan.push({ bieuTuong: '👶', chu: t(ngonNgu, 'diem-voi-be', { n: bai.traNhanh.diemThanThienVoiBe }) });
  }
  return nhan;
}

/** Chuyên mục có ≥1 bài, sắp số bài giảm dần, bằng nhau theo thuTu; ảnh = cm.anhBia ?? ảnh bìa bài mới nhất của chuyên mục; tối đa toiDa (mặc định 8). */
export function chuDeNoiBat(chuyenMuc: ChuyenMuc[], bai: BaiViet[], toiDa = 8): ChuDe[] {
  const ds: ChuDe[] = [];
  for (const cm of [...chuyenMuc].sort((a, b) => a.thuTu - b.thuTu)) {
    const baiCuaMuc = baiMoiNhat(bai.filter((b) => b.chuyenMuc.includes(cm.slug)));
    if (baiCuaMuc.length === 0) continue;
    const anh = cm.anhBia ?? baiCuaMuc[0].anhBia;
    ds.push({ slug: cm.slug, ten: cm.ten, anh, soBai: baiCuaMuc.length });
  }
  return ds.sort((a, b) => b.soBai - a.soBai).slice(0, toiDa);
}
