# Image cho vntraveltips-mcp. Build từ THƯ MỤC GỐC repo (vì dùng chung packages/schema).
# Build TRÊN VPS bằng ./deploy.sh (docker compose build), không cần registry hay GitHub Actions.
# Image chỉ chứa mã MCP; mã site được clone vào volume /data lúc chạy và build tại đó.
# Stage deps: có toolchain (python3 make g++) để better-sqlite3 tự biên dịch khi không có bản dựng sẵn cho kiến trúc máy.
# Toolchain chỉ nằm ở stage này, image cuối không mang theo.
FROM node:22-slim AS deps
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY packages/schema/package.json packages/schema/
COPY mcp/package.json mcp/
COPY site/package.json site/
COPY admin/package.json admin/
RUN npm ci --omit=dev -w @vntraveltips/mcp -w @vntraveltips/schema --include-workspace-root=false

# Stage admin-build: build giao diện quản trị (Svelte + Vite) thành file tĩnh admin/dist. Cần cả devDependencies nên
# không đặt NODE_ENV=production ở stage này; image cuối chỉ nhận thư mục dist, không mang Vite/Svelte.
FROM node:22-slim AS admin-build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/schema/package.json packages/schema/
COPY mcp/package.json mcp/
COPY site/package.json site/
COPY admin/package.json admin/
RUN npm ci -w @vntraveltips/admin --include-workspace-root=false
COPY tsconfig.base.json ./
COPY packages/schema/src packages/schema/src
COPY admin/index.html admin/vite.config.ts admin/svelte.config.js admin/tsconfig.json admin/
COPY admin/src admin/src
RUN npm run build -w @vntraveltips/admin

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production

# git: clone/pull repo vào volume để build site. ca-certificates: gọi HTTPS tới GitHub.
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY packages/schema/package.json packages/schema/
COPY mcp/package.json mcp/
COPY site/package.json site/
COPY admin/package.json admin/
COPY --from=deps /app/node_modules node_modules

COPY packages/schema/src packages/schema/src
COPY mcp/src mcp/src
COPY --from=admin-build /app/admin/dist admin/dist

# Thư mục dữ liệu chung (volume vntraveltips_data mount tại /data). Volume mới thừa hưởng chủ sở hữu của
# thư mục này trong image, nên user node (uid 1000) ghi được repo/, builds/, anh/.
RUN mkdir -p /data && chown node:node /data

# Chạy bằng user không phải root (uid 1000).
USER node
EXPOSE 8091
CMD ["npm", "start", "-w", "@vntraveltips/mcp"]
