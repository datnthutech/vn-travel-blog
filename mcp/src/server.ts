// Điểm khởi động của container vntraveltips-mcp: đọc cấu hình rồi nghe cổng 8091.
// Mỗi lần khởi động đều xếp một lượt build (xem build/khoi-dong.ts); /healthz không chờ build.
import { createApp } from './app';
import { taoChayBuild } from './build/chay-build';
import { taoHangDoiBuild } from './build/hang-doi';
import { khiKhoiDong } from './build/khoi-dong';
import { loadConfig } from './config';

const config = loadConfig();
const hangDoi = taoHangDoiBuild(taoChayBuild(config));
createApp(config, { hangDoi }).listen(config.port, '0.0.0.0', () => {
  console.log(`vntraveltips-mcp đang chạy ở cổng ${config.port}`);
});
void khiKhoiDong(config, hangDoi);
