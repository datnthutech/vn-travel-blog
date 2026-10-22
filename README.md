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
| `mcp/` | Dịch vụ Node (container `vntraveltips-mcp`): MCP cho Claude (đăng nhập OAuth bằng tài khoản admin, tool dùng chung lớp nội dung với trang quản trị), trang tải ảnh, xử lý ảnh (`sharp`), hàng đợi và quy trình build site, webhook GitHub. |
| `deploy/` | Container web (`deploy/web/`), `docker-compose.yml`, mẫu nginx trên host, mẫu `.env`, hướng dẫn VPS, sao lưu ảnh. |
| `deploy.sh` | Một lệnh để build image và chạy container. Không SSH, không sửa nginx, không gọi GitHub. |

## Chạy trên máy (local)

Cần Docker (Docker Desktop) và Node 22 (`.nvmrc`) nếu muốn chạy test.

```bash
cp deploy/.env.example deploy/.env    # điền SESSION_SECRET, KHOA_BI_MAT... (xem bảng ở hướng dẫn VPS; GITHUB_TOKEN chỉ cần nếu repo private)
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

**Trang quản trị `/quan-tri/` (đang xây theo từng giai đoạn):** đăng nhập bằng tài khoản riêng (email + mật khẩu ≥ 12 ký tự), bắt buộc xác thực 2 lớp với quản trị viên. Tạo quản trị đầu tiên bằng CLI (mật khẩu được hỏi qua stdin, không đưa vào tham số):

```bash
docker exec -it vntraveltips-mcp npm run cli -w @vntraveltips/mcp -- tao-quan-tri --email ban@example.com --ten "Tên bạn"
```

Quên mật khẩu: dùng liên kết "Quên mật khẩu?" ở trang đăng nhập (cần cấu hình mail trong *Cài đặt mail*) hoặc `... -- dat-lai-mat-khau --email ban@example.com`. Nội dung bài nằm trong SQLite; dịch vụ tự sao lưu mỗi giờ (xem `deploy/backup/README.md` để khôi phục).

**`/admin` cũ (Sveltia) đã gỡ:** đường dẫn này nay chuyển 301 sang `/quan-tri/`. Trong lúc chuyển đổi, các tool ghi bài của Claude (`tao_ban_nhap`, `sua_bai`, `dang_bai`, `go_bai`) tạm khoá; giao diện viết bài và nút "Tải ảnh" mới sẽ có ở các giai đoạn sau (trang tải ảnh `/tai-anh/` vẫn dùng được qua `tao_link_tai_anh`).

Ảnh trong thân bài viết là `![mô tả ảnh](anh:MÃ_ẢNH)` (mã lấy từ `liet_ke_anh`); alt không được để trống.

## Viết bài trên trang quản trị

Vào `/quan-tri/` → **Bài viết** → **Viết bài mới** (dùng được trên điện thoại):

1. Điền tiêu đề — bài **tự lưu nháp** sau 3 giây không gõ (hiện "đã tự lưu"); slug tự gợi ý từ tiêu đề (bỏ dấu, `đ` → `d`, tự thêm `-2` nếu trùng).
2. Chọn loại bài, tỉnh, chuyên mục, **ảnh bìa** (chọn từ thư viện hoặc tải ảnh mới — ảnh được nén và xoá GPS), điền khối **Tra nhanh** (nhật ký/review), thân bài (soạn trực quan hoặc "Markdown thô"; ảnh luôn lưu dạng `![mô tả](anh:MÃ)`), địa điểm, đồ cho bé, FAQ.
3. Ô **SEO** đếm độ dài mô tả (120–160 ký tự) và cho xem trước kết quả Google/chia sẻ.
4. **Xem trước**: lưu, dựng bản xem trước rồi mở tab mới (bản xem trước có cả bài nháp, không bị Google lập chỉ mục).
5. **Đăng**: kiểm tra đúng luật dữ liệu + SEO của site; thiếu gì sẽ báo ngay cạnh ô sai. Hoặc **Hẹn giờ** (giờ Việt Nam; hệ thống tự đăng khi tới hạn), **Gỡ**, **Nhân bản**, **Thùng rác** (khôi phục hoặc xoá hẳn).
6. Hai người cùng sửa một bài: người lưu sau nhận thông báo "bài đã được … sửa lúc …" và chọn *Tải bản mới* hoặc *Giữ bản của tôi để chép* — không bao giờ ghi đè im lặng. Mỗi lần lưu tạo một phiên bản; xem, so sánh và khôi phục ở **Lịch sử phiên bản**.
7. Đổi slug hoặc tỉnh của bài đã đăng sẽ tự tạo chuyển hướng 301 từ địa chỉ cũ.

## Cấu trúc site trên trang quản trị

- **Chuyên mục** (`/quan-tri/chuyen-muc`): thêm/sửa/kéo thả thứ tự. Đổi slug làm các bài tự cập nhật và địa chỉ cũ `/chu-de/cu/` tự chuyển hướng 301. Xoá chuyên mục còn bài thì phải chọn chuyên mục nhận bài.
- **Tỉnh** (`/quan-tri/tinh`): đổi slug tỉnh → trang tỉnh và MỌI bài đã đăng của tỉnh tự 301 sang địa chỉ mới; xoá tỉnh có thể chuyển bài sang tỉnh khác hoặc "bỏ tỉnh" (bài thành `/kinh-nghiem/…`). **Tag**: đổi tên/gộp tag, xem tag chỉ còn ở thùng rác.
- **Menu** (`/quan-tri/menu`): menu đầu/chân trang, một cấp con, trỏ tới chuyên mục/tỉnh/trang/bài/link (`https://…` hoặc `/…`); mục trỏ tới thứ chưa đăng tự ẩn trên site.
- **Trang tĩnh** (`/quan-tri/trang`): giới thiệu, chính sách liên kết, liên hệ (cố định, giữ URL cũ) và trang tự tạo ở `/trang/<slug>/`. Slug không được trùng đường dẫn hệ thống, trang khác hay tỉnh.
- **Cài đặt site** (`/quan-tri/cai-dat`): tên, mô tả, logo/favicon/ảnh chia sẻ, mạng xã hội, **cho phép Google lập chỉ mục**, mã GoatCounter, quảng cáo. `NOINDEX_ALL` và `GOATCOUNTER_CODE` trong `deploy/.env` giờ chỉ là **giá trị khởi tạo lần đầu**; sau đó đổi bằng nút trong trang này (không cần sửa `.env` hay chạy lại `./deploy.sh`).
- **Chuyển hướng** (`/quan-tri/redirect`) xem/thêm/xoá 301; **Tổng quan** báo số bài, build, sao lưu (trong và ngoài VPS — quá 26 giờ chưa ra ngoài VPS thì cảnh báo và gửi mail cho quản trị), ổ đĩa, mail.

## Tài khoản và quyền

Ba vai trò, áp lên **mọi** API quản trị (server kiểm tra; giao diện chỉ ẩn/hiện nút):

| | Quản trị | Quản lý | Người viết (writer) |
|---|---|---|---|
| Tạo bài, xem bài, kiểm tra, tải ảnh | ✓ | ✓ | ✓ |
| Sửa / đăng / gỡ / thùng rác bài | mọi bài | mọi bài | **chỉ bài của mình** |
| Xoá hẳn bài | ✓ | — | — |
| Xoá ảnh | ✓ | ✓ | chỉ ảnh mình tải lên |
| Chuyên mục, tỉnh, tag, menu, trang tĩnh, chuyển hướng, tổng quan | ✓ | ✓ | — |
| Cài đặt site, mail, tài khoản, nhật ký | ✓ | — | — |

- Writer **tự đăng** bài của mình (không qua duyệt). Luôn còn ít nhất **một quản trị đang hoạt động** (không tự hạ/khoá được quản trị cuối cùng).
- **Mời người dùng:** `/quan-tri/tai-khoan` → nhập email + vai trò → người được mời nhận mail (cần cấu hình mail), mở liên kết (hiệu lực 48 giờ, dùng một lần), tự đặt tên và mật khẩu ≥ 12 ký tự. Tối đa 5 lời mời/giờ. Quản trị mới bắt buộc bật xác thực 2 lớp ngay.
- Khoá tài khoản = đăng xuất họ ngay mọi thiết bị (không xoá cứng, để giữ tác giả bài). Mất điện thoại: quản trị khác bấm **Đặt lại 2FA**.
- **Nhật ký** (`/quan-tri/nhat-ky`): đăng nhập, đổi vai trò, khoá/mở khoá, mời, đặt lại 2FA, đăng/xoá bài… (chỉ quản trị xem).

## Bình luận

Người đọc bình luận bằng **tên + email** (email không bao giờ hiển thị), bình luận **hiện ngay**. Bật ở `/quan-tri/cai-dat` → "Cho phép người đọc bình luận" (mặc định tắt). Trang bài vẫn là HTML tĩnh: một script nhỏ (< 5 KB) chỉ nạp bình luận khi khung còn cách màn hình 600 px, không làm trang chậm hay nhảy bố cục; bản xem trước (`nhap-…`) không có form.

- **Chống spam tự động:** tối đa 3 bình luận/10 phút/IP (IP chỉ lưu dạng băm), ô bẫy ẩn, thời gian gửi tối thiểu 3 giây, bình luận có hơn 2 liên kết hoặc chứa **từ cấm** (đặt trong Cài đặt site; không phân biệt hoa/thường/dấu) vào hàng **chờ xem**. Nội dung hiển thị bằng chữ thuần, không chạy được HTML/script.
- **Kiểm duyệt** (`/quan-tri/binh-luan`): ẩn/hiện, xoá (kèm trả lời), trả lời một cấp với nhãn "Tác giả", chặn email/IP. Quản trị/quản lý làm với mọi bài; người viết chỉ với bài của mình.
- **Báo mail:** tác giả bài nhận mail khi có bình luận mới (kể cả chờ xem); tắt trong "Của tôi".

## Newsletter

Người đọc đăng ký nhận tin bằng form ở chân mọi trang và cuối mỗi bài (form chạy cả khi tắt JavaScript; bản xem trước không có form). **Xác nhận 2 bước:** đăng ký → mail có liên kết (hiệu lực 7 ngày) → bấm mới tính là đã xác nhận. Một người bấm đăng ký nhiều lần chỉ có 1 dòng và tối đa 1 mail xác nhận mỗi 10 phút; tối đa 5 lần đăng ký/giờ/IP. Mọi mail có liên kết huỷ và header `List-Unsubscribe` (Gmail hiện nút "Huỷ đăng ký"). Danh sách email không bao giờ ra API công khai.

- **Gửi bản tin** (`/quan-tri/ban-tin`, chỉ Quản trị): soạn bản tin hoặc bấm "Gửi thông báo bài này" ở danh sách bài, **Gửi thử cho tôi**, rồi **Gửi** — luôn bằng tay (đăng bài không tự gửi). Chỉ gửi người đã xác nhận cùng ngôn ngữ. Mail đi qua service mail chung: hạn mức Gmail/Brevo theo ngày (giờ Việt Nam), tự chuyển nhà cung cấp, phần chưa gửi hết sẽ tự gửi tiếp sau 0 giờ; không ai nhận trùng; người huỷ giữa chừng bị bỏ khỏi đợt gửi.
- **Người đăng ký** (`/quan-tri/nguoi-dang-ky`): lọc, tìm, xoá, tải CSV (chỉ Quản trị).
- **Gmail:** dùng "Mật khẩu ứng dụng" (không dùng mật khẩu Gmail): bật xác minh 2 bước cho tài khoản Google → vào myaccount.google.com/apppasswords → tạo mật khẩu cho "Mail" → dán vào "Cài đặt mail" (SMTP `smtp.gmail.com`, cổng 465, SSL). Gmail miễn phí gửi tối đa khoảng 500 mail/ngày.

## Đa ngôn ngữ

Tiếng Việt là ngôn ngữ gốc (địa chỉ không đổi). Quản trị thêm ngôn ngữ ở `/quan-tri/ngon-ngu` (mã như `en`, `zh-cn`; **không được trùng slug tỉnh/trang** vì ngôn ngữ chiếm đường dẫn `/en/…`). Mỗi bài có tab theo ngôn ngữ: bản gốc nằm cạnh bản dịch, dịch xong bấm **Review toàn màn hình** rồi **Đăng bản dịch** (cần bản tiếng Việt đã đăng; bản vi bị gỡ/vào thùng rác thì mọi bản dịch của nó cũng biến khỏi site).

- **URL:** bài `/<mã>/<tỉnh>/<slug-dịch>/` hoặc `/<mã>/kinh-nghiem/<slug-dịch>/`; hub tỉnh `/<mã>/<tỉnh>/`, chuyên mục `/<mã>/chu-de/<chuyên-mục>/`, trang tĩnh `/<mã>/<slug-trang-dịch>/`, RSS `/<mã>/rss.xml`. Slug tỉnh/chuyên mục giữ nguyên giữa các ngôn ngữ (chỉ tên/mô tả được dịch). Trang chủ `/<mã>/` chỉ có khi ngôn ngữ có ít nhất một bài đã đăng.
- **SEO:** `<html lang>`, `hreflang` + `x-default` (chỉ khi bài có ≥ 2 bản đã đăng), canonical theo ngôn ngữ, sitemap gồm mọi ngôn ngữ; nút chuyển ngôn ngữ chỉ liệt kê bản dịch của chính trang đó.
- **"Cũ hơn bản gốc":** khi sửa phần CHỮ của bản tiếng Việt, bản dịch hiện nhãn này (sửa giá số, toạ độ, ảnh… thì không). **"Đã kiểm tra":** ai cũng đánh dấu được, lưu lại bản dịch thì dấu bị xoá.
- **Bản dịch cấu trúc:** `/quan-tri/dich-cau-truc` (chuyên mục, tỉnh, trang, nhãn menu, tên site) và `/quan-tri/chuoi-giao-dien` (chữ trên giao diện, cả form đăng ký tin/bình luận và mail xác nhận). Chuỗi chưa dịch tự dùng tiếng Việt; Tổng quan hiện số chuỗi còn thiếu.
- **Newsletter & bình luận:** người đăng ký ghi nhận ngôn ngữ của trang họ đăng ký, bản tin chỉ gửi người cùng ngôn ngữ; bình luận thuộc ngôn ngữ của trang nên không lẫn giữa các ngôn ngữ.

### Cài API key AI (Dịch bằng AI)

`/quan-tri/cai-dat-ai` (quản trị): dán API key Anthropic (lấy ở console.anthropic.com → API keys), chọn model (mặc định `claude-opus-5-5`), bấm **Thử kết nối**. Key được mã hoá trong cơ sở dữ liệu, chỉ ghi không đọc lại. Nút **Dịch bằng AI** chỉ *điền* bản dịch vào form kèm cảnh báo (mất ảnh/link, lệch số phần tử…) — không tự lưu, không tự đăng; AI lỗi chỉ làm nút đó báo lỗi. Dịch tốn phí theo tài khoản Anthropic của bạn.

## Claude/MCP (đường phụ)

Claude không còn là đường chính để viết bài (trang quản trị `/quan-tri/` mới là chính), nhưng vẫn dùng được như một "người dùng" nữa: các tool đọc/ghi bài chạy trên **cùng lớp nội dung (SQLite)** và **theo quyền của tài khoản đăng nhập** (người viết chỉ đụng bài của mình, y như API admin).

- **Thêm connector:** claude.ai → Settings → **Connectors** → Add custom connector → URL `https://vntraveltips.monai.click/mcp` → cửa sổ đăng nhập của blog: email + mật khẩu tài khoản quản trị (+ mã 2FA; quản trị chưa bật 2FA thì chưa kết nối được). App Claude trên iPhone tự đồng bộ connector. Khoá tài khoản hoặc đổi mật khẩu → Claude bị cắt ngay.
- **Tool:** `huong_dan_viet_bai`, `tao_link_tai_anh`, `liet_ke_anh`, `kiem_tra_bai`, `liet_ke_bai`, `doc_bai`, `tao_ban_nhap`, `sua_bai`, `xem_trang_thai`, `dang_bai`, `go_bai` (nhận `id` hoặc `slug`), và `dich_ai_ban_dich` (chỉ khi đã nhập API key AI; trả bản dịch để xem, không lưu). Bài Claude tạo là nháp của chính tài khoản đó, hiện trong `/quan-tri/bai`.
- **Cổng đăng bài:** `dang_bai` chỉ chạy khi bản xem trước đã build tới đúng bản mới nhất của bài (chủ blog đã có thể xem đúng thứ sắp đăng) và bài đạt đủ luật kiểm tra.
- **Lỗi Claude/MCP không ảnh hưởng trang quản trị** (admin không gọi MCP). Chi tiết cài đặt phía VPS: [deploy/VPS-HUONG-DAN.md](deploy/VPS-HUONG-DAN.md).

## Webhook GitHub

Khi bạn đẩy code site lên `main` trên GitHub, container mcp cần biết để build lại. Đăng ký webhook trong repo:

1. Repo → Settings → Webhooks → **Add webhook**.
2. Payload URL: `https://vntraveltips.monai.click/webhook/github`
3. Content type: `application/json`
4. Secret: đúng giá trị `GITHUB_WEBHOOK_SECRET` trong `deploy/.env` trên VPS.
5. Events: chỉ chọn **Just the push event**.

Webhook sai chữ ký hoặc không phải push vào `main` đều bị bỏ qua, không build. Mọi lần ghi qua MCP đã tự báo build, nên webhook chỉ cần khi bạn đẩy code site.

## Triển khai và vận hành

- Làm từng bước ở [deploy/VPS-HUONG-DAN.md](deploy/VPS-HUONG-DAN.md): DNS ở nhà đăng ký tên miền, webhook GitHub (token chỉ nếu repo private), clone repo, `deploy/.env`, `./deploy.sh`, nginx trên host (mẫu `deploy/nginx-host.conf.example`, `nginx -t` trước khi reload), certbot cho hai host. VPS đang chạy dịch vụ khác nên hướng dẫn chỉ **thêm** file riêng và không đụng các cổng cũ.
- Cổng đang dùng: `vntraveltips-web` ở `127.0.0.1:8090`, `vntraveltips-mcp` ở `127.0.0.1:8091`. Không dùng cổng nào khác.
- **Mở cho Google lập chỉ mục** (mặc định site đang chặn): vào `/quan-tri/cai-dat` và bật "Cho phép Google lập chỉ mục" — site tự build lại sau vài phút (`NOINDEX_ALL` trong `deploy/.env` chỉ là giá trị khởi tạo lần đầu, đổi nó sau đó không còn tác dụng). Sau đó gửi `https://vntraveltips.monai.click/sitemap-index.xml` lên Google Search Console.
- **Đếm lượt xem không cookie:** tạo site miễn phí ở goatcounter.com, rồi điền tên site vào ô "Mã GoatCounter" ở `/quan-tri/cai-dat` (chỉ có script ở bản production; `GOATCOUNTER_CODE` trong `.env` chỉ là giá trị khởi tạo lần đầu). Để trống thì không có script bên thứ ba nào.
- **Bảo mật trang quản trị và script bên thứ ba:** phiên đăng nhập `/quan-tri/` dùng cookie `HttpOnly` (không để trong `localStorage`) nên script GoatCounter/AdSense không đọc được; vẫn nên đăng xuất khi dùng máy lạ. Quản trị bắt buộc bật 2FA; sai mật khẩu 5 lần thì IP bị chặn 15 phút (tăng dần).
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
