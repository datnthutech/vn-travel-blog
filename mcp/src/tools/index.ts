// Đăng ký các tool với MCP server: mô tả (để Claude biết khi nào dùng), schema đầu vào, và bọc lỗi.
// Logic thật nằm ở doc.ts / ghi.ts; file này chỉ là lớp "đấu nối" mỏng.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { CAC_LOAI, huongDanVietBai } from '../huong-dan';
import type { ToolCtx } from './ctx';
import { docBai, kiemTraBaiTool, lietKeAnh, lietKeBai, taoLinkTaiAnh } from './doc';
import { dangBai, goBai, suaBai, taoBanNhap, xemTrangThai } from './ghi';

// Dùng đúng kiểu kết quả của MCP SDK để tool đăng ký khớp kiểu (trước đây tự khai báo nên lệch với SDK).
export type KetQuaTool = CallToolResult;
export type NoiDungTool = CallToolResult['content'];

const van = (text: string): KetQuaTool => ({ content: [{ type: 'text', text }] });
const json = (v: unknown): KetQuaTool => van(JSON.stringify(v, null, 2));

// Lỗi của tool → trả isError với thông báo tiếng Việt để Claude đọc được và xử lý, không văng stack trace.
const baoLoi = (e: unknown): KetQuaTool => ({
  isError: true,
  content: [{ type: 'text', text: e instanceof Error ? e.message : 'Có lỗi không xác định.' }],
});

const boc = <A>(fn: (a: A) => Promise<KetQuaTool> | KetQuaTool) => async (a: A): Promise<KetQuaTool> => {
  try {
    return await fn(a);
  } catch (e) {
    return baoLoi(e);
  }
};

export function dangKyToolGhi(server: McpServer, ctx: ToolCtx): void {
  server.registerTool(
    'tao_ban_nhap',
    {
      description:
        'Kiểm tra rồi lưu bài mới với draft:true (luôn là nháp) và trả link xem trước. Từ chối nếu chưa đạt kiểm tra hoặc trùng slug. Chủ blog phải mở link xem trước trên điện thoại trước khi đăng.',
      inputSchema: {
        bai: z.record(z.string(), z.unknown()).describe('Dữ liệu frontmatter của bài (xem huong_dan_viet_bai)'),
        noiDung: z.string().describe('Thân bài Markdown; ảnh dạng ![mô tả](anh:MÃ_ẢNH)'),
      },
    },
    boc(async (a) => json(await taoBanNhap(ctx, a))),
  );

  server.registerTool(
    'sua_bai',
    {
      description:
        'Sửa bài nháp hoặc bài đã đăng: gửi các trường cần đổi (bai) và/hoặc thân bài mới (noiDung). Không đổi được slug hay trạng thái đăng (dùng dang_bai/go_bai). Đổi tinh của bài đã đăng sẽ tự thêm redirect 301. tinh:null = bỏ tỉnh.',
      inputSchema: {
        slug: z.string().describe('Slug của bài cần sửa'),
        bai: z.record(z.string(), z.unknown()).optional().describe('Các trường frontmatter cần ghi đè'),
        noiDung: z.string().optional().describe('Thân bài mới (bỏ trống = giữ nguyên)'),
      },
    },
    boc(async (a) => json(await suaBai(ctx, a))),
  );

  server.registerTool(
    'xem_trang_thai',
    {
      description:
        'Cho biết bản xem trước đã build từ commit mới nhất trên main chưa (so build.json), trạng thái build (đang chờ, đang build, lỗi lần cuối kèm log rút gọn) và link xem trước. Gọi sau tao_ban_nhap/sua_bai để biết khi nào xem được.',
      inputSchema: {},
    },
    boc(async () => json(await xemTrangThai(ctx))),
  );

  server.registerTool(
    'dang_bai',
    {
      description:
        'Đăng bài nháp lên site thật (draft:false). CHỈ gọi sau khi chủ blog đã xem bản xem trước và nói đồng ý. Từ chối nếu kiểm tra không đạt hoặc bản xem trước chưa build từ đúng commit hiện tại.',
      inputSchema: { slug: z.string().describe('Slug của bài nháp') },
    },
    boc(async ({ slug }) => json(await dangBai(ctx, slug))),
  );

  server.registerTool(
    'go_bai',
    {
      description:
        'Gỡ bài khỏi site chính (đặt draft:true), có hiệu lực khi build xong, không xoá file. Dùng khi cần gỡ khẩn cấp. CHÚ Ý: bản xem trước (nhap-vntraveltips…), các ảnh trên VPS và lịch sử GitHub VẪN còn nội dung — nếu gỡ vì lộ thông tin riêng tư, phải báo chủ blog xoá thêm ảnh/nội dung.',
      inputSchema: { slug: z.string().describe('Slug của bài cần gỡ') },
    },
    boc(async ({ slug }) => json(await goBai(ctx, slug))),
  );
}

export function dangKyToolDoc(server: McpServer, ctx: ToolCtx): void {
  server.registerTool(
    'huong_dan_viet_bai',
    {
      description:
        'Trả về mẫu bài theo loại, quy tắc giọng văn VNTravelTips, cách đặt dữ liệu bài và checklist duyệt. GỌI ĐẦU TIÊN khi bắt đầu viết/duyệt một bài.',
      inputSchema: { loai: z.enum(CAC_LOAI).describe('Loại bài: nhat-ky, review, top-list hoặc cam-nang') },
    },
    boc(({ loai }) => van(huongDanVietBai(loai))),
  );

  server.registerTool(
    'tao_link_tai_anh',
    {
      description:
        'Tạo link tải ảnh có hạn 30 phút. Gửi link cho chủ blog, họ mở trên điện thoại/máy tính và chọn nhiều ảnh cùng lúc. Sau khi họ báo xong, gọi liet_ke_anh để xem ảnh.',
      inputSchema: {},
    },
    boc(async () => json(await taoLinkTaiAnh(ctx))),
  );

  server.registerTool(
    'liet_ke_anh',
    {
      description:
        'Liệt kê ảnh vừa tải lên (mới nhất trước) kèm ảnh thu nhỏ để bạn NHÌN ảnh, viết alt text và chọn ảnh bìa. Mỗi ảnh có mã (ma) dùng trong bài.',
      inputSchema: { gioiHan: z.number().int().min(1).max(20).default(8).describe('Số ảnh tối đa (≤ 20)') },
    },
    boc(async ({ gioiHan }) => {
      const ds = await lietKeAnh(ctx, gioiHan);
      const content: NoiDungTool = [
        { type: 'text', text: JSON.stringify(ds.map(({ thumbnail: _t, ...r }) => r), null, 2) },
      ];
      ds.forEach((a, i) => {
        if (a.thumbnail) {
          content.push({ type: 'text', text: `Ảnh ${i + 1}: mã ${a.ma} (${a.ten})` });
          content.push({ type: 'image', data: a.thumbnail.data, mimeType: a.thumbnail.mimeType });
        }
      });
      return { content };
    }),
  );

  server.registerTool(
    'kiem_tra_bai',
    {
      description:
        'Kiểm tra dữ liệu bài theo schema chung + checklist SEO (độ dài tiêu đề/mô tả, alt, khối Tra nhanh, link nội bộ, mã ảnh có thật). Trả về lỗi (chặn đăng) và gợi ý. KHÔNG ghi gì.',
      inputSchema: {
        bai: z.record(z.string(), z.unknown()).describe('Dữ liệu frontmatter của bài (xem huong_dan_viet_bai)'),
        noiDung: z.string().default('').describe('Thân bài Markdown'),
        slugDangSua: z.string().optional().describe('Slug của bài đang sửa (để không báo trùng với chính nó)'),
      },
    },
    boc(async (a) => json(await kiemTraBaiTool(ctx, a))),
  );

  server.registerTool(
    'liet_ke_bai',
    {
      description: 'Liệt kê các bài hiện có (slug, tiêu đề, loại, tỉnh, nháp hay đã đăng, URL). Dùng để tìm bài cần sửa hoặc gợi ý link nội bộ.',
      inputSchema: {
        tinh: z.string().optional().describe('Chỉ lấy bài của tỉnh này (slug)'),
        draft: z.boolean().optional().describe('true = chỉ nháp, false = chỉ bài đã đăng'),
      },
    },
    boc(async (a) => json(await lietKeBai(ctx, a))),
  );

  server.registerTool(
    'doc_bai',
    {
      description: 'Đọc đầy đủ một bài (dữ liệu + thân bài Markdown) theo slug.',
      inputSchema: { slug: z.string().describe('Slug của bài') },
    },
    boc(async ({ slug }) => {
      const { bai, noiDung } = await docBai(ctx, slug);
      return json({ bai, noiDung });
    }),
  );
}
