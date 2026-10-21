// Nhật ký ảnh vừa tải lên (để tool liet_ke_anh cho Claude xem). Lưu trong ANH_DIR/.gan-day.json.
// Tên bắt đầu bằng dấu chấm; nginx chặn truy cập các file ẩn dưới /anh/ (xem deploy/nginx/vntraveltips.conf).
import { readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface AnhGanDay {
  ma: string;
  ten: string;
  luc: number;
}

const TOI_DA = 200;
const tep = (dir: string) => join(dir, '.gan-day.json');

async function doc(dir: string): Promise<AnhGanDay[]> {
  try {
    const d = JSON.parse(await readFile(tep(dir), 'utf8'));
    return Array.isArray(d) ? d : [];
  } catch {
    return [];
  }
}

// Ghi tuần tự (một tiến trình, các ảnh xử lý lần lượt) nên không cần khoá file.
export async function ghiNhanAnh(dir: string, a: AnhGanDay): Promise<void> {
  const ds = [...(await doc(dir)), a].slice(-TOI_DA);
  const tam = `${tep(dir)}.tmp`;
  await writeFile(tam, JSON.stringify(ds));
  await rename(tam, tep(dir));
}

export async function layAnhGanDay(dir: string, gioiHan: number): Promise<AnhGanDay[]> {
  return (await doc(dir)).reverse().slice(0, gioiHan);
}
