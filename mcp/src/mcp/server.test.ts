import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../config';
import { moDb } from '../db/ket-noi';
import type { ToolCtx } from '../tools/ctx';
import { taoMcpServer } from './server';

const config = loadConfig({
  GITHUB_TOKEN: 't', GITHUB_REPO: 'a/b',
  PUBLIC_BASE_URL: 'https://vntraveltips.monai.click', PREVIEW_BASE_URL: 'https://nhap-vntraveltips.monai.click',
  ANH_DIR: '/khong/co', SESSION_SECRET: 'x'.repeat(32), GITHUB_WEBHOOK_SECRET: 'whsec', KHOA_BI_MAT: 'a'.repeat(64),
});
const hangDoi = { yeuCau() {}, trangThai: () => ({ trangThai: 'roi' as const, dangCho: false, lanCuoi: null }), doiXong: async () => {} };
const ctx: ToolCtx = { config, db: moDb(':memory:'), nguoiDung: { id: 1, email: 'a@x.vn', ten: 'A', vaiTro: 'quan-tri', biKhoa: false, coTotp: true }, now: Date.now, hangDoi };

async function ketNoi() {
  const server = taoMcpServer(ctx);
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '1' });
  await Promise.all([server.connect(a), client.connect(b)]);
  return client;
}

describe('MCP server', () => {
  it('liệt kê đủ 11 tool (tên giữ nguyên như thiết kế mục 10 để connector hiện có không phải đổi)', async () => {
    const { tools } = await (await ketNoi()).listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(
      [
        'huong_dan_viet_bai', 'tao_link_tai_anh', 'liet_ke_anh', 'kiem_tra_bai', 'tao_ban_nhap', 'sua_bai',
        'xem_trang_thai', 'dang_bai', 'liet_ke_bai', 'doc_bai', 'go_bai',
      ].sort(),
    );
    for (const t of tools) expect(t.description, t.name).toBeTruthy();
  });

  it('mô tả go_bai nói thật về giới hạn: bản xem trước và ảnh vẫn còn', async () => {
    const { tools } = await (await ketNoi()).listTools();
    const mota = tools.find((t) => t.name === 'go_bai')!.description!;
    expect(mota).toMatch(/xem trước/);
    expect(mota).toMatch(/ảnh/);
  });

  it('huong_dan_viet_bai trả mẫu theo loại', async () => {
    const r: any = await (await ketNoi()).callTool({ name: 'huong_dan_viet_bai', arguments: { loai: 'review' } });
    expect(r.isError).toBeFalsy();
    expect(r.content[0].text).toMatch(/Review/);
  });

  it('tool ném lỗi → isError với thông báo tiếng Việt (không văng stack)', async () => {
    const r: any = await (await ketNoi()).callTool({ name: 'doc_bai', arguments: { slug: 'khong-co' } });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/Không có bài/);
  });

  it('loại bài sai bị schema đầu vào chặn', async () => {
    const r: any = await (await ketNoi()).callTool({ name: 'huong_dan_viet_bai', arguments: { loai: 'linh-tinh' } }).catch((e) => ({ isError: true, content: [{ text: String(e) }] }));
    expect(r.isError).toBe(true);
  });

  it('liet_ke_anh trả về khối ảnh kèm văn bản (khi có ảnh)', async () => {
    const r: any = await (await ketNoi()).callTool({ name: 'liet_ke_anh', arguments: {} });
    expect(r.isError).toBeFalsy();
    expect(r.content[0].type).toBe('text');
  });

  it('4 tool ghi đã mở lại (không còn thông báo tạm ngừng): lỗi nội dung/đối tượng trả isError nói đúng nguyên nhân', async () => {
    const client = await ketNoi();
    const tao: any = await client.callTool({ name: 'tao_ban_nhap', arguments: { bai: {}, noiDung: 'x' } });
    expect(tao.isError).toBe(true);
    expect(tao.content[0].text).toMatch(/chưa đạt kiểm tra/);
    for (const name of ['sua_bai', 'dang_bai', 'go_bai']) {
      const r: any = await client.callTool({ name, arguments: { slug: 'khong-co' } });
      expect(r.isError, name).toBe(true);
      expect(r.content[0].text, name).toMatch(/Không có bài/);
      expect(r.content[0].text, name).not.toMatch(/Tạm ngừng/);
    }
  });

  it('tool dich_ai_ban_dich chỉ xuất hiện khi chủ blog đã nhập API key AI', async () => {
    const { luuBiMat } = await import('../bi-mat');
    expect((await (await ketNoi()).listTools()).tools.map((t) => t.name)).not.toContain('dich_ai_ban_dich');
    luuBiMat(ctx.db, config.khoaBiMat, 'ai.apiKey', 'khoa-gia-lap-12345678');
    expect((await (await ketNoi()).listTools()).tools.map((t) => t.name)).toContain('dich_ai_ban_dich');
  });
});
