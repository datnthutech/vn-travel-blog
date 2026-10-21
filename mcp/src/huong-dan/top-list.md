# Mẫu bài: Top N (`loai: top-list`)

Danh sách xếp hạng, ví dụ "Top 10 bãi biển êm sóng cho bé". `traNhanh` không bắt buộc. Bài thường **không có `tinh`** (nằm ở `/kinh-nghiem/…`) nếu gồm nhiều tỉnh.

Bố cục thân bài:
1. Đoạn mở: tiêu chí xếp hạng (vì sao những nơi này hợp cho gia đình có bé nhỏ).
2. Mỗi mục `## 1. Tên địa điểm` (đánh số): 1 ảnh, 3–5 câu trải nghiệm thật, giá/giờ/địa chỉ, và một câu "hợp với ai".
3. `## Cách chúng mình chọn` hoặc `## Lưu ý chung` ở cuối.

Dữ liệu cần điền: mỗi mục trong danh sách là một phần tử `diaDiem[]` (đúng thứ tự xếp hạng) — hệ thống dùng nó để sinh dữ liệu `ItemList` cho Google. Nên có `faq` và link nội bộ tới bài chi tiết của từng nơi nếu đã viết.
