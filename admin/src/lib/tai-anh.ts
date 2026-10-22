// Tải một lần nhiều ảnh lên /api/admin/anh (multipart). Tách khỏi component để test được.
import { LoiApi } from './api';

export interface KetQuaTaiAnh {
  ok: { ma: string; rong: number; cao: number }[];
  loi: { ten: string; loi: string }[];
}

export async function layCsrfChoTai(): Promise<string> {
  const r = await fetch('/api/admin/toi', { credentials: 'same-origin' });
  const d = (await r.json().catch(() => ({}))) as { csrf?: string };
  if (!r.ok || !d.csrf) throw new LoiApi(r.status, 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.');
  return d.csrf;
}

/** Gửi TẤT CẢ file trong MỘT request (máy chủ xử lý tuần tự); trả kết quả riêng từng file. */
export async function goiTaiAnh(files: File[], f: typeof fetch = (...a) => fetch(...a), layCsrf = layCsrfChoTai): Promise<KetQuaTaiAnh> {
  const fd = new FormData();
  for (const file of files) fd.append('files', file);
  const r = await f('/api/admin/anh', { method: 'POST', body: fd, credentials: 'same-origin', headers: { 'X-CSRF-Token': await layCsrf() } });
  const d = (await r.json().catch(() => ({}))) as Partial<KetQuaTaiAnh> & { loi?: unknown };
  if (!r.ok) throw new LoiApi(r.status, typeof d.loi === 'string' ? d.loi : `Không tải được ảnh (mã ${r.status}).`);
  return { ok: d.ok ?? [], loi: (d.loi as KetQuaTaiAnh['loi']) ?? [] };
}
