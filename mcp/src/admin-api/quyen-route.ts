// Khai báo quyền của TỪNG route dưới /api/admin. Test `quyen-route.test.ts` duyệt mọi route thật của router và bắt buộc
// mỗi route phải có ở đây (route mới quên khai báo → test đỏ), rồi gọi thử bằng 3 vai trò để chắc middleware khớp khai báo.
import type { HanhDong } from '@vntraveltips/schema';

export type QuyenRoute = HanhDong | 'chi-dang-nhap' | 'cong-khai';
export interface KhaiBaoRoute {
  phuongThuc: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  duongDan: string;
  hanhDong: QuyenRoute;
  /** Route làm đổi phiên đăng nhập (đăng xuất, đổi mật khẩu, 2FA…): không gọi thử hàng loạt trong test. */
  doiPhien?: true;
}

const L = (phuongThuc: KhaiBaoRoute['phuongThuc'], duongDan: string, hanhDong: QuyenRoute, doiPhien?: true): KhaiBaoRoute => ({ phuongThuc, duongDan, hanhDong, ...(doiPhien ? { doiPhien } : {}) });

export const QUYEN_ROUTE: KhaiBaoRoute[] = [
  // Đăng nhập, phiên, 2FA (mọi người dùng đã đăng nhập tự quản lý tài khoản của mình)
  L('POST', '/dang-nhap', 'cong-khai'),
  L('POST', '/quen-mat-khau', 'cong-khai'),
  L('POST', '/dat-lai-mat-khau', 'cong-khai'),
  L('GET', '/toi', 'chi-dang-nhap'),
  L('POST', '/dang-xuat', 'chi-dang-nhap', true),
  L('GET', '/phien', 'chi-dang-nhap'),
  L('DELETE', '/phien/:id', 'chi-dang-nhap'),
  L('POST', '/dang-xuat-moi-noi', 'chi-dang-nhap', true),
  L('POST', '/doi-mat-khau', 'chi-dang-nhap', true),
  L('POST', '/dang-nhap/totp', 'chi-dang-nhap', true),
  L('POST', '/2fa/bat-dau', 'chi-dang-nhap', true),
  L('POST', '/2fa/xac-nhan', 'chi-dang-nhap', true),
  L('POST', '/2fa/tat', 'chi-dang-nhap', true),
  L('GET', '/loi-moi/:token', 'cong-khai'),
  L('POST', '/loi-moi/:token/nhan', 'cong-khai'),
  L('POST', '/tai-khoan/moi', 'tai-khoan.quan-ly'),
  L('GET', '/tai-khoan', 'tai-khoan.quan-ly'),
  L('PUT', '/tai-khoan/:id', 'tai-khoan.quan-ly'),
  L('POST', '/tai-khoan/:id/dat-lai-2fa', 'tai-khoan.quan-ly'),
  L('GET', '/nhat-ky', 'nhat-ky.xem'),
  // Bài viết
  L('GET', '/bai', 'bai.xem'),
  L('GET', '/bai/:id', 'bai.xem'),
  L('POST', '/bai', 'bai.tao'),
  L('PUT', '/bai/:id', 'bai.sua'),
  L('PATCH', '/bai/:id/tu-luu', 'bai.sua'),
  L('POST', '/bai/:id/dang', 'bai.dang'),
  L('POST', '/bai/:id/go', 'bai.dang'),
  L('POST', '/bai/:id/thung-rac', 'bai.thung-rac'),
  L('POST', '/bai/:id/khoi-phuc', 'bai.thung-rac'),
  L('DELETE', '/bai/:id', 'bai.xoa-han'),
  L('POST', '/bai/:id/nhan-ban', 'bai.tao'),
  L('GET', '/bai/:id/phien-ban', 'bai.xem'),
  L('GET', '/bai/:id/phien-ban/:pid', 'bai.xem'),
  L('GET', '/bai/:id/phien-ban/:pid/so-sanh', 'bai.xem'),
  L('POST', '/bai/:id/phien-ban/:pid/khoi-phuc', 'bai.sua'),
  L('POST', '/bai/:id/hen-gio', 'bai.dang'),
  L('POST', '/bai/:id/huy-hen-gio', 'bai.dang'),
  L('POST', '/bai/:id/xem-truoc', 'bai.sua'),
  // Ảnh
  L('POST', '/anh', 'anh.tai-len'),
  L('GET', '/anh', 'chi-dang-nhap'),
  L('GET', '/o-dia', 'chi-dang-nhap'),
  L('PATCH', '/anh/:ma', 'anh.tai-len'),
  L('GET', '/anh/:ma/dung-o', 'chi-dang-nhap'),
  L('DELETE', '/anh/:ma', 'anh.xoa'),
  // Cấu trúc site: người dùng nào cũng ĐỌC được (cần cho trình soạn bài), chỉ quản lý trở lên mới SỬA
  L('GET', '/chuyen-muc', 'chi-dang-nhap'),
  L('POST', '/chuyen-muc', 'cau-truc.sua'),
  L('PUT', '/chuyen-muc/thu-tu', 'cau-truc.sua'),
  L('PUT', '/chuyen-muc/:slug', 'cau-truc.sua'),
  L('DELETE', '/chuyen-muc/:slug', 'cau-truc.sua'),
  L('GET', '/tinh', 'chi-dang-nhap'),
  L('POST', '/tinh', 'cau-truc.sua'),
  L('PUT', '/tinh/:slug', 'cau-truc.sua'),
  L('DELETE', '/tinh/:slug', 'cau-truc.sua'),
  L('GET', '/tag', 'chi-dang-nhap'),
  L('GET', '/tag/khong-dung', 'chi-dang-nhap'),
  L('POST', '/tag/doi-ten', 'cau-truc.sua'),
  L('GET', '/menu', 'chi-dang-nhap'),
  L('PUT', '/menu', 'cau-truc.sua'),
  L('GET', '/trang', 'chi-dang-nhap'),
  L('POST', '/trang', 'cau-truc.sua'),
  L('GET', '/trang/:slug', 'chi-dang-nhap'),
  L('PUT', '/trang/:slug', 'cau-truc.sua'),
  L('PATCH', '/trang/:slug/tu-luu', 'cau-truc.sua'),
  L('POST', '/trang/:slug/dang', 'cau-truc.sua'),
  L('POST', '/trang/:slug/go', 'cau-truc.sua'),
  L('DELETE', '/trang/:slug', 'cau-truc.sua'),
  L('GET', '/trang/:slug/phien-ban', 'chi-dang-nhap'),
  L('GET', '/redirect', 'chi-dang-nhap'),
  L('POST', '/redirect', 'cau-truc.sua'),
  L('DELETE', '/redirect', 'cau-truc.sua'),
  // Bảng tổng quan và build
  L('GET', '/tong-quan', 'cau-truc.sua'),
  L('GET', '/build', 'chi-dang-nhap'),
  // Cài đặt (site, mail…) — chỉ quản trị
  L('GET', '/cai-dat/site', 'cai-dat.sua'),
  L('PUT', '/cai-dat/site', 'cai-dat.sua'),
  L('GET', '/mail/mau', 'cai-dat.sua'),
  L('GET', '/mail/nha-cung-cap', 'cai-dat.sua'),
  L('POST', '/mail/nha-cung-cap', 'cai-dat.sua'),
  L('PUT', '/mail/nha-cung-cap/:id', 'cai-dat.sua'),
  L('DELETE', '/mail/nha-cung-cap/:id', 'cai-dat.sua'),
  L('POST', '/mail/nha-cung-cap/:id/gui-thu', 'cai-dat.sua'),
  L('GET', '/mail/thong-ke', 'cai-dat.sua'),
  L('GET', '/mail/nhat-ky', 'cai-dat.sua'),
];
