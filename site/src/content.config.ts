// Khai báo "bài viết" và "tỉnh" nằm ở đâu và có hình dạng thế nào.
// Luật (schema) lấy từ packages/schema — dùng chung với MCP — nên sai luật là build dừng.
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { baiVietSchema, tinhSchema } from '@vntraveltips/schema';

export const collections = {
  'bai-viet': defineCollection({
    loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/bai-viet' }),
    schema: baiVietSchema,
  }),
  tinh: defineCollection({
    loader: glob({ pattern: '**/*.md', base: './src/content/tinh' }),
    schema: tinhSchema,
  }),
};
