// Khai báo "bài viết" và "tỉnh" nằm ở đâu và có hình dạng thế nào.
// Luật (schema) lấy từ packages/schema — dùng chung với MCP — nên sai luật là build dừng.
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { baiVietSchema, tinhSchema } from '@vntraveltips/schema';

// Build từ DB: dịch vụ MCP xuất nội dung ra một thư mục rồi đặt NOI_DUNG_DIR trỏ tới đó. Không đặt → dùng ./src/content.
const goc = process.env.NOI_DUNG_DIR ?? './src/content';

// Trang tĩnh (giới thiệu, chính sách, liên hệ + trang do chủ blog tạo): trang/<slug>.md, slug = tên file.
const trangSchema = z.object({ tieuDe: z.string().min(1), moTa: z.string().default('') });

export const collections = {
  trang: defineCollection({ loader: glob({ pattern: '**/*.md', base: `${goc}/trang` }), schema: trangSchema }),
  // Bài tiếng Việt: file nằm thẳng trong bai-viet/. Bản dịch: bai-viet/<mã ngôn ngữ>/<slug>.md (có `ngonNgu` trong frontmatter).
  'bai-viet': defineCollection({
    loader: glob({ pattern: '*.{md,mdx}', base: `${goc}/bai-viet` }),
    schema: baiVietSchema,
  }),
  'bai-viet-dich': defineCollection({
    loader: glob({ pattern: '*/*.{md,mdx}', base: `${goc}/bai-viet` }),
    schema: baiVietSchema,
  }),
  // Bản dịch trang tĩnh: trang-dich/<mã ngôn ngữ>/<slug>.md.
  'trang-dich': defineCollection({ loader: glob({ pattern: '*/*.md', base: `${goc}/trang-dich` }), schema: trangSchema.extend({ slugGoc: z.string().min(1) }) }),
  tinh: defineCollection({
    loader: glob({ pattern: '**/*.md', base: `${goc}/tinh` }),
    schema: tinhSchema,
  }),
};
