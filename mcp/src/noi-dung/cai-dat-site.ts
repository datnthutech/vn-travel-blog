// Cài đặt site: khoá `site` trong bảng cai_dat. Lần đầu chưa có thì khởi tạo từ env (NOINDEX_ALL, GOATCOUNTER_CODE), sau đó env hết tác dụng.
import { caiDatSiteMacDinh, type CaiDatSite } from '@vntraveltips/schema';
import type { Db } from '../db/ket-noi';
import { docCaiDat, ghiCaiDat } from './cai-dat';

export const docCaiDatSite = (db: Db): CaiDatSite => docCaiDat<CaiDatSite>(db, 'site') ?? caiDatSiteMacDinh({});

/** Gọi khi khởi động: chưa có khoá `site` thì tạo từ env. Trả true nếu vừa khởi tạo. */
export function khoiTaoCaiDatSite(db: Db, env: Record<string, string | undefined>): boolean {
  if (docCaiDat(db, 'site')) return false;
  ghiCaiDat(db, 'site', caiDatSiteMacDinh(env));
  return true;
}
