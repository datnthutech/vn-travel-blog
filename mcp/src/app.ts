// Tạo ứng dụng Express. Tách khỏi server.ts để test được mà không phải mở cổng thật.
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Octokit } from '@octokit/rest';
import express from 'express';
import { GithubClient } from './github/client';
import type { ToolCtx } from './tools/ctx';
import { taiAnhRouter, type TaiAnhDeps } from './anh/trang-tai';
import { cmsOauthRouter } from './auth/cms-oauth';
import { createOAuth, type OAuthDeps } from './auth/oauth';
import type { HangDoiBuild } from './build/hang-doi';
import { chuyenHuongHandler } from './chuyen-huong';
import type { Config } from './config';
import { taoMcpServer } from './mcp/server';
import { webhookRouter } from './webhook/github';

export type AppDeps = TaiAnhDeps & OAuthDeps & { github?: GithubClient; hangDoi?: HangDoiBuild };

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

  const oauth = createOAuth(config, deps);
  app.use(oauth.router);
  app.use(cmsOauthRouter(config, deps));

  // /mcp: BẮT BUỘC có Bearer token hợp lệ (requireAuth chạy trước mọi thứ khác).
  const host = new URL(config.publicBaseUrl).host;
  const ctx: ToolCtx = {
    config,
    github: deps.github ?? new GithubClient(new Octokit({ auth: config.githubToken }), config.githubRepo),
    now: deps.now ?? Date.now,
    hangDoi,
  };
  app.post('/mcp', oauth.requireAuth, express.json({ limit: '2mb' }), async (req, res) => {
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
  app.get('/mcp', oauth.requireAuth, khongHoTro);
  app.delete('/mcp', oauth.requireAuth, khongHoTro);

  // Cuối cùng: mọi đường dẫn còn lại (nginx chuyển sang khi không có file tĩnh) → 301 theo redirects.json hoặc 404.
  app.use(chuyenHuongHandler(config));

  return app;
}
