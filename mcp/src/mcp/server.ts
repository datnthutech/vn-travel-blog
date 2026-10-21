// Máy chủ MCP: khai báo các tool Claude được gọi. Mỗi request /mcp tạo một McpServer mới (chế độ stateless,
// phù hợp một người dùng duy nhất và dễ chạy sau nginx).
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolCtx } from '../tools/ctx';
import { dangKyToolDoc, dangKyToolGhi } from '../tools';

export function taoMcpServer(ctx: ToolCtx): McpServer {
  const server = new McpServer({ name: 'vntraveltips', version: '0.1.0' });
  dangKyToolDoc(server, ctx);
  dangKyToolGhi(server, ctx);
  return server;
}
