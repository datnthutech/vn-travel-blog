// @vitest-environment jsdom
// Khứ hồi Markdown ↔ trình soạn thảo TipTap: thân bài của mọi bài mẫu phải giữ nguyên ngữ nghĩa; ảnh luôn là `anh:MÃ`.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { khuHoi, lamSachMarkdown } from './markdown';

const THU_MUC = join(import.meta.dirname, '../../../../site/src/content/bai-viet');
// Bỏ frontmatter, giữ thân bài.
const than = (f: string) => readFileSync(join(THU_MUC, f), 'utf8').replace(/^---[\s\S]*?\n---\r?\n/, '').trim();
// Chuẩn hoá khoảng trắng để so sánh ngữ nghĩa: dòng trống thừa, khoảng trắng cuối dòng.
const chuanHoa = (s: string) => s.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim();

describe('khứ hồi trên bài mẫu', () => {
  const files = readdirSync(THU_MUC).filter((f) => f.endsWith('.md'));
  it('có bài mẫu để kiểm tra', () => expect(files.length).toBeGreaterThan(0));
  for (const f of files) {
    it(`giữ nguyên thân bài: ${f}`, () => {
      expect(chuanHoa(khuHoi(than(f)))).toBe(chuanHoa(than(f)));
    });
  }
});

describe('các cú pháp thường dùng', () => {
  const GIU = [
    '## Tiêu đề cấp 2',
    '### Tiêu đề cấp 3',
    'Đoạn có **đậm**, *nghiêng* và [liên kết nội bộ](/vung-tau/bai-khac/).',
    '- mục một\n- mục hai\n- mục ba',
    '1. bước một\n2. bước hai',
    '> Trích dẫn một dòng',
    '![Bé chơi cát](anh:demo-bien)',
    'Link ngoài [Agoda](https://www.agoda.com/) giữ nguyên.',
  ];
  for (const md of GIU) {
    it(`giữ nguyên: ${md.split('\n')[0]}`, () => expect(chuanHoa(khuHoi(md))).toBe(md));
  }

  it('ảnh `anh:MÃ` vẫn là anh:MÃ (không thành URL http), alt được giữ', () => {
    const ra = khuHoi('Trước\n\n![Phòng khách nhìn ra biển](anh:abc123)\n\nSau');
    expect(ra).toContain('![Phòng khách nhìn ra biển](anh:abc123)');
    expect(ra).not.toMatch(/https?:\/\/[^)]*abc123/);
  });

  it('nhiều ảnh và ảnh liền đoạn văn đều khứ hồi đúng', () => {
    const md = '![a](anh:m1)\n\nvăn bản\n\n![b](anh:m2)';
    expect(chuanHoa(khuHoi(md))).toBe(md);
  });
});

describe('an toàn', () => {
  it('HTML lạ bị bỏ: không giữ <script>, <iframe>, onerror', () => {
    const ra = khuHoi('Xin chào <script>alert(1)</script> bạn\n\n<iframe src="https://x.test"></iframe>\n\n<img src=x onerror=alert(1)>\n\nHết');
    expect(ra).not.toMatch(/<script|<iframe|onerror|alert\(1\)/i);
    expect(ra).toContain('Xin chào');
    expect(ra).toContain('Hết');
  });

  it('lamSachMarkdown giữ autolink <https://…> và code, bỏ thẻ HTML', () => {
    expect(lamSachMarkdown('a <b>b</b> <https://vntraveltips.vn>')).toBe('a b <https://vntraveltips.vn>');
    expect(lamSachMarkdown('<style>x{}</style>ok')).toBe('ok');
  });

  it('javascript: trong link bị loại', () => {
    const ra = khuHoi('[bấm](javascript:alert(1))');
    expect(ra).not.toMatch(/javascript:/i);
    expect(ra).toContain('bấm');
    expect(khuHoi('![x](data:text/html;base64,AAAA) ok')).not.toMatch(/data:/);
  });
});
