// Khai báo "bài viết" và "tỉnh" nằm ở đâu và có hình dạng thế nào.
// Luật (schema) lấy từ packages/schema — dùng chung với MCP — nên sai luật là build dừng.
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { baiVietSchema, tinhSchema } from '@vntraveltips/schema';

// Build từ DB: dịch vụ MCP xuất nội dung ra một thư mục rồi đặt NOI_DUNG_DIR trỏ tới đó. Không đặt → dùng ./src/content.
const goc = process.env.NOI_DUNG_DIR ?? './src/content';

export const collections = {
  'bai-viet': defineCollection({
    loader: glob({ pattern: '**/*.{md,mdx}', base: `${goc}/bai-viet` }),
    schema: baiVietSchema,
  }),
  tinh: defineCollection({
    loader: glob({ pattern: '**/*.md', base: `${goc}/tinh` }),
    schema: tinhSchema,
  }),
};
