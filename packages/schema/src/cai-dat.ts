// Cài đặt chung của site (tên, mô tả, logo, mạng xã hội, lập chỉ mục, đếm lượt xem, quảng cáo…). Lưu trong DB, xuất ra cai-dat.json cho build.
import { z } from 'zod';

const urlHttps = z
  .string()
  .trim()
  .refine((s) => {
    try {
      return new URL(s).protocol === 'https:';
    } catch {
      return false;
    }
  }, 'phải là địa chỉ bắt đầu bằng https://');
const maAnhChuoi = z.string().regex(/^[A-Za-z0-9]{1,64}$/, 'mã ảnh không hợp lệ');
const maAnh = z.object({ ma: maAnhChuoi });

export const VI_TRI_QUANG_CAO = ['sau-tra-nhanh', 'giua-bai', 'cuoi-bai'] as const;

export const caiDatSiteSchema = z.object({
  tenSite: z.string().trim().min(1, 'tên site không được để trống').max(60, 'tên site tối đa 60 ký tự'),
  moTaMacDinh: z.string().trim().min(1, 'mô tả mặc định không được để trống').max(300, 'mô tả tối đa 300 ký tự'),
  logo: maAnh.optional(),
  /** Favicon dùng bản `480.webp` của ảnh đã chọn. */
  favicon: maAnh.optional(),
  anhChiaSeMacDinh: z.object({ ma: maAnhChuoi, alt: z.string().trim().min(1, 'ảnh chia sẻ cần có mô tả (alt)') }).optional(),
  mangXaHoi: z.object({ facebook: urlHttps.optional(), instagram: urlHttps.optional(), tiktok: urlHttps.optional(), youtube: urlHttps.optional() }).default({}),
  /** false = chặn Google lập chỉ mục toàn site (noindex). */
  choPhepLapChiMuc: z.boolean(),
  goatcounterCode: z.string().regex(/^[a-z0-9-]{1,40}$/, 'mã GoatCounter chỉ gồm a-z, 0-9, dấu gạch ngang').optional(),
  quangCao: z.object({ bat: z.boolean(), viTri: z.array(z.enum(VI_TRI_QUANG_CAO)).default([]) }).default({ bat: false, viTri: [] }),
  /** Bình luận của người đọc: mặc định TẮT (bật trong Cài đặt site). `tuCam`: bình luận chứa từ này (không phân biệt hoa/thường, bỏ dấu) sẽ vào hàng chờ xem. */
  binhLuan: z.object({ bat: z.boolean().default(false), tuCam: z.array(z.string().trim().min(1).max(60)).max(200).default([]) }).default({ bat: false, tuCam: [] }),
  affiliateMacDinh: z.enum(['agoda', 'klook', 'traveloka', 'booking']).optional(),
  muiGio: z.literal('Asia/Ho_Chi_Minh').default('Asia/Ho_Chi_Minh'),
});

export type CaiDatSite = z.infer<typeof caiDatSiteSchema>;

/**
 * Cài đặt khởi tạo lần đầu. `env` chỉ là GIÁ TRỊ KHỞI TẠO: NOINDEX_ALL=false → cho lập chỉ mục (mặc định chặn),
 * GOATCOUNTER_CODE → mã đếm lượt xem. Sau đó chủ blog đổi trong trang quản trị, env không còn tác dụng.
 */
export function caiDatSiteMacDinh(env: Record<string, string | undefined> = {}): CaiDatSite {
  const ma = env.GOATCOUNTER_CODE;
  return caiDatSiteSchema.parse({
    tenSite: 'VNTravelTips',
    moTaMacDinh: 'Nhật ký du lịch thật của một gia đình nhỏ và gợi ý cho các gia đình có bé nhỏ.',
    mangXaHoi: {},
    choPhepLapChiMuc: env.NOINDEX_ALL === 'false',
    ...(ma && /^[a-z0-9-]{1,40}$/.test(ma) ? { goatcounterCode: ma } : {}),
    quangCao: { bat: false, viTri: [] },
    binhLuan: { bat: false, tuCam: [] },
  });
}
