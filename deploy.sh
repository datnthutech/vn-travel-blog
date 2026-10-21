#!/usr/bin/env bash
# deploy.sh — build image và chạy container của project Compose "vntraveltips" (chạy được cả trên máy local lẫn VPS).
# Chỉ làm 5 việc: kiểm tra Docker → kiểm tra deploy/.env → kiểm tra cổng → docker compose up -d --build → chờ health check.
# KHÔNG SSH, KHÔNG rsync, KHÔNG sửa nginx/certbot trên host, KHÔNG gọi GitHub.
# KHÔNG đụng container, volume, mạng khác: mọi lệnh docker đều chỉ nhắm vào project "vntraveltips".
# Chạy lại nhiều lần không gây hại.
set -euo pipefail

GOC="$(cd "$(dirname "$0")" && pwd)"
DEPLOY_DIR="${DEPLOY_DIR:-$GOC/deploy}"
COMPOSE_FILE="$DEPLOY_DIR/docker-compose.yml"
ENV_FILE="$DEPLOY_DIR/.env"
PROJECT=vntraveltips
# Cổng kiểm tra (mặc định là cổng thật của VNTravelTips; biến CONG_WEB/CONG_MCP chỉ để test).
CONG_WEB="${CONG_WEB:-8090}"
CONG_MCP="${CONG_MCP:-8091}"

# Biến bắt buộc trong deploy/.env (chỉ kiểm tra có mặt, không đọc hay in giá trị).
BIEN_BAT_BUOC="GITHUB_TOKEN GITHUB_REPO ALLOWED_GITHUB_USER PUBLIC_BASE_URL PREVIEW_BASE_URL SESSION_SECRET GITHUB_OAUTH_CLIENT_ID GITHUB_OAUTH_CLIENT_SECRET GITHUB_WEBHOOK_SECRET"

BUOC="khởi động"
trap 'echo "✗ Dừng ở bước: $BUOC" >&2' ERR

fail() {
  echo "✗ $*" >&2
  exit 1
}

# ---------- [1/5] Docker ----------
BUOC="[1/5] Kiểm tra Docker"
echo "$BUOC"
command -v docker >/dev/null 2>&1 || fail "Chưa có lệnh docker. Cài Docker (Docker Desktop trên máy local, Docker Engine trên VPS)."
docker compose version >/dev/null 2>&1 || fail "Docker không có plugin compose (docker compose)."

# ---------- [2/5] .env ----------
BUOC="[2/5] Kiểm tra deploy/.env"
echo "$BUOC"
[ -f "$COMPOSE_FILE" ] || fail "Thiếu file $COMPOSE_FILE."
[ -f "$ENV_FILE" ] || fail "Thiếu file $ENV_FILE. Copy từ deploy/.env.example rồi điền giá trị."
thieu=""
for v in $BIEN_BAT_BUOC; do
  grep -Eq "^${v}=.+" "$ENV_FILE" || thieu="$thieu $v"
done
[ -z "$thieu" ] || fail "Thiếu biến trong deploy/.env:$thieu"

# ---------- [3/5] Cổng ----------
BUOC="[3/5] Kiểm tra cổng $CONG_WEB và $CONG_MCP"
echo "$BUOC"
for cong in "$CONG_WEB" "$CONG_MCP"; do
  # Có tiến trình nghe ở cổng này: chỉ chấp nhận nếu chính container của project vntraveltips đang giữ cổng.
  if (exec 3<>"/dev/tcp/127.0.0.1/$cong") 2>/dev/null; then
    if docker ps --filter "label=com.docker.compose.project=$PROJECT" --format '{{.Ports}}' | grep -q "127.0.0.1:$cong->"; then
      echo "  cổng $cong do project $PROJECT giữ — tiếp tục"
    else
      fail "Cổng $cong đang bị chương trình khác dùng (không thuộc project $PROJECT). Dừng chương trình đó hoặc đổi cổng."
    fi
  fi
done

# ---------- [4/5] Build và chạy ----------
BUOC="[4/5] Build image và chạy container"
echo "$BUOC"
docker compose -p "$PROJECT" -f "$COMPOSE_FILE" up -d --build

# ---------- [5/5] Health check ----------
BUOC="[5/5] Chờ health check (tối đa 180 s)"
echo "$BUOC"
s_web=""
s_mcp=""
for ((i = 0; i < 90; i++)); do
  s_web=$(docker inspect --format '{{.State.Health.Status}}' vntraveltips-web 2>/dev/null || echo "chua-co")
  s_mcp=$(docker inspect --format '{{.State.Health.Status}}' vntraveltips-mcp 2>/dev/null || echo "chua-co")
  if [ "$s_web" = "healthy" ] && [ "$s_mcp" = "healthy" ]; then
    break
  fi
  if [ "$s_web" = "unhealthy" ] || [ "$s_mcp" = "unhealthy" ]; then
    fail "Health check lỗi: web=$s_web, mcp=$s_mcp. Xem log: docker logs vntraveltips-mcp"
  fi
  sleep 2
done
[ "$s_web" = "healthy" ] && [ "$s_mcp" = "healthy" ] || fail "Quá 180 s mà chưa healthy: web=$s_web, mcp=$s_mcp."

echo ""
echo "Xong. Các container đã chạy:"
echo "  Site:       http://localhost:8090"
echo "  Xem trước:  http://nhap.localhost:8090"
echo "  MCP:        http://localhost:8091/healthz"
echo "Lần build site đầu tiên chạy nền trong container mcp (vài phút). Theo dõi: docker logs -f vntraveltips-mcp"
