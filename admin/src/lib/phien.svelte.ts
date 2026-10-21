// Trạng thái đăng nhập hiện tại của giao diện (lấy từ GET /api/admin/toi).
import { goiApi, LoiApi } from './api';

export interface NguoiDung {
  id: number;
  email: string;
  ten: string;
  vaiTro: 'quan-tri' | 'quan-ly' | 'writer';
  biKhoa: boolean;
  coTotp: boolean;
}

export const phien = $state<{ daTai: boolean; nguoiDung: NguoiDung | null; choTotp: boolean }>({ daTai: false, nguoiDung: null, choTotp: false });

/** Hỏi máy chủ "tôi là ai". 401 → chưa đăng nhập (không tự chuyển trang, App quyết định). */
export async function taiPhien(): Promise<void> {
  try {
    const r = await goiApi<{ nguoiDung?: NguoiDung; choTotp?: boolean }>('GET', '/toi', undefined, { khongChuyenTrang: true });
    phien.nguoiDung = r.nguoiDung ?? null;
    phien.choTotp = r.choTotp === true;
  } catch (e) {
    if (!(e instanceof LoiApi) || e.status !== 401) throw e;
    phien.nguoiDung = null;
    phien.choTotp = false;
  }
  phien.daTai = true;
}

export const thongBaoLoi = (e: unknown): string => (e instanceof LoiApi ? e.loi : 'Có lỗi không xác định. Hãy thử lại.');
