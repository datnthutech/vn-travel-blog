// Việc làm khi container vntraveltips-mcp khởi động: LUÔN xếp một lượt build.
// Lý do: biến build (NOINDEX_ALL, GOATCOUNTER_CODE) chỉ có hiệu lực khi build lại. Chủ blog đổi chúng bằng cách
// sửa deploy/.env rồi chạy ./deploy.sh — compose tạo lại container, container khởi động, và build ở đây nhận giá trị mới.
// Trong lúc build, site vẫn phục vụ bản cũ (symlink chỉ đổi khi bản mới build thành công).
import type { Config } from '../config';
import { daCoBanBuild } from './chay-build';
import type { HangDoiBuild } from './hang-doi';

export async function khiKhoiDong(
  config: Config,
  hangDoi: HangDoiBuild,
  log: (s: string) => void = console.log,
): Promise<void> {
  const co = await daCoBanBuild(config);
  log(
    co
      ? 'Đã có bản build: kiểm tra commit và cấu hình, đổi thì build lại ở nền; site vẫn phục vụ bản cũ.'
      : 'Chưa có bản build: đang build lần đầu (vài phút), site trống cho tới khi xong.',
  );
  hangDoi.yeuCau();
}
