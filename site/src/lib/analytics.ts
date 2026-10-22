// Đếm lượt xem nhẹ, KHÔNG cookie: GoatCounter (miễn phí). Chỉ bật cho bản production và khi đã có mã (Cài đặt site; chưa có
// cai-dat.json thì GOATCOUNTER_CODE). Chưa có mã → không có script bên thứ ba nào được tải.
import type { CaiDatSite } from '@vntraveltips/schema';
import { docCaiDatFile } from './cai-dat';

export function goatcounterScript(
  env: Record<string, string | undefined> = process.env,
  caiDat: Pick<CaiDatSite, 'goatcounterCode'> | null = docCaiDatFile(),
): { endpoint: string; src: string } | null {
  const ma = caiDat ? caiDat.goatcounterCode : env.GOATCOUNTER_CODE;
  if (env.BUILD_TARGET !== 'production' || !ma || !/^[a-z0-9-]{1,40}$/.test(ma)) return null;
  return { endpoint: `https://${ma}.goatcounter.com/count`, src: 'https://gc.zgo.at/count.js' };
}
