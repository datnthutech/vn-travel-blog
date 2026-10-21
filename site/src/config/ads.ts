// Cấu hình quảng cáo. TẮT mặc định. Khi có khoảng 30–50 bài và vài trăm lượt xem/ngày thì xin AdSense, rồi:
//   1) đặt enabled: true  2) điền client (ca-pub-...) và mã từng ô (slots)  3) push lên main.
// Mỗi ô giữ sẵn chiều cao tối thiểu (minHeight, px) để trang không bị nhảy bố cục khi quảng cáo tải xong.
// Script quảng cáo chỉ được tải khi enabled, và tải chậm (sau khi trang load xong, lúc trình duyệt rảnh).
export const ads = {
  enabled: false,
  client: '', // ví dụ 'ca-pub-1234567890123456'
  slots: { sauTraNhanh: '', giuaBai: '', cuoiBai: '' },
  minHeight: { sauTraNhanh: 280, giuaBai: 280, cuoiBai: 280 },
} as const;
