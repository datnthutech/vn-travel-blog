// Bảng phân quyền duy nhất cho ba vai trò. Thuần TypeScript: máy chủ (mcp) dùng để QUYẾT ĐỊNH, giao diện (admin) chỉ dùng
// để ẩn/hiện nút — server luôn kiểm tra lại.
export type VaiTro = 'quan-tri' | 'quan-ly' | 'writer';
export const CAC_VAI_TRO: readonly VaiTro[] = ['quan-tri', 'quan-ly', 'writer'];

export type HanhDong =
  | 'bai.tao'
  | 'bai.sua'
  | 'bai.dang'
  | 'bai.thung-rac'
  | 'bai.xoa-han'
  | 'bai.xem'
  | 'ban-dich.kiem-tra'
  | 'anh.tai-len'
  | 'anh.xoa'
  | 'binh-luan.an-xoa'
  /** chuyên mục, tỉnh, tag, menu, trang tĩnh, redirect */
  | 'cau-truc.sua'
  /** site, mail, AI, newsletter, bình luận */
  | 'cai-dat.sua'
  | 'tai-khoan.quan-ly'
  | 'nhat-ky.xem'
  | 'ban-tin.gui';

export const TAT_CA_HANH_DONG: readonly HanhDong[] = [
  'bai.tao', 'bai.sua', 'bai.dang', 'bai.thung-rac', 'bai.xoa-han', 'bai.xem', 'ban-dich.kiem-tra', 'anh.tai-len', 'anh.xoa',
  'binh-luan.an-xoa', 'cau-truc.sua', 'cai-dat.sua', 'tai-khoan.quan-ly', 'nhat-ky.xem', 'ban-tin.gui',
];

const QUAN_LY_KHONG_DUOC: readonly HanhDong[] = ['cai-dat.sua', 'tai-khoan.quan-ly', 'nhat-ky.xem', 'ban-tin.gui', 'bai.xoa-han'];
const WRITER_TU_DO: readonly HanhDong[] = ['bai.tao', 'bai.xem', 'ban-dich.kiem-tra', 'anh.tai-len'];
const WRITER_CUA_MINH: readonly HanhDong[] = ['bai.sua', 'bai.dang', 'bai.thung-rac', 'binh-luan.an-xoa', 'anh.xoa'];

/**
 * `ngu.tacGiaId`: chủ sở hữu của đối tượng (tác giả bài; người tải ảnh lên). Writer chỉ làm được các hành động
 * sửa/đăng/thùng rác/ẩn bình luận/xoá ảnh trên đối tượng của CHÍNH MÌNH.
 */
export function coQuyen(nguoi: { id: number; vaiTro: VaiTro }, hd: HanhDong, ngu: { tacGiaId?: number | null } = {}): boolean {
  switch (nguoi.vaiTro) {
    case 'quan-tri':
      return true;
    case 'quan-ly':
      return !QUAN_LY_KHONG_DUOC.includes(hd);
    case 'writer':
      if (WRITER_TU_DO.includes(hd)) return true;
      return WRITER_CUA_MINH.includes(hd) && ngu.tacGiaId !== undefined && ngu.tacGiaId !== null && ngu.tacGiaId === nguoi.id;
    default:
      return false; // vai trò lạ → không có quyền gì
  }
}
