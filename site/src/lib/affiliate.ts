// Affiliate: mọi link kiếm hoa hồng phải có rel="sponsored nofollow noopener" (Google yêu cầu) và bài có link
// như vậy phải kèm dòng tiết lộ dẫn tới trang chính sách.
import type { BaiViet } from '@vntraveltips/schema';

export const REL_AFFILIATE = 'sponsored nofollow noopener';

export function coAffiliate(b: Pick<BaiViet, 'diaDiem' | 'doMangChoBe'>): boolean {
  return b.diaDiem.some((d) => !!d.linkDat) || b.doMangChoBe.some((d) => !!d.link);
}
