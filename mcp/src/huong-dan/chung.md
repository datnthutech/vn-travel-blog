# Giọng văn và checklist duyệt bài VNTravelTips

## Người đọc và giọng văn
- Người đọc là **gia đình có con nhỏ đang tính đi đâu đó**, muốn biết "đi có tiện không". **Thông tin tiện lợi lên trước, kể chuyện để sau.**
- Giọng thân mật, thật thà, ngôi "chúng mình"/"gia đình mình". Kể trải nghiệm thật (đã đi, đã trả tiền), nêu cả điểm chưa hài lòng.
- Câu ngắn, đoạn ngắn (đọc trên điện thoại). Con số cụ thể: giá, giờ, khoảng cách, thời gian di chuyển.
- Không phóng đại, không "tuyệt vời nhất", không chép lại mô tả của nơi bán. Mọi lời khen cần một chi tiết đi kèm.
- Luôn nêu góc nhìn của bé: có chỗ cho bé chạy chơi không, có ghế ăn/nôi không, có nguy hiểm gì không.
- Có link affiliate thì đặt đúng chỗ (trường `linkDat`, `doMangChoBe[].link`), không chèn link kiếm tiền vào văn bản.
- Bài hợp tác phải đặt `hopTac: true`.

## Cách đặt dữ liệu bài (frontmatter)
- Bắt buộc: `tieuDe`, `slug` (a-z, 0-9, gạch ngang; không dấu), `moTa` (120–160 ký tự), `loai`, `anhBia {ma, alt}`, `ngayDang`.
- `loai`: `nhat-ky` | `review` | `top-list` | `cam-nang`. Nhật ký và review **bắt buộc** có `traNhanh`.
- `tinh`: slug tỉnh đã có (để trống nếu bài nhiều tỉnh/không thuộc tỉnh nào — bài sẽ nằm ở `/kinh-nghiem/…`).
- `chuyenMuc`: `sinh-thai` | `an-uong` | `vui-choi` | `luu-tru` | `di-chuyen`.
- `traNhanh`: `hopVoi`, `thoiGian`, `choO`, `tongChiPhi` (số, đồng), `soNguoi`, `diemThanThienVoiBe` (1–5), `diChuyen`, `thoiDiemNenDi`, `luuYVoiBe[]`.
- `diaDiem[]`: `ten`, `kieu` (`cho-o` | `quan-an` | `cho` | `khu-sinh-thai` | `diem-choi`), `diaChi`, `toaDo {lat,lng}`, `khoangGia`, `gioMoCua`, `thanThienVoiBe`, `diem` (1–5), `uuDiem[]`, `nhuocDiem[]`, `anh[] {ma, alt}`, `linkDat {nhaCungCap, url}`.
- `doMangChoBe[] {ten, ghiChu, link}`, `faq[] {hoi, dap}`, `ngayDi` (ngày đi thật, nên có), `hopTac`.
- Ảnh trong thân bài viết dạng `![mô tả ảnh](anh:MÃ_ẢNH)` — mã ảnh lấy từ `liet_ke_anh`. **Alt không được để trống.** Không dùng URL ảnh ngoài.
- Link nội bộ: `[chữ](/tinh/slug/)` hoặc `[chữ](/kinh-nghiem/slug/)`.

## Checklist duyệt (Claude làm trước khi gọi `tao_ban_nhap`)
1. Khối **Tra nhanh** đầy đủ và đúng với nội dung bài (giá, thời gian, mức thân thiện với bé).
2. Tiêu đề ≤ ~60–70 ký tự, có địa danh và ý chính; `moTa` 120–160 ký tự, có lợi ích cụ thể.
3. Mọi ảnh có alt mô tả đúng nội dung (hãy **nhìn ảnh** qua `liet_ke_anh` rồi viết alt), chọn ảnh bìa rõ nhất.
4. Có `ngayDi`, có ít nhất một link nội bộ, thân bài từ ~300 từ.
5. Không lộ thông tin riêng tư: địa chỉ nhà, biển số xe, mặt người ngoài gia đình, tên đầy đủ của bé.
6. Chạy `kiem_tra_bai`; sửa hết **lỗi**, cân nhắc **gợi ý**. Chỉ khi đạt mới `tao_ban_nhap`, xem preview trên điện thoại rồi mới `dang_bai`.
