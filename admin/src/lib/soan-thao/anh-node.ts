// Node ảnh của trình soạn thảo: trong tài liệu và trong Markdown, ảnh luôn lưu dạng `anh:MÃ` (đúng cú pháp site dùng);
// chỉ khi HIỂN THỊ trong trình soạn thảo mới đổi thành URL thật `${anhBaseUrl}/anh/<MÃ>/960.webp`.
import { mergeAttributes } from '@tiptap/core';
import Image from '@tiptap/extension-image';

export interface TuyChonAnh {
  anhBaseUrl: string;
}

export const urlHienThi = (src: unknown, anhBaseUrl: string): string => {
  const s = typeof src === 'string' ? src : '';
  return s.startsWith('anh:') ? `${anhBaseUrl}/anh/${encodeURIComponent(s.slice(4))}/960.webp` : s;
};

export const AnhNode = Image.extend<TuyChonAnh & { HTMLAttributes: Record<string, unknown> }>({
  addOptions() {
    return { ...this.parent?.(), anhBaseUrl: '' } as never;
  },
  renderHTML({ HTMLAttributes }) {
    const { anhBaseUrl } = this.options as TuyChonAnh;
    return ['img', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, { src: urlHienThi(HTMLAttributes.src, anhBaseUrl), loading: 'lazy' })];
  },
});
