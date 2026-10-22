// Có chặn Google lập chỉ mục không? Bản preview luôn chặn. Production: theo Cài đặt site (choPhepLapChiMuc); nếu chưa có
// cai-dat.json thì theo NOINDEX_ALL (mặc định CÓ chặn cho tới khi chủ blog sẵn sàng).
import type { CaiDatSite } from '@vntraveltips/schema';
import { docCaiDatFile } from './cai-dat';

export function coNoindex(
  env: Record<string, string | undefined> = process.env,
  caiDat: Pick<CaiDatSite, 'choPhepLapChiMuc'> | null = docCaiDatFile(),
): boolean {
  if (env.BUILD_TARGET !== 'production') return true;
  if (caiDat) return !caiDat.choPhepLapChiMuc;
  return env.NOINDEX_ALL !== 'false';
}
