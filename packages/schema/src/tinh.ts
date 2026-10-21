// Trang hub của một tỉnh (vd Vũng Tàu).
import { z } from 'zod';
import { anhSchema } from './bai-viet';

export const tinhSchema = z.object({
  ten: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  gioiThieu: z.string(),
  anhBia: anhSchema,
  moTa: z.string(),
});

export type Tinh = z.infer<typeof tinhSchema>;
