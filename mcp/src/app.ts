// Tạo ứng dụng Express. Tách khỏi server.ts để test được mà không phải mở cổng thật.
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Octokit } from '@octokit/rest';
import cookieParser from 'cookie-parser';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { adminApiRouter } from './admin-api';
import { congKhaiRouter } from './cong-khai/binh-luan';
import { banTinCongKhaiRouter } from './cong-khai/ban-tin';
import { dangKyBoLocBanTin } from './ban-tin/gui';
import { trangQuanTriRouter } from './admin-api/tinh';
import { GithubClient } from './github/client';
import type { ToolCtx } from './tools/ctx';
import { taiAnhRouter, type TaiAnhDeps } from './anh/trang-tai';
import { createOAuth, type OAuthDeps } from './auth/oauth';
import type { HangDoiBuild } from './build/hang-doi';
import { chuyenHuongHandler } from './chuyen-huong';
import type { Config } from './config';
import { moDb, type Db } from './db/ket-noi';
import { taoDichVuMail, type DichVuMail } from './mail/dich-vu';
import type { DichVuAi } from './ai/dich-vu';
import { taoMcpServer } from './mcp/server';
import { webhookRouter } from './webhook/github';

export type AppDeps = TaiAnhDeps & OAuthDeps & {
  github?: GithubClient;
  hangDoi?: HangDoiBuild;
  db?: Db;
  mail?: DichVuMail;
  /** Dịch vụ AI (test truyền bản giả; mặc định dùng SDK Anthropic thật khi chủ blog đã nhập API key). */
  dichVuAi?: DichVuAi;
  /** Thư mục bản build giao diện quản trị (mặc định admin/dist cạnh mcp/). */
  adminDist?: string;
  /** Giới hạn tải ảnh của /api/admin/anh (mặc định 25 MB/ảnh, 20 ảnh/lần); test truyền số nhỏ. */
  toiDaAnhByte?: number;
  toiDaAnhFile?: number;
  /** Chờ ms mili giây (làm chậm tài khoản bị dò); test truyền bản giả. */
  cho?: (ms: number) => Promise<void>;
};

// Hàng đợi mặc định KHÔNG build gì: test dựng app không được kích hoạt build thật. server.ts truyền hàng đợi thật.
const hangDoiKhongLam: HangDoiBuild = {
  yeuCau() {},
  trangThai: () => ({ trangThai: 'roi', dangCho: false, lanCuoi: null }),
  doiXong: async () => {},
};

export function createApp(config: Config, deps: AppDeps = {}) {
  const hangDoi = deps.hangDoi ?? hangDoiKhongLam;
  const app = express();
  app.disable('x-powered-by');
  // Đứng sau nginx trên host, qua cổng Docker publish: container thấy nguồn là IP gateway của bridge (172.x, địa chỉ riêng),
  // không phải loopback. Tin cả các dải riêng để X-Forwarded-For (nginx đặt) cho ra IP khách thật cho rate limit.
  app.set('trust proxy', 'loopback, linklocal, uniquelocal');

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true });
  });

  // Webhook đứng trước mọi middleware parse body; chỉ đường dẫn này nhận body thô để kiểm tra chữ ký.
  app.use(webhookRouter(config, hangDoi));
  app.use(taiAnhRouter(config, deps));

  // Trang quản trị: API cần đăng nhập. Body JSON giới hạn 1 MB; cookie phiên đọc bằng cookie-parser.
  const db = deps.db ?? moDb(':memory:');
  const mail = deps.mail ?? taoDichVuMail(db, { khoaBiMat: config.khoaBiMat, now: deps.now });
  dangKyBoLocBanTin(db, mail);
  app.use('/api/admin', express.json({ limit: '1mb' }), cookieParser(), adminApiRouter({ config, db, now: deps.now, cho: deps.cho, mail, dichVuAi: deps.dichVuAi, hangDoi, conDungLuong: deps.conDungLuong, toiDaByte: deps.toiDaAnhByte, toiDaFile: deps.toiDaAnhFile }));

  app.use('/quan-tri', trangQuanTriRouter(deps.adminDist ?? process.env.ADMIN_DIST ?? fileURLToPath(new URL('../../admin/dist', import.meta.url))));

  // API công khai (người đọc): body JSON ≤ 16 KB, không cookie.
  // Form đăng ký bản tin không cần JS nên gửi dạng application/x-www-form-urlencoded (cũng ≤ 16 KB).
  app.use('/api/cong-khai', express.json({ limit: '16kb' }), express.urlencoded({ extended: false, limit: '16kb' }));
  app.use('/api/cong-khai', congKhaiRouter({ config, db, now: deps.now ?? Date.now, mail }), banTinCongKhaiRouter({ config, db, now: deps.now ?? Date.now, mail }));

  const oauth = createOAuth(config, db, { now: deps.now, cho: deps.cho });
  app.use(oauth.router);

  // /mcp: BẮT BUỘC có Bearer token hợp lệ (requireAuth chạy trước mọi thứ khác).
  const host = new URL(config.publicBaseUrl).host;
  const ctx: ToolCtx = {
    config,
    db,
    github: deps.github ?? new GithubClient(new Octokit({ auth: config.githubToken }), config.githubRepo),
    now: deps.now ?? Date.now,
    hangDoi,
  };
  app.post('/mcp', ...oauth.requireAuth, express.json({ limit: '2mb' }), async (req, res) => {
    const server = taoMcpServer(ctx);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
      enableJsonResponse: true,
      enableDnsRebindingProtection: true,
      allowedHosts: [host],
    });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });
  // Stateless: không có luồng SSE riêng hay phiên để xoá.
  const khongHoTro: express.RequestHandler = (_req, res) => {
    res.status(405).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null });
  };
  app.get('/mcp', ...oauth.requireAuth, khongHoTro);
  app.delete('/mcp', ...oauth.requireAuth, khongHoTro);

  // Cuối cùng: mọi đường dẫn còn lại (nginx chuyển sang khi không có file tĩnh) → 301 theo redirects.json hoặc 404.
  app.use(chuyenHuongHandler(config));

  return app;
}
