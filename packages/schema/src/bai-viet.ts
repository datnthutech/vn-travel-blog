// "Bộ luật" dữ liệu bài viết — site (build), MCP và /admin đều kiểm tra theo file này.
// Sai luật → build dừng, nên bài lỗi không bao giờ lên mạng.
import { z } from 'zod';

const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'slug chỉ gồm a-z, 0-9 và dấu gạch ngang');

// Ảnh trong bài chỉ lưu mã ảnh (không lưu URL đầy đủ) + alt bắt buộc.
export const anhSchema = z.object({
  ma: z.string().min(1),
  alt: z.string().min(1, 'alt không được để trống'),
});

const diem = z.number().int().min(1).max(5);

export const traNhanhSchema = z.object({
  hopVoi: z.string(),
  thoiGian: z.string(),
  choO: z.string().optional(),
  tongChiPhi: z.number().nonnegative(),
  soNguoi: z.number().int().positive(),
  diemThanThienVoiBe: diem,
  diChuyen: z.string(),
  thoiDiemNenDi: z.string(),
  luuYVoiBe: z.array(z.string()).default([]),
});

export const diaDiemSchema = z.object({
  ten: z.string(),
  kieu: z.enum(['cho-o', 'quan-an', 'cho', 'khu-sinh-thai', 'diem-choi']),
  diaChi: z.string().optional(),
  toaDo: z.object({ lat: z.number(), lng: z.number() }).optional(),
  khoangGia: z.string().optional(),
  gioMoCua: z.string().optional(),
  thanThienVoiBe: z.string().optional(),
  diem: diem.optional(),
  uuDiem: z.array(z.string()).default([]),
  nhuocDiem: z.array(z.string()).default([]),
  anh: z.array(anhSchema).default([]),
  linkDat: z
    .object({ nhaCungCap: z.enum(['agoda', 'klook', 'traveloka', 'booking', 'khac']), url: z.string().url() })
    .optional(),
});

export const baiVietSchema = z
  .object({
    tieuDe: z.string().min(1),
    slug,
    moTa: z.string().min(120, 'moTa tối thiểu 120 ký tự').max(160, 'moTa tối đa 160 ký tự'),
    loai: z.enum(['nhat-ky', 'review', 'top-list', 'cam-nang']),
    tinh: slug.optional(),
    // Chuyên mục do chủ blog quản lý (bảng chuyen_muc / chuyen-muc.json): ở đây chỉ kiểm dạng slug; tồn tại hay không do kiemTraThamChieu.
    chuyenMuc: z.array(slug).default([]),
    tags: z.array(z.string()).default([]),
    anhBia: anhSchema,
    ngayDi: z.coerce.date().optional(),
    ngayDang: z.coerce.date(),
    ngayCapNhat: z.coerce.date().optional(),
    traNhanh: traNhanhSchema.optional(),
    diaDiem: z.array(diaDiemSchema).default([]),
    doMangChoBe: z
      .array(z.object({ ten: z.string(), ghiChu: z.string().optional(), link: z.string().url().optional() }))
      .default([]),
    faq: z.array(z.object({ hoi: z.string(), dap: z.string() })).default([]),
    hopTac: z.boolean().default(false),
    draft: z.boolean().default(false),
  })
  .superRefine((b, ctx) => {
    if ((b.loai === 'nhat-ky' || b.loai === 'review') && !b.traNhanh) {
      ctx.addIssue({ code: 'custom', path: ['traNhanh'], message: 'bài nhật ký/review bắt buộc có traNhanh' });
    }
  });

export type BaiViet = z.infer<typeof baiVietSchema>;
export type DiaDiem = z.infer<typeof diaDiemSchema>;

// URL không đổi sau khi đăng: có tỉnh → /tinh/slug/, không có → /kinh-nghiem/slug/.
export function urlBai(b: { slug: string; tinh?: string }): string {
  return b.tinh ? `/${b.tinh}/${b.slug}/` : `/kinh-nghiem/${b.slug}/`;
}
