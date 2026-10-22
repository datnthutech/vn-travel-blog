// Chuyển qua lại Markdown ↔ tài liệu TipTap. Markdown là định dạng LƯU (khớp thân bài trong DB và build Astro);
// TipTap chỉ là giao diện soạn. Ảnh luôn là `![alt](anh:MÃ)`; HTML lạ trong Markdown bị bỏ.
import { Editor } from '@tiptap/core';
import { Markdown } from '@tiptap/markdown';
import StarterKit from '@tiptap/starter-kit';
import { AnhNode } from './anh-node';

/**
 * Bỏ HTML thô khỏi Markdown trước khi nạp vào trình soạn thảo: khối <script>/<style>/<iframe>… bị xoá cả nội dung,
 * thẻ khác bị bỏ nhưng giữ chữ bên trong. Giữ autolink `<https://…>` / `<mail@x>`; không đụng code (``` hoặc `…`).
 */
export function lamSachMarkdown(md: string): string {
  const phan = md.split(/(```[\s\S]*?```|`[^`\n]*`)/g); // phần lẻ là code, giữ nguyên
  return phan
    .map((p, i) =>
      i % 2 === 1
        ? p
        : p
            .replace(/<(script|style|iframe|object|embed|noscript)\b[\s\S]*?<\/\1\s*>/gi, '')
            .replace(/<(script|style|iframe|object|embed|noscript)\b[^>]*>/gi, '')
            .replace(/<!--[\s\S]*?-->/g, '')
            // Liên kết/ảnh trỏ tới javascript:, vbscript:, data: bị bỏ (giữ chữ của liên kết).
            .replace(/!\[[^\]]*\]\(\s*(?:javascript|vbscript|data):(?:[^()]|\([^()]*\))*\)/gi, '')
            .replace(/\[([^\]]*)\]\(\s*(?:javascript|vbscript|data):(?:[^()]|\([^()]*\))*\)/gi, '$1')
            .replace(/<\/?(?![a-z][a-z0-9+.-]*:\/\/|[^>\s]+@[^>\s]+>)[a-zA-Z][^>]*>/g, ''),
    )
    .join('');
}

export function taoExtensions(anhBaseUrl = '') {
  return [
    StarterKit.configure({
      heading: { levels: [2, 3, 4] },
      link: { openOnClick: false, autolink: false },
    }),
    AnhNode.configure({ anhBaseUrl }),
    Markdown,
  ];
}

/** Dựng một Editor (không gắn vào trang nếu không có `element`) từ Markdown đã làm sạch. */
export function taoEditor(md: string, opt: { anhBaseUrl?: string; element?: HTMLElement } = {}): Editor {
  return new Editor({
    element: opt.element,
    extensions: taoExtensions(opt.anhBaseUrl),
    content: lamSachMarkdown(md),
    contentType: 'markdown',
  });
}

export const markdownSangDoc = (md: string) => {
  const e = taoEditor(md);
  try {
    return e.getJSON();
  } finally {
    e.destroy();
  }
};

export const docSangMarkdown = (editor: Editor): string => editor.getMarkdown().trim();

/** Khứ hồi một lần: Markdown → tài liệu → Markdown (dùng trong test và để chuẩn hoá). */
export function khuHoi(md: string): string {
  const e = taoEditor(md);
  try {
    return docSangMarkdown(e);
  } finally {
    e.destroy();
  }
}
