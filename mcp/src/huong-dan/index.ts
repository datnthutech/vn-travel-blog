// Nội dung tool huong_dan_viet_bai: mẫu bài theo loại + giọng văn + checklist duyệt, để Claude duyệt bài nhất quán.
import { readFileSync } from 'node:fs';

export const CAC_LOAI = ['nhat-ky', 'review', 'top-list', 'cam-nang'] as const;
export type LoaiBai = (typeof CAC_LOAI)[number];

const doc = (ten: string) => readFileSync(new URL(`./${ten}.md`, import.meta.url), 'utf8');

export function huongDanVietBai(loai: LoaiBai): string {
  if (!CAC_LOAI.includes(loai)) throw new Error(`Loại bài không hợp lệ "${loai}". Chọn một trong: ${CAC_LOAI.join(', ')}.`);
  return `${doc(loai)}\n---\n\n${doc('chung')}`;
}
