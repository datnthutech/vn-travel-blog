// Điểm khởi động của container vntraveltips-mcp: đọc cấu hình rồi nghe cổng 8091.
// Mỗi lần khởi động đều xếp một lượt build (xem build/khoi-dong.ts); /healthz không chờ build.
import { createApp } from './app';
import { taoChayBuild } from './build/chay-build';
import { taoHangDoiBuild } from './build/hang-doi';
import { khiKhoiDong } from './build/khoi-dong';
import { loadConfig } from './config';
import { duongDanDb, moDb } from './db/ket-noi';
import { donSaoLuu, saoLuu } from './db/sao-luu';

const config = loadConfig();
const db = moDb(duongDanDb(config.dataDir));

// Sao lưu DB mỗi giờ vào <dataDir>/db/sao-luu, rồi dọn bản cũ (giữ 48 bản theo giờ + bản đầu mỗi ngày trong 14 ngày).
const thuMucSaoLuu = `${config.dataDir}/db/sao-luu`;
const saoLuuDinhKy = () =>
  saoLuu(db, thuMucSaoLuu, Date.now())
    .then(() => donSaoLuu(thuMucSaoLuu, Date.now()))
    .catch((e) => console.error('Sao lưu DB lỗi:', (e as Error).message));
setInterval(() => void saoLuuDinhKy(), 3_600_000).unref();
const hangDoi = taoHangDoiBuild(taoChayBuild(config));
createApp(config, { hangDoi }).listen(config.port, '0.0.0.0', () => {
  console.log(`vntraveltips-mcp đang chạy ở cổng ${config.port}`);
});
void khiKhoiDong(config, hangDoi);
