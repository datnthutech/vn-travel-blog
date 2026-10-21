// Các tool ảnh: tạo link tải ảnh (gắn với người dùng xin link) và liệt kê ảnh vừa tải. (Đọc/ghi bài nằm ở doc-db.ts / ghi.ts, làm việc trên DB.)
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import type { BaiViet } from '@vntraveltips/schema';
import { conDungLuong } from '../anh/dung-luong';
import { layAnhGanDay } from '../anh/gan-day';
import { taoToken, TTL_MAC_DINH } from '../anh/token';
import type { ToolCtx } from './ctx';

const MA_ANH = /^[A-Za-z0-9]{1,64}$/;
const TOI_DA_ANH = 20;

export async function taoLinkTaiAnh(ctx: ToolCtx): Promise<{ url: string; hetHan: string }> {
  // Ổ gần đầy thì nói ngay với Claude, thay vì để chủ blog chọn cả chục ảnh rồi mới bị từ chối ở trang tải.
  if (!(await (ctx.conDungLuong ?? ((d: string) => conDungLuong(d)))(ctx.config.anhDir))) {
    throw new Error('Ổ đĩa trên VPS gần đầy (còn dưới 2 GB) nên tạm không nhận thêm ảnh. Hãy báo chủ blog dọn ổ đĩa hoặc sao lưu ảnh cũ rồi xoá bớt.');
  }
  const token = taoToken(TTL_MAC_DINH, ctx.now, ctx.nguoiDung.id);
  return { url: `${ctx.config.publicBaseUrl}/tai-anh/${token}`, hetHan: new Date(ctx.now() + TTL_MAC_DINH).toISOString() };
}

export interface AnhLietKe {
  ma: string;
  ten: string;
  luc: number;
  rong?: number;
  cao?: number;
  thumbnail?: { data: string; mimeType: 'image/webp' };
}

// Ảnh vừa tải, kèm thumbnail nhỏ để Claude NHÌN ảnh rồi viết alt text / chọn ảnh bìa.
export async function lietKeAnh(ctx: ToolCtx, gioiHan = 8): Promise<AnhLietKe[]> {
  const n = Math.min(TOI_DA_ANH, Math.max(1, Math.floor(gioiHan)));
  const ds = await layAnhGanDay(ctx.config.anhDir, n);
  const kq: AnhLietKe[] = [];
  for (const a of ds) {
    const muc: AnhLietKe = { ...a };
    if (MA_ANH.test(a.ma)) {
      try {
        const meta = JSON.parse(await readFile(join(ctx.config.anhDir, a.ma, 'meta.json'), 'utf8'));
        muc.rong = meta.rong;
        muc.cao = meta.cao;
        // Bản 480px tạo sẵn; thu nhỏ thêm về cạnh dài 320 để tiết kiệm token khi Claude xem nhiều ảnh.
        const nho = await sharp(join(ctx.config.anhDir, a.ma, '480.webp'))
          .resize({ width: 320, height: 320, fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 60 })
          .toBuffer();
        muc.thumbnail = { data: nho.toString('base64'), mimeType: 'image/webp' };
      } catch {
        /* thư mục ảnh đã mất → vẫn liệt kê, không thumbnail */
      }
    }
    kq.push(muc);
  }
  return kq;
}

export interface TomTatBai {
  id: number;
  slug: string;
  tieuDe: string;
  loai: BaiViet['loai'];
  tinh?: string;
  /** nhap | da-dang | hen-gio */
  trangThai: string;
  draft: boolean;
  ngayDang: string;
  url: string;
}
