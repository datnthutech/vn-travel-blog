# VNTravelTips

Nhật ký du lịch của một gia đình nhỏ kèm gợi ý cho các gia đình có con nhỏ.
Mỗi bài đặt **thông tin tiện lợi lên trước** (khối "Tra nhanh"), kể chuyện để sau. Trang tĩnh, nhanh, SEO tốt; Claude đăng bài giúp qua MCP.

- Site: https://vntraveltips.monai.click  ·  Bản xem trước (có nháp): https://nhap-vntraveltips.monai.click
- Tài liệu thiết kế và kế hoạch nằm trong `docs/` trên máy chủ blog — **không** đưa lên repo public (có chi tiết vận hành).

## Mã nguồn nằm ở đâu

| Thư mục | Làm gì |
|---|---|
| `packages/schema/` | "Bộ luật" dữ liệu (zod) dùng chung: bài viết, tỉnh, redirect. Site, MCP và `/admin` đều kiểm tra theo đây. |
| `site/` | Website dựng bằng **Astro**: bài viết trong `site/src/content/`, giao diện trong `site/src/{layouts,components,pages}/`. |
| `mcp/` | Dịch vụ Node (container `vntraveltips-mcp`): MCP cho Claude, đăng nhập OAuth, trang tải ảnh, xử lý ảnh (`sharp`), hàng đợi và quy trình build site, webhook GitHub. |
| `deploy/` | Container web (`deploy/web/`), `docker-compose.yml`, mẫu nginx trên host, mẫu `.env`, hướng dẫn VPS, sao lưu ảnh. |
| `deploy.sh` | Một lệnh để build image và chạy container. Không SSH, không sửa nginx, không gọi GitHub. |

## Chạy trên máy (local)

Cần Docker (Docker Desktop) và Node 22 (`.nvmrc`) nếu muốn chạy test.

```bash
cp deploy/.env.example deploy/.env    # điền GITHUB_TOKEN, OAuth, SESSION_SECRET... (xem bảng ở hướng dẫn VPS)
./deploy.sh                           # build và chạy hai container
```

Sau đó mở:

- Site: http://localhost:8090
- Bản xem trước (có nháp): http://nhap.localhost:8090
- MCP: http://localhost:8091/healthz

Lần đầu, container mcp build site trong nền (vài phút): `docker logs -f vntraveltips-mcp`.

Kiểm thử và build không cần Docker:

```bash
npm install
npm run dev -w site        # mở http://localhost:4321 (có cả bài nháp)
npm test                   # chạy toàn bộ test (schema, site, mcp, deploy)
npm run build -w site      # build thật ra site/dist (BUILD_TARGET=production để loại bài nháp)
```

Ảnh khi chạy local: site đọc kích thước ảnh từ `site/dev-anh/<mã>/meta.json` (ảnh thật nằm trong volume Docker trên VPS).

## Viết bài

**Cách chính — nhờ Claude (claude.ai trên máy tính hoặc app Claude iPhone):**

1. Đưa bản viết cho Claude. Claude gọi `huong_dan_viet_bai`, duyệt và góp ý.
2. Claude gọi `tao_link_tai_anh` → bạn mở link trên điện thoại, **chọn nhiều ảnh cùng lúc** (link dùng một phiên, hết hạn sau 30 phút).
3. Claude xem ảnh (`liet_ke_anh`), viết alt text, dựng bài, `tao_ban_nhap` → trả **link xem trước**.
4. Bạn mở link xem trước trên điện thoại, nói "đăng đi" → Claude `dang_bai`. (Chỉ đăng được khi bản xem trước đã build đúng commit mới nhất.)
5. Cần gỡ khẩn cấp: `go_bai` (đặt lại thành nháp, có hiệu lực trên site chính khi build xong). **`go_bai` không xoá sạch:** bản xem trước (`nhap-vntraveltips…`) vẫn còn bài nháp, ảnh trong volume vẫn truy cập được nếu biết mã ảnh, và nội dung vẫn nằm trong lịch sử GitHub. Nếu gỡ vì lộ thông tin riêng tư, hãy nhờ chủ blog xoá thư mục ảnh tương ứng trong volume và làm sạch nội dung trên GitHub.

**Sửa nhanh bài đã có — `/admin`:** mở https://vntraveltips.monai.click/admin, đăng nhập GitHub (đúng tài khoản được phép). Sửa xong lưu là commit thẳng vào `main`; build chạy lại trong container, kiểm tra luật dữ liệu, lỗi thì site giữ bản cũ. `/admin` **không tạo bài mới** và **không đổi trạng thái đăng** — hai việc đó đi qua Claude. Nút "📷 Tải ảnh" ở góc phải dưới mở trang tải ảnh.

Ảnh trong thân bài viết là `![mô tả ảnh](anh:MÃ_ẢNH)` (mã lấy từ `liet_ke_anh`); alt không được để trống.

## Thêm connector MCP vào Claude

claude.ai → Settings → **Connectors** → Add custom connector → URL `https://vntraveltips.monai.click/mcp` → đăng nhập GitHub. App Claude trên iPhone tự đồng bộ connector. Chi tiết cài đặt phía VPS: [deploy/VPS-HUONG-DAN.md](deploy/VPS-HUONG-DAN.md).

## Webhook GitHub

Khi bạn sửa bài qua `/admin` (commit thẳng vào `main`), container mcp cần biết để build lại. Đăng ký webhook trong repo:

1. Repo → Settings → Webhooks → **Add webhook**.
2. Payload URL: `https://vntraveltips.monai.click/webhook/github`
3. Content type: `application/json`
4. Secret: đúng giá trị `GITHUB_WEBHOOK_SECRET` trong `deploy/.env` trên VPS.
5. Events: chỉ chọn **Just the push event**.

Webhook sai chữ ký hoặc không phải push vào `main` đều bị bỏ qua, không build. Mọi lần ghi qua MCP đã tự báo build, nên webhook chỉ cần cho `/admin`.

## Triển khai và vận hành

- Làm từng bước ở [deploy/VPS-HUONG-DAN.md](deploy/VPS-HUONG-DAN.md): DNS ở nhà đăng ký tên miền, GitHub OAuth App và token, clone repo, `deploy/.env`, `./deploy.sh`, nginx trên host (mẫu `deploy/nginx-host.conf.example`, `nginx -t` trước khi reload), certbot cho hai host. VPS đang chạy dịch vụ khác nên hướng dẫn chỉ **thêm** file riêng và không đụng các cổng cũ.
- Cổng đang dùng: `vntraveltips-web` ở `127.0.0.1:8090`, `vntraveltips-mcp` ở `127.0.0.1:8091`. Không dùng cổng nào khác.
- **Mở cho Google lập chỉ mục** (mặc định site đang chặn bằng `NOINDEX_ALL=true`): trong `deploy/.env` đặt `NOINDEX_ALL=false` rồi chạy lại `./deploy.sh`. Compose thấy `.env` đổi nên tạo lại container mcp, và mỗi lần khởi động mcp tự build lại site với cấu hình mới (site vẫn phục vụ bản cũ trong lúc build; theo dõi `docker logs -f vntraveltips-mcp`). **Đừng** dùng `docker restart` — lệnh đó không đọc lại `.env`. Sau đó gửi `https://vntraveltips.monai.click/sitemap-index.xml` lên Google Search Console.
- **Đếm lượt xem không cookie:** tạo site miễn phí ở goatcounter.com, rồi đặt `GOATCOUNTER_CODE` = tên site trong `deploy/.env` rồi chạy lại `./deploy.sh` (chỉ có script ở bản production). Để trống thì không có script bên thứ ba nào.
- **Bảo mật `/admin` và script bên thứ ba:** khi đăng nhập `/admin`, token GitHub của bạn (quyền `repo`) được Sveltia lưu trong `localStorage` của trang `vntraveltips.monai.click` — cùng origin với mọi bài viết. Nếu bật GoatCounter hoặc AdSense thì script của họ cũng chạy trên origin này và về nguyên tắc đọc được `localStorage`. Vì vậy: chỉ đăng nhập `/admin` khi cần sửa, **đăng xuất (hoặc xoá dữ liệu trang) ngay sau khi dùng**, dùng trình duyệt riêng/ẩn danh nếu có thể; và cân nhắc kỹ trước khi bật AdSense.
- **Redirect khi đổi tỉnh của bài đã đăng:** làm qua Claude (`sua_bai`), nó tự thêm vào `site/redirects.json`. Build sinh redirect đã kiểm tra, và container web chuyển URL cũ sang dịch vụ MCP, nên không cần reload nginx.
- **Affiliate:** link đặt phòng (`linkDat`) và đồ cho bé (`doMangChoBe[].link`) tự có `rel="sponsored nofollow noopener"` và dòng tiết lộ dẫn tới `/chinh-sach-lien-ket/`.
- **Quảng cáo:** tắt mặc định. Bật sau khi có AdSense: sửa [site/src/config/ads.ts](site/src/config/ads.ts) (`enabled`, `client`, `slots`). Mỗi ô giữ sẵn chiều cao; script tải chậm.
- **Sao lưu ảnh** hằng ngày ra Google Drive, chạy rclone trong Docker: [deploy/backup/README.md](deploy/backup/README.md) (bài viết đã được GitHub giữ). Cron do chủ blog tự cài.
- Ảnh tăng ~1,5 GB/năm; trang tải ảnh từ chối khi ổ còn dưới 2 GB.
- **Gỡ ra:** `docker compose -p vntraveltips -f deploy/docker-compose.yml down` — giữ nguyên volume `vntraveltips_data` (ảnh, site). Không thêm `-v` trừ khi muốn xoá hết dữ liệu.

## Khi có sự cố

- Build lỗi (sai luật dữ liệu, thiếu ảnh…): hỏi Claude gọi `xem_trang_thai` để xem log rút gọn, hoặc xem `docker logs vntraveltips-mcp` trên VPS. Site giữ nguyên bản cũ cho tới khi sửa xong.
- Muốn xem MCP đang làm gì: `docker logs vntraveltips-mcp` trên VPS (log không chứa token hay mật khẩu).
- Mất ảnh trên VPS: khôi phục từ bản sao lưu theo [deploy/backup/README.md](deploy/backup/README.md).
