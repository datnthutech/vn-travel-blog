// Thông tin chung của blog: lấy từ Cài đặt site (cai-dat.json), chưa có thì mặc định.
import { layCaiDatSite } from '../lib/cai-dat';

const c = layCaiDatSite();
export const SITE = {
  ten: c.tenSite,
  moTa: c.moTaMacDinh,
  tacGia: { ten: 'Gia đình VNTravelTips' },
  logo: c.logo,
  favicon: c.favicon,
  anhChiaSe: c.anhChiaSeMacDinh,
  mangXaHoi: c.mangXaHoi,
} as const;
