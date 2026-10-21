// Kiểm tra một bài TRƯỚC khi ghi/đăng: luật dữ liệu (schema chung) + tham chiếu (tỉnh, slug trùng) + ảnh + gợi ý SEO.
// Hàm thuần — không ghi gì, không gọi mạng. `loi` chặn đăng; `goiY` chỉ để Claude cân nhắc.
import { baiVietSchema, kiemTraThamChieu, type BaiViet, type Tinh } from '@vntraveltips/schema';

export interface KetQuaKiemTra {
  dat: boolean;
  loi: string[];
  goiY: string[];
}

const ANH_TRONG_THAN = /!\[([^\]]*)\]\(\s*([^)\s]*)[^)]*\)/g;
const LINK_NOI_BO = /\]\(\s*\/[^)]*\)/;

export function kiemTraBai(
  duLieu: unknown,
  tinh: Pick<Tinh, 'slug'>[],
  baiKhac: { slug: string }[],
  noiDung = '',
  maAnhHopLe?: (ma: string) => boolean,
  chuyenMuc?: { slug: string }[],
): KetQuaKiemTra {
  const kq = baiVietSchema.safeParse(duLieu);
  if (!kq.success) {
    return {
      dat: false,
      loi: kq.error.issues.map((i) => `${i.path.join('.') || '(bài viết)'}: ${i.message}`),
      goiY: [],
    };
  }
  const bai: BaiViet = kq.data;
  const loi: string[] = [];
  const goiY: string[] = [];

  // Tham chiếu: chỉ giữ các lỗi nói về chính bài này.
  for (const l of kiemTraThamChieu([{ slug: bai.slug, tinh: bai.tinh, chuyenMuc: bai.chuyenMuc }, ...baiKhac], tinh, chuyenMuc)) {
    if (l.includes(`"${bai.slug}"`)) loi.push(l.replace(/^Slug "([^"]+)" bị trùng$/, 'Slug "$1" bị trùng với một bài khác'));
  }

  // Ảnh: bìa + ảnh địa điểm phải có trên máy chủ; ảnh trong thân phải dạng ![alt](anh:MÃ), alt không rỗng.
  if (maAnhHopLe) {
    const maCanCo = [bai.anhBia.ma, ...bai.diaDiem.flatMap((d) => d.anh.map((a) => a.ma))];
    for (const ma of maCanCo) if (!maAnhHopLe(ma)) loi.push(`Mã ảnh "${ma}" không có trên máy chủ (hãy tải ảnh lên trước).`);
  }
  for (const m of noiDung.matchAll(ANH_TRONG_THAN)) {
    const [, alt, src] = m;
    if (!alt.trim()) loi.push(`Ảnh trong thân bài thiếu alt: ${src}`);
    if (!src.startsWith('anh:')) {
      loi.push(`Ảnh trong thân bài phải viết dạng ![mô tả](anh:MÃ_ẢNH), không dùng URL: ${src}`);
    } else if (maAnhHopLe && !maAnhHopLe(src.slice(4))) {
      loi.push(`Mã ảnh "${src.slice(4)}" trong thân bài không có trên máy chủ.`);
    }
  }

  // Gợi ý SEO (không chặn đăng).
  if (bai.tieuDe.length > 70) goiY.push(`Tiêu đề dài ${bai.tieuDe.length} ký tự; nên ≤ 60–70 để Google không cắt bớt.`);
  const soTu = noiDung.split(/\s+/).filter(Boolean).length;
  if (soTu < 300) goiY.push(`Thân bài khoảng ${soTu} từ; nên từ 300 từ trở lên để đủ nội dung cho Google.`);
  if (baiKhac.length > 0 && !LINK_NOI_BO.test(noiDung)) {
    goiY.push('Chưa có link nội bộ; thêm ít nhất một link tới bài khác cùng tỉnh/chuyên mục (dạng [chữ](/tinh/slug/)).');
  }
  if (bai.loai === 'nhat-ky' && !bai.ngayDi) goiY.push('Nhật ký nên điền ngayDi để chứng minh trải nghiệm thật.');

  return { dat: loi.length === 0, loi, goiY };
}
