#!/usr/bin/env bash
# Sao lưu thư mục ảnh (anh/ trong volume vntraveltips_data) ra NGOÀI VPS bằng rclone chạy trong Docker.
# Không cần cài rclone trên host. Volume gắn CHỈ ĐỌC (:ro) nên script không thể sửa ảnh gốc.
# Bài viết đã nằm trên GitHub nên chỉ ảnh cần sao lưu. Ảnh không đổi sau khi tạo (mỗi mã ảnh là một thư mục),
# vì vậy chỉ SAO CHÉP THÊM ảnh mới — script cố ý KHÔNG dùng sync/delete: nếu thư mục ảnh lỡ bị trống hay mất,
# bản sao lưu vẫn còn nguyên.
# Cấu hình rclone (remote Google Drive, v.v.) nằm trong RCLONE_CONFIG_DIR — hướng dẫn: deploy/backup/README.md
set -euo pipefail

DICH="${RCLONE_DICH:-gdrive:vntraveltips-anh}"          # đổi bằng biến môi trường nếu remote của bạn tên khác
CAU_HINH="${RCLONE_CONFIG_DIR:-$HOME/.config/rclone}"    # thư mục chứa rclone.conf
KHOA=/tmp/vntraveltips-backup.lock

# Chống chạy chồng nhau (cron chạy trong lúc lần trước chưa xong).
exec 9>"$KHOA"
flock -n 9 || { echo "Đang có bản sao lưu khác chạy, bỏ qua."; exit 0; }

[ -f "$CAU_HINH/rclone.conf" ] || { echo "Thiếu $CAU_HINH/rclone.conf (xem deploy/backup/README.md)." >&2; exit 1; }

# --ignore-existing: ảnh đã có ở đích thì bỏ qua (nhanh, không đọc lại file).
# Loại thư mục/tệp tạm và tệp bí mật của MCP (.oauth-state.json chứa token đã băm, không đưa ra ngoài).
# Giới hạn băng thông và số luồng để không làm nghẽn VPS yếu.
docker run --rm \
  -v vntraveltips_data:/data:ro \
  -v "$CAU_HINH:/config/rclone" \
  -e RCLONE_CONFIG=/config/rclone/rclone.conf \
  rclone/rclone copy /data/anh "$DICH" \
  --ignore-existing \
  --exclude ".upload-tmp/**" \
  --exclude ".tmp-*/**" \
  --exclude ".oauth-state.json*" \
  --exclude ".gan-day.json*" \
  --transfers 2 --checkers 2 --bwlimit 4M \
  --log-level NOTICE

echo "Sao lưu xong: $(date -Is)"
