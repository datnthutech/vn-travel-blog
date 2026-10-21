// Kiểm tra ổ đĩa còn đủ chỗ để nhận ảnh mới: từ chối khi dưới 2 GB (ổ VPS dùng chung với dịch vụ khác).
import { statfs } from 'node:fs/promises';

type StatFn = (path: string) => Promise<{ bavail: number | bigint; bsize: number | bigint }>;

export async function conDungLuong(anhDir: string, toiThieuGB = 2, statFn: StatFn = statfs): Promise<boolean> {
  const s = await statFn(anhDir);
  const trong = Number(s.bavail) * Number(s.bsize);
  return trong >= toiThieuGB * 1024 ** 3;
}
