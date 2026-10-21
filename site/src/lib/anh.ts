// Kích thước ảnh (rộng/cao) để <picture> có width/height → trang không bị nhảy bố cục.
// Bài chỉ lưu mã ảnh, nên kích thước lấy từ meta.json do MCP ghi cạnh ảnh lúc xử lý. Đọc từ ĐĨA, không qua mạng:
// - Có ANH_META_DIR (build trong container mcp: thư mục anh/ trên volume): đọc <ANH_META_DIR>/<ma>/meta.json.
// - Không có file đó, hoặc không đặt biến (chạy local): đọc site/dev-anh/<ma>/meta.json.
// - Cả hai đều không có → lỗi nêu mã ảnh và các đường dẫn đã thử.
// ANH_BASE_URL không dùng ở đây; nó chỉ tạo URL ảnh trong HTML.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface AnhMeta {
  rong: number;
  cao: number;
}

export function parseAnhMeta(ma: string, text: string): AnhMeta {
  let d: unknown;
  try {
    d = JSON.parse(text);
  } catch {
    throw new Error(`Ảnh "${ma}": meta.json không phải JSON`);
  }
  const { rong, cao } = (d ?? {}) as Record<string, unknown>;
  if (typeof rong !== 'number' || typeof cao !== 'number') {
    throw new Error(`Ảnh "${ma}": meta.json thiếu rong/cao`);
  }
  return { rong, cao };
}

const boNho = new Map<string, Promise<AnhMeta>>();

// Đọc một file; không có file thì trả null (để thử đường dẫn kế tiếp), các lỗi khác vẫn ném ra.
async function docNeuCo(duongDan: string): Promise<string | null> {
  try {
    return await readFile(duongDan, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
}

export function layAnhMeta(ma: string): Promise<AnhMeta> {
  let p = boNho.get(ma);
  if (!p) {
    p = (async () => {
      const thuTu: string[] = [];
      const thuMucMeta = process.env.ANH_META_DIR;
      if (thuMucMeta) {
        const duong = join(thuMucMeta, ma, 'meta.json');
        thuTu.push(duong);
        const text = await docNeuCo(duong);
        if (text !== null) return parseAnhMeta(ma, text);
      }
      // Astro luôn chạy từ thư mục site/, nên dev-anh nằm ngay dưới cwd.
      const duongDev = join(process.cwd(), 'dev-anh', ma, 'meta.json');
      thuTu.push(duongDev);
      const text = await docNeuCo(duongDev);
      if (text !== null) return parseAnhMeta(ma, text);
      throw new Error(`Ảnh "${ma}": không có meta.json. Đã tìm ở: ${thuTu.join(', ')}`);
    })();
    boNho.set(ma, p);
  }
  return p;
}
