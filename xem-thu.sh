#!/usr/bin/env bash
# xem-thu.sh — xem thử giao diện site ngay trên máy, với bộ bài mẫu (site/demo/noi-dung) và ảnh mẫu.
# Build site từ CODE ĐANG CÓ TRONG THƯ MỤC NÀY (nhánh hiện tại, kể cả chưa commit) — khác deploy.sh (container build từ GitHub main).
# Không cần Docker, không đụng container/volume của VNTravelTips, không cần deploy/.env.
# Mở được từ điện thoại cùng mạng Wi-Fi để thử co giãn thật trên mobile.
#
# Cách dùng:  ./xem-thu.sh            (cổng mặc định 4321)
#             CONG=5000 ./xem-thu.sh  (đổi cổng)
# Dừng: Ctrl+C. Mọi thứ sinh ra nằm trong .xem-thu/ (gitignore), xoá thư mục đó là sạch.
set -euo pipefail

GOC="$(cd "$(dirname "$0")" && pwd)"
CONG="${CONG:-4321}"
LAM="$GOC/.xem-thu"
WEB="$LAM/web"

fail() { echo "✗ $*" >&2; exit 1; }

command -v node >/dev/null || fail "Chưa có Node.js (cần bản 22 trở lên)."
command -v python3 >/dev/null || fail "Chưa có python3 (dùng để chạy máy chủ xem thử)."
if lsof -nP -iTCP:"$CONG" -sTCP:LISTEN >/dev/null 2>&1; then
  fail "Cổng $CONG đang bận. Chạy với cổng khác: CONG=5000 ./xem-thu.sh"
fi

echo "[1/3] Cài thư viện (nếu chưa có)"
[ -d "$GOC/node_modules" ] || (cd "$GOC" && npm ci)

echo "[2/3] Build bản demo"
"$GOC/site/demo/build.sh" "$LAM"

IP="$(ipconfig getifaddr en0 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || true)"
echo "[3/3] Đang chạy — Ctrl+C để dừng"
echo "  Máy tính:   http://localhost:$CONG/"
[ -n "$IP" ] && echo "  Điện thoại (cùng Wi-Fi): http://$IP:$CONG/"
echo "  Gợi ý: trên Chrome máy tính bấm F12 → biểu tượng điện thoại (Ctrl+Shift+M) để thử 375 px, 768 px, 1280 px."
echo "  Lưu ý: bình luận và form nhận tin cần máy chủ thật nên ở đây chỉ xem giao diện, bấm gửi sẽ không chạy."
cd "$WEB" && exec python3 -m http.server "$CONG" --bind 0.0.0.0
