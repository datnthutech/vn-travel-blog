// Cấu hình quảng cáo. TẮT mặc định. Bật/tắt và chọn vị trí trong trang quản trị (Cài đặt site → Quảng cáo); mã AdSense
// (client, slots) vẫn điền ở đây sau khi có tài khoản AdSense: client 'ca-pub-…' và mã từng ô.
// Mỗi ô giữ sẵn chiều cao tối thiểu (minHeight, px) để trang không bị nhảy bố cục. Script chỉ tải khi bật, và tải chậm.
import { layCaiDatSite } from '../lib/cai-dat';

const VI_TRI = { sauTraNhanh: 'sau-tra-nhanh', giuaBai: 'giua-bai', cuoiBai: 'cuoi-bai' } as const;
const caiDat = layCaiDatSite().quangCao;
const client = ''; // ví dụ 'ca-pub-1234567890123456'
const slots = { sauTraNhanh: '', giuaBai: '', cuoiBai: '' };

export const ads = {
  // Chỉ thật sự bật khi đã bật trong Cài đặt site VÀ đã điền mã client (tránh sinh ô trống/ script lỗi).
  enabled: caiDat.bat && client !== '',
  client,
  slots,
  minHeight: { sauTraNhanh: 280, giuaBai: 280, cuoiBai: 280 },
  /** Ô nào được hiện theo Cài đặt site. */
  viTri: Object.fromEntries(Object.entries(VI_TRI).map(([k, v]) => [k, caiDat.viTri.includes(v)])) as Record<keyof typeof VI_TRI, boolean>,
} as const;
