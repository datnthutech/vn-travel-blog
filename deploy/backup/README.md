# Sao lưu VNTravelTips (ảnh + cơ sở dữ liệu)

Nội dung bài viết nay nằm trong SQLite (`db/vntraveltips.sqlite` trong volume `vntraveltips_data`). Dịch vụ tự sao lưu DB **mỗi giờ** vào `db/sao-luu/` (giữ 48 bản theo giờ + bản đầu mỗi ngày trong 14 ngày). Script này đưa **ảnh** (`anh/`) và **các bản sao lưu DB gần nhất** ra ngoài VPS (đích DB mặc định `gdrive:vntraveltips-db`, đổi bằng `RCLONE_DICH_DB`).

Khôi phục: `docker exec -it vntraveltips-mcp npm run cli -w @vntraveltips/mcp -- khoi-phuc --file /data/db/sao-luu/<file>` (phải gõ `KHOI-PHUC`), rồi `docker compose -p vntraveltips restart vntraveltips-mcp`.


`backup-anh.sh` chạy `rclone copy` **bên trong Docker** (image `rclone/rclone`), không cài rclone trên host:

- Volume gắn **chỉ đọc** (`:ro`), nên script không thể sửa ảnh gốc.
- Chỉ **sao chép thêm** (`copy --ignore-existing`). Không có `sync`, `delete`, `purge`, `move`: nếu thư mục ảnh trên VPS lỡ bị trống, bản sao lưu vẫn còn.
- Bỏ qua file tạm và file bí mật của MCP (`.upload-tmp`, `.tmp-*`, `.oauth-state.json`, `.gan-day.json`).
- Có `flock` để không chạy chồng nhau.

## Cài một lần

1. Trên VPS, tạo cấu hình rclone (thư mục mặc định `~/.config/rclone`):
   ```bash
   mkdir -p ~/.config/rclone
   docker run --rm -it -v ~/.config/rclone:/config/rclone -e RCLONE_CONFIG=/config/rclone/rclone.conf rclone/rclone config
   ```
   Làm theo hướng dẫn của rclone để thêm remote (ví dụ Google Drive, đặt tên `gdrive`). Lệnh này cần tương tác, chạy trực tiếp trên VPS.
2. Thử chạy tay một lần và xem log:
   ```bash
   cd /opt/vntraveltips/deploy/backup   # hoặc thư mục bạn clone repo
   ./backup-anh.sh
   ```
   Nếu muốn đổi remote/thư mục đích: `RCLONE_DICH=gdrive:ten-khac ./backup-anh.sh`.

## Chạy hằng ngày bằng cron

Chủ blog tự cài cron (script không tự cài). Ví dụ chạy 3 giờ sáng mỗi ngày:

```bash
crontab -e
0 3 * * * /opt/vntraveltips/deploy/backup/backup-anh.sh >> /var/log/vntraveltips-backup.log 2>&1
```

Kiểm tra log định kỳ. Nếu cron báo lỗi cấu hình rclone, chạy lại bước cài một lần.
