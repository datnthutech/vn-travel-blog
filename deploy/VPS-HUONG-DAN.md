# Hướng dẫn đưa VNTravelTips lên VPS

Mọi thứ chạy trong Docker. Image được **build ngay trên VPS** bằng `./deploy.sh`. Không dùng GitHub Actions, không có gì SSH hay rsync vào VPS. Bạn tự clone repo, tự tạo `deploy/.env`, tự cấu hình nginx trên host.

**Không đụng các dịch vụ khác trên VPS.** VNTravelTips chỉ dùng `127.0.0.1:8090` (web) và `127.0.0.1:8091` (mcp), mạng Docker `vntraveltips`, project Compose `vntraveltips`, volume `vntraveltips_data`. Trước khi chạy, kiểm tra hai cổng này còn trống (`./deploy.sh` tự kiểm tra và dừng nếu bị chiếm).

## 1. DNS (ở nhà đăng ký tên miền của bạn)

Thêm hai bản ghi A cùng trỏ về IP VPS:

- `vntraveltips.monai.click`
- `nhap-vntraveltips.monai.click`

## 2. GitHub: webhook (và token nếu repo private)

Không còn **OAuth App** của GitHub: trang quản trị `/quan-tri/` và connector Claude/MCP đều đăng nhập bằng **tài khoản của blog** (tạo bằng CLI ở mục 5b, quản trị bắt buộc bật 2FA).

**Token GitHub chỉ cần nếu repo code là PRIVATE** (build trong container dùng nó để lấy code). Repo public → bỏ trống `GITHUB_TOKEN`. Nếu cần: Fine-grained token (Settings → Developer settings → Fine-grained tokens), chỉ repo của blog, **Contents: Read-only**.

**Webhook** (trong repo → Settings → Webhooks → Add webhook): xem [README](../README.md#webhook-github). Đặt URL `https://vntraveltips.monai.click/webhook/github`, content type `application/json`, chỉ sự kiện **push**, và Secret là giá trị `GITHUB_WEBHOOK_SECRET` bạn đặt trong `.env`.

## 3. Clone repo lên VPS

```bash
sudo mkdir -p /opt/vntraveltips && sudo chown "$USER" /opt/vntraveltips
git clone https://github.com/<chu-so-huu>/<ten-repo>.git /opt/vntraveltips
cd /opt/vntraveltips
```

Nếu repo là private, dùng deploy key hoặc SSH key của tài khoản bạn. Không dán token vào địa chỉ `git clone`, vì nó sẽ nằm trong lịch sử shell.

## 4. Tạo `deploy/.env`

```bash
cp deploy/.env.example deploy/.env
chmod 600 deploy/.env
nano deploy/.env
```

File `.env` chứa bí mật. Git đã bỏ qua nó, đừng commit. Điền các biến:

| Biến | Điền gì |
|---|---|
| `PUBLIC_BASE_URL` | `https://vntraveltips.monai.click` |
| `PREVIEW_BASE_URL` | `https://nhap-vntraveltips.monai.click` |
| `GITHUB_REPO` | `tên-tài-khoản/tên-repo` của blog |
| `GITHUB_TOKEN` | **để trống** nếu repo public; chỉ điền token fine-grained (Contents: Read-only, bước 2) khi repo private |
| `SESSION_SECRET` | chạy `openssl rand -hex 32` và dán kết quả |
| `KHOA_BI_MAT` | đúng 64 ký tự hex: chạy `openssl rand -hex 32` và dán kết quả (khoá mã hoá bí mật trong cơ sở dữ liệu; giữ cố định, đổi là mất bí mật đã lưu) |
| `GITHUB_WEBHOOK_SECRET` | chuỗi ngẫu nhiên (`openssl rand -hex 24`), dán cùng giá trị vào ô Secret của webhook |
| `NOINDEX_ALL` | để `true`. Chỉ là giá trị khởi tạo lần đầu (chặn Google); sau đó bật/tắt trong trang quản trị → Cài đặt site |
| `GOATCOUNTER_CODE` | mã GoatCounter (giá trị khởi tạo lần đầu, sau đó đổi trong Cài đặt site). Để trống nếu chưa dùng |

Đổi bất kỳ biến nào ở trên → chạy lại `./deploy.sh` (không dùng `docker restart`, vì restart không đọc lại `.env`). Container mcp khởi động lại sẽ tự build site với giá trị mới.

Đường dẫn ảnh, site và dữ liệu do `docker-compose.yml` cố định, bạn không cần điền.

## 5. Chạy

```bash
./deploy.sh
```

Script chỉ build image và chạy hai container `vntraveltips-web` và `vntraveltips-mcp`, rồi chờ health check. Nếu thiếu biến trong `.env`, script nêu **tên** biến thiếu và dừng, không in giá trị.

Lần chạy đầu, container mcp tự build site trong nền (vài phút). Theo dõi:

```bash
docker logs -f vntraveltips-mcp
```

Kiểm tra:

```bash
curl -s http://127.0.0.1:8091/healthz     # → {"ok":true}
docker stats --no-stream vntraveltips-mcp  # RAM dưới 768 MiB
```

## 5b. Tạo quản trị đầu tiên, sao lưu và khôi phục

```bash
docker exec -it vntraveltips-mcp npm run cli -w @vntraveltips/mcp -- tao-quan-tri --email ban@example.com --ten "Tên bạn"
```

Mật khẩu (≥ 12 ký tự) được hỏi qua bàn phím, không đưa vào tham số. Đăng nhập tại `https://vntraveltips.monai.click/quan-tri/`, bắt buộc bật xác thực 2 lớp. Nội dung nằm trong SQLite (`/data/db`), tự sao lưu mỗi giờ vào `/data/db/sao-luu/`. Khôi phục:

```bash
docker exec -it vntraveltips-mcp npm run cli -w @vntraveltips/mcp -- khoi-phuc --file /data/db/sao-luu/<file>   # gõ KHOI-PHUC
docker compose -p vntraveltips -f deploy/docker-compose.yml restart vntraveltips-mcp
```

## 6. nginx trên host (tự cấu hình)

Mẫu nằm ở `deploy/nginx-host.conf.example`. Mẫu này **chỉ proxy**, không phục vụ file tĩnh. Mẫu có `location /quan-tri/` và `location /api/` trỏ tới cổng 8091 (trang quản trị) — nếu bạn đã có file cũ, hãy thêm hai khối đó rồi `nginx -t`.

```bash
sudo cp deploy/nginx-host.conf.example /etc/nginx/sites-available/vntraveltips
sudo ln -s /etc/nginx/sites-available/vntraveltips /etc/nginx/sites-enabled/vntraveltips
sudo nginx -t                              # phải báo "test is successful"
sudo systemctl reload nginx
sudo certbot --nginx -d vntraveltips.monai.click -d nhap-vntraveltips.monai.click
```

Chỉ chạy `nginx -t` rồi mới `reload`. Không sửa các file site khác đang có trên VPS.

## 7. Thêm connector trên claude.ai (tự đồng bộ sang app Claude iOS)

claude.ai → Settings → **Connectors** → **Add custom connector**, địa chỉ `https://vntraveltips.monai.click/mcp`. Cửa sổ đăng nhập hiện form của blog: nhập **email + mật khẩu của tài khoản quản trị** (rồi mã 2FA). Claude có đúng quyền của tài khoản đó: khoá tài khoản hoặc đổi mật khẩu là cắt kết nối ngay (kết nối lại bằng cách thêm lại connector). Lần đầu sau khi nâng cấp từ bản dùng GitHub: xoá connector cũ rồi thêm lại.

## 8. Cập nhật phiên bản

```bash
cd /opt/vntraveltips
git pull
./deploy.sh
```

Khi `.env` không đổi, chạy lại `deploy.sh` là đủ. Nếu `package-lock.json` đổi, container tự `npm ci` khi build.

## 9. Sao lưu ảnh và cơ sở dữ liệu

Bật cron sao lưu ảnh và bản sao lưu DB ra ngoài VPS theo [deploy/backup/README.md](backup/README.md).

## 10. Gỡ ra

```bash
docker compose -p vntraveltips -f deploy/docker-compose.yml down
```

Lệnh này **không** xoá volume `vntraveltips_data`, nên ảnh và site vẫn còn. Không thêm `-v` trừ khi bạn chủ động muốn xoá hết dữ liệu.

## Sự cố

- Xem log: `docker logs vntraveltips-mcp` (build, webhook, lỗi).
- Hỏi trạng thái build từ Claude: tool `xem_trang_thai`.
- Build lỗi thì site giữ bản cũ, nên site vẫn chạy. Sửa lỗi rồi commit lại để build tiếp.
