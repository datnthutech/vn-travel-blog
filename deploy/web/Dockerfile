# Container vntraveltips-web: nginx nhỏ, chỉ phục vụ file tĩnh từ volume /data (chỉ đọc).
# Cấu hình nằm trong nginx.conf cạnh file này; build từ thư mục deploy/web.
FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
# Header bảo mật, được nginx.conf include (cấp server và trong location /anh/).
COPY bao-mat.conf /etc/nginx/bao-mat.conf

# Kiểm tra sức khoẻ: endpoint /healthz-web (khai báo trong nginx.conf).
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/healthz-web >/dev/null || exit 1
