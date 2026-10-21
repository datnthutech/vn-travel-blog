// Lệnh quản trị chạy trong container: docker exec -it vntraveltips-mcp npm run cli -w @vntraveltips/mcp -- <lenh>
// Lệnh: sao-luu, khoi-phuc --file F, nhap-noi-dung --thu-muc D (tao-quan-tri / dat-lai-mat-khau thêm ở Task 5).
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { duongDanDb, moDb } from './db/ket-noi';
import { donSaoLuu, khoiPhuc, saoLuu } from './db/sao-luu';
import { nhapTuThuMuc } from './noi-dung/nhap';

export interface CliIo {
  dataDir: string;
  now: () => number;
  /** Hỏi một câu, trả dòng người dùng gõ. */
  hoi: (cauHoi: string) => Promise<string>;
  /** Đọc mật khẩu (không hiện ra màn hình, không in lại). */
  docMatKhau: (cauHoi: string) => Promise<string>;
  in: (s: string) => void;
  loi: (s: string) => void;
}

function thamSo(args: string[]): Record<string, string> {
  const kq: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i]!.startsWith('--')) kq[args[i]!.slice(2)] = args[i + 1] ?? '';
  }
  return kq;
}

export async function chayCli(argv: string[], io: CliIo): Promise<number> {
  const [lenh, ...con] = argv;
  const opt = thamSo(con);
  const dbPath = duongDanDb(io.dataDir);
  const thuMucSaoLuu = join(io.dataDir, 'db', 'sao-luu');

  switch (lenh) {
    case 'sao-luu': {
      const db = moDb(dbPath);
      try {
        const f = await saoLuu(db, thuMucSaoLuu, io.now());
        const xoa = donSaoLuu(thuMucSaoLuu, io.now());
        io.in(`Đã sao lưu: ${f} (dọn ${xoa.length} bản cũ)`);
      } finally {
        db.close();
      }
      return 0;
    }
    case 'khoi-phuc': {
      if (!opt.file) {
        io.loi('Thiếu --file <đường dẫn file sao lưu>.');
        return 2;
      }
      const xacNhan = await io.hoi('Khôi phục sẽ THAY toàn bộ dữ liệu hiện tại. Gõ KHOI-PHUC để xác nhận: ');
      if (xacNhan.trim() !== 'KHOI-PHUC') {
        io.loi('Không gõ đúng KHOI-PHUC — đã huỷ, không đổi gì.');
        return 1;
      }
      try {
        khoiPhuc(opt.file, dbPath, io.now);
      } catch (e) {
        io.loi((e as Error).message);
        return 1;
      }
      io.in('Đã khôi phục. Hãy khởi động lại container (docker compose -p vntraveltips restart vntraveltips-mcp) để dịch vụ mở lại DB mới.');
      return 0;
    }
    case 'nhap-noi-dung': {
      if (!opt['thu-muc']) {
        io.loi('Thiếu --thu-muc <thư mục chứa bai-viet/, tinh/>.');
        return 2;
      }
      const db = moDb(dbPath);
      try {
        const kq = nhapTuThuMuc(db, opt['thu-muc']);
        io.in(`Đã nhập ${kq.soBai} bài, ${kq.soTinh} tỉnh, ${kq.soRedirect} redirect.`);
      } finally {
        db.close();
      }
      return 0;
    }
    default:
      io.loi('Lệnh: sao-luu | khoi-phuc --file F | nhap-noi-dung --thu-muc D');
      return 2;
  }
}

// Chạy thật khi gọi trực tiếp (npm run cli); khi import trong test thì không chạy.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  const io: CliIo = {
    dataDir: process.env.DATA_DIR || '/data',
    now: Date.now,
    hoi: (q) => rl.question(q),
    docMatKhau: (q) => rl.question(q),
    in: (s) => console.log(s),
    loi: (s) => console.error(s),
  };
  chayCli(process.argv.slice(2), io)
    .then((ma) => {
      rl.close();
      process.exit(ma);
    })
    .catch((e) => {
      console.error((e as Error).message);
      process.exit(1);
    });
}
