// Plugin remark (chạy lúc build): đổi ảnh Markdown dạng ![mô tả](anh:MÃ_ẢNH) thành <picture> tối ưu
// (AVIF/WebP, width/height). Ảnh thường (URL khác) giữ nguyên. Thiếu ảnh → throw → build dừng, site giữ bản cũ.
import { layAnhMeta, type AnhMeta } from './anh';
import { anhHtml } from './anh-url';

interface Nut {
  type: string;
  url?: string;
  alt?: string | null;
  value?: string;
  children?: Nut[];
}

export function remarkAnh(opts: { layMeta?: (ma: string) => Promise<AnhMeta> } = {}) {
  const layMeta = opts.layMeta ?? layAnhMeta;
  return () => async (cay: Nut) => {
    const cacAnh: Nut[] = [];
    const duyet = (n: Nut) => {
      if (n.type === 'image' && n.url?.startsWith('anh:')) cacAnh.push(n);
      n.children?.forEach(duyet);
    };
    duyet(cay);
    for (const n of cacAnh) {
      const ma = n.url!.slice(4);
      const html = anhHtml(ma, n.alt ?? '', await layMeta(ma));
      // Biến chính nút ảnh thành nút html (giữ nguyên vị trí trong cây).
      for (const k of Object.keys(n)) delete (n as unknown as Record<string, unknown>)[k];
      Object.assign(n, { type: 'html', value: html });
    }
  };
}
