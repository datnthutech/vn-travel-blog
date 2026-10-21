# Hướng dẫn đưa VNTravelTips lên VPS

Mọi thứ chạy trong Docker. Image được **build ngay trên VPS** bằng `./deploy.sh`. Không dùng GitHub Actions, không có gì SSH hay rsync vào VPS. Bạn tự clone repo, tự tạo `deploy/.env`, tự cấu hình nginx trên host.

**Không đụng các dịch vụ khác trên VPS.** VNTravelTips chỉ dùng `127.0.0.1:8090` (web) và `127.0.0.1:8091` (mcp), mạng Docker `vntraveltips`, project Compose `vntraveltips`, volume `vntraveltips_data`. Trước khi chạy, kiểm tra hai cổng này còn trống (`./deploy.sh` tự kiểm tra và dừng nếu bị chiếm).

## 1. DNS (ở nhà đăng ký tên miền của bạn)

Thêm hai bản ghi A cùng trỏ về IP VPS:

- `vntraveltips.monai.click`
- `nhap-vntraveltips.monai.click`

## 2. GitHub: OAuth App, token, webhook

**OAuth App** (Settings → Developer settings → OAuth Apps → New OAuth App):
- Homepage URL: `https://vntraveltips.monai.click`
- Authorization callback URL: `https://vntraveltips.monai.click/oauth/`
  (OAuth App chỉ cho một callback, nhưng GitHub chấp nhận mọi đường dẫn con của nó — nên một URL này dùng được cho cả đăng nhập MCP `/oauth/github/callback` lẫn `/admin` `/oauth/cms/callback`.)
- Sau khi tạo, lấy **Client ID** và tạo **Client secret**. Lấy cả hai ở bước 4.

**Fine-grained token** (Settings → Developer settings → Fine-grained tokens):
- Repository access: chỉ repo của blog.
- Repository permissions: **Contents: Read and write**. Không cần quyền nào khác.

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
| `GITHUB_TOKEN` | token fine-grained ở bước 2 |
| `ALLOWED_GITHUB_USER` | tên tài khoản GitHub của bạn, chỉ tài khoản này được đăng nhập |
| `GITHUB_OAUTH_CLIENT_ID` | Client ID ở bước 2 |
| `GITHUB_OAUTH_CLIENT_SECRET` | Client secret ở bước 2 |
| `SESSION_SECRET` | chạy `openssl rand -hex 32` và dán kết quả |
| `KHOA_BI_MAT` | đúng 64 ký tự hex: chạy `openssl rand -hex 32` và dán kết quả (khoá mã hoá bí mật trong cơ sở dữ liệu; giữ cố định, đổi là mất bí mật đã lưu) |
| `GITHUB_WEBHOOK_SECRET` | chuỗi ngẫu nhiên (`openssl rand -hex 24`), dán cùng giá trị vào ô Secret của webhook |
| `NOINDEX_ALL` | để `true`. Chặn Google cho tới khi sẵn sàng |
| `GOATCOUNTER_CODE` | mã GoatCounter. Để trống nếu chưa dùng |

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

## 6. nginx trên host (tự cấu hình)

Mẫu nằm ở `deploy/nginx-host.conf.example`. Mẫu này **chỉ proxy**, không phục vụ file tĩnh.

```bash
sudo cp deploy/nginx-host.conf.example /etc/nginx/sites-available/vntraveltips
sudo ln -s /etc/nginx/sites-available/vntraveltips /etc/nginx/sites-enabled/vntraveltips
sudo nginx -t                              # phải báo "test is successful"
sudo systemctl reload nginx
sudo certbot --nginx -d vntraveltips.monai.click -d nhap-vntraveltips.monai.click
```

Chỉ chạy `nginx -t` rồi mới `reload`. Không sửa các file site khác đang có trên VPS.

## 7. Thêm connector trên claude.ai (tự đồng bộ sang app Claude iOS)

claude.ai → Settings → **Connectors** → **Add custom connector**, địa chỉ `https://vntraveltips.monai.click/mcp`. Đăng nhập bằng GitHub với tài khoản đã đặt trong `ALLOWED_GITHUB_USER`.

## 8. Cập nhật phiên bản

```bash
cd /opt/vntraveltips
git pull
./deploy.sh
```

Khi `.env` không đổi, chạy lại `deploy.sh` là đủ. Nếu `package-lock.json` đổi, container tự `npm ci` khi build.

## 9. Sao lưu ảnh

Bật cron sao lưu ảnh ra ngoài VPS theo [deploy/backup/README.md](backup/README.md).

## 10. Gỡ ra

```bash
docker compose -p vntraveltips -f deploy/docker-compose.yml down
```

Lệnh này **không** xoá volume `vntraveltips_data`, nên ảnh và site vẫn còn. Không thêm `-v` trừ khi bạn chủ động muốn xoá hết dữ liệu.

## Sự cố

- Xem log: `docker logs vntraveltips-mcp` (build, webhook, lỗi).
- Hỏi trạng thái build từ Claude: tool `xem_trang_thai`.
- Build lỗi thì site giữ bản cũ, nên site vẫn chạy. Sửa lỗi rồi commit lại để build tiếp.
