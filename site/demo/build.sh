#!/usr/bin/env bash
# build.sh — build bản demo (bài mẫu + ảnh mẫu) ra <thuMucLam>/web. Dùng chung cho xem-thu.sh (xem trên máy)
# và .github/workflows/demo.yml (GitHub Pages). Không cần Docker, deploy/.env hay máy chủ.
# Cách dùng: site/demo/build.sh <thuMucLam> [goc]
#   goc: thư mục con site sẽ nằm khi đăng (vd /vn-travel-blog/ trên GitHub Pages); mặc định / (gốc tên miền).
set -euo pipefail

GOC="$(cd "$(dirname "$0")/../.." && pwd)"
LAM="$1"
GOC_URL="${2:-/}"
ND="$LAM/noi-dung"
ANH="$LAM/anh"
WEB="$LAM/web"
mkdir -p "$LAM"

echo "  (1) Chuẩn bị nội dung mẫu và ảnh mẫu"
rm -rf "$ND" && mkdir -p "$ND"
cp -R "$GOC/site/demo/noi-dung/." "$ND/"
cp -R "$GOC/site/src/content/trang" "$ND/trang"   # trang Giới thiệu / Liên hệ / Chính sách
mkdir -p "$ND/trang-dich"
node "$GOC/site/demo/tao-anh.mjs" "$ND" "$ANH"

echo "  (2) Build site (bản production, không quảng cáo/đếm lượt xem, chặn Google lập chỉ mục)"
rm -rf "$WEB"
(cd "$GOC/site" && BUILD_TARGET=production NOINDEX_ALL=true NOI_DUNG_DIR="$ND" ANH_META_DIR="$ANH" npx astro build --outDir "$WEB" >"$LAM/build.log" 2>&1) \
  || { tail -30 "$LAM/build.log"; echo "✗ Build lỗi — xem đầy đủ ở $LAM/build.log" >&2; exit 1; }
cp -R "$ANH" "$WEB/anh"
[ "$GOC_URL" = "/" ] || node "$GOC/site/demo/doi-goc.mjs" "$WEB" "$GOC_URL"
(cd "$GOC/site" && npx pagefind --site "$WEB" >/dev/null)
echo "  (3) Xong: $WEB"
