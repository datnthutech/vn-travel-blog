// Lệnh quản trị chạy trong container: docker exec -it vntraveltips-mcp npm run cli -w @vntraveltips/mcp -- <lenh>
// Lệnh: tao-quan-tri --email --ten, dat-lai-mat-khau --email (mật khẩu hỏi qua stdin, KHÔNG nhận qua tham số),
// sao-luu, khoi-phuc --file F, nhap-noi-dung --thu-muc D.
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { duongDanDb, moDb } from './db/ket-noi';
import { donSaoLuu, khoiPhuc, saoLuu } from './db/sao-luu';
import { nhapTuThuMuc } from './noi-dung/nhap';
import { doiMatKhau, taoNguoiDung, timTheoEmail } from './tai-khoan/nguoi-dung';

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

// Chỉ chấp nhận tham số đã khai báo: nhầm `--mat-khau` là lỗi, để mật khẩu không bao giờ nằm trên dòng lệnh.
function thamSo(args: string[], hopLe: string[]): Record<string, string> {
  const kq: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 2) {
    const k = args[i]!;
    if (!k.startsWith('--') || !hopLe.includes(k.slice(2))) throw new Error(`Tham số không hợp lệ (mật khẩu không được đưa qua tham số): ${k.startsWith('--mat') ? '--mat…' : k}`);
    kq[k.slice(2)] = args[i + 1] ?? '';
  }
  return kq;
}

export async function chayCli(argv: string[], io: CliIo): Promise<number> {
  const [lenh, ...con] = argv;
  const CHO_PHEP: Record<string, string[]> = {
    'tao-quan-tri': ['email', 'ten'], 'dat-lai-mat-khau': ['email'], 'sao-luu': [], 'khoi-phuc': ['file'], 'nhap-noi-dung': ['thu-muc'],
  };
  let opt: Record<string, string>;
  try {
    opt = thamSo(con, CHO_PHEP[lenh ?? ''] ?? []);
  } catch (e) {
    io.loi((e as Error).message);
    return 2;
  }
  const dbPath = duongDanDb(io.dataDir);
  const thuMucSaoLuu = join(io.dataDir, 'db', 'sao-luu');

  switch (lenh) {
    case 'tao-quan-tri': {
      if (!opt.email || !opt.ten) {
        io.loi('Thiếu --email và/hoặc --ten.');
        return 2;
      }
      const mk = await io.docMatKhau('Mật khẩu (ít nhất 12 ký tự, không hiện khi gõ): ');
      const db = moDb(dbPath);
      try {
        const u = await taoNguoiDung(db, { email: opt.email, ten: opt.ten, vaiTro: 'quan-tri', matKhau: mk }, io.now);
        io.in(`Đã tạo quản trị ${u.email}. Đăng nhập tại /quan-tri/ và bật xác thực 2 lớp.`);
        return 0;
      } catch (e) {
        io.loi((e as Error).message);
        return 1;
      } finally {
        db.close();
      }
    }
    case 'dat-lai-mat-khau': {
      if (!opt.email) {
        io.loi('Thiếu --email.');
        return 2;
      }
      const db = moDb(dbPath);
      try {
        const u = timTheoEmail(db, opt.email);
        if (!u) {
          io.loi('Không có tài khoản với email này.');
          return 1;
        }
        const mk = await io.docMatKhau('Mật khẩu mới (ít nhất 12 ký tự, không hiện khi gõ): ');
        await doiMatKhau(db, u.id, mk);
        io.in('Đã đổi mật khẩu và đăng xuất mọi thiết bị.');
        return 0;
      } catch (e) {
        io.loi((e as Error).message);
        return 1;
      } finally {
        db.close();
      }
    }
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
      io.loi('Lệnh: tao-quan-tri --email E --ten T | dat-lai-mat-khau --email E | sao-luu | khoi-phuc --file F | nhap-noi-dung --thu-muc D');
      return 2;
  }
}

// Đọc mật khẩu: trên terminal thật thì ẩn ký tự gõ; qua pipe (echo mk | docker exec -i …) thì đọc một dòng.
// Lời nhắc ghi ra stderr; mật khẩu không bao giờ được in lại.
function docMatKhauAn(rl: ReturnType<typeof createInterface>, loiNhac: string): Promise<string> {
  if (!process.stdin.isTTY) return rl.question('');
  return new Promise((xong) => {
    process.stderr.write(loiNhac);
    const w = rl as unknown as { _writeToOutput: (s: string) => void };
    const goc = w._writeToOutput;
    w._writeToOutput = () => {};
    rl.question('').then((mk) => {
      w._writeToOutput = goc;
      process.stderr.write('\n');
      xong(mk);
    });
  });
}

// Chạy thật khi gọi trực tiếp (npm run cli); khi import trong test thì không chạy.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  const io: CliIo = {
    dataDir: process.env.DATA_DIR || '/data',
    now: Date.now,
    hoi: (q) => rl.question(q),
    docMatKhau: (q) => docMatKhauAn(rl, q),
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
