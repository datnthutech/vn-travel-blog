// Chuyển qua lại giữa đối tượng BaiViet và file Markdown (frontmatter YAML + thân bài) lưu trong repo.
// Dùng chung cho mọi tool đọc/ghi bài, nên là chỗ DUY NHẤT biết định dạng file.
import { baiVietSchema, type BaiViet } from '@vntraveltips/schema';
import { parse, stringify } from 'yaml';

// Date → "YYYY-MM-DD" (nếu đúng nửa đêm UTC) để file bài dễ đọc/sửa tay; trường undefined bị bỏ.
function chuanHoa(v: unknown): unknown {
  if (v instanceof Date) {
    const iso = v.toISOString();
    return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso;
  }
  if (Array.isArray(v)) return v.map(chuanHoa);
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.entries(v)
        .filter(([, x]) => x !== undefined)
        .map(([k, x]) => [k, chuanHoa(x)]),
    );
  }
  return v;
}

export function serializeBai(bai: BaiViet, noiDung: string): string {
  return `---\n${stringify(chuanHoa(bai), { lineWidth: 0 })}---\n\n${noiDung}`;
}

export function parseBai(text: string): { bai: BaiViet; noiDung: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  if (!m) throw new Error('File bài thiếu frontmatter (phần ---...--- ở đầu file).');
  const kq = baiVietSchema.safeParse(parse(m[1]));
  if (!kq.success) {
    const loi = kq.error.issues.map((i) => `${i.path.join('.') || '(gốc)'}: ${i.message}`).join('; ');
    throw new Error(`Frontmatter không hợp lệ: ${loi}`);
  }
  let noiDung = text.slice(m[0].length);
  if (noiDung.startsWith('\n')) noiDung = noiDung.slice(1);
  return { bai: kq.data, noiDung };
}
