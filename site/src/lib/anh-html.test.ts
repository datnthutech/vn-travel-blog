import { describe, expect, it } from 'vitest';
import { anhHtml, srcsetAnh } from './anh-url';
import { remarkAnh } from './remark-anh';

describe('srcsetAnh', () => {
  it('liệt kê 3 kích cỡ theo định dạng', () => {
    expect(srcsetAnh('abc', 'webp')).toBe('/anh/abc/480.webp 480w, /anh/abc/960.webp 960w, /anh/abc/1600.webp 1600w');
  });
});

describe('anhHtml', () => {
  it('sinh <picture> AVIF+WebP, width/height, lazy', () => {
    const h = anhHtml('abc', 'Bé chơi cát', { rong: 1600, cao: 1067 });
    expect(h).toContain('type="image/avif"');
    expect(h).toContain('type="image/webp"');
    expect(h).toContain('width="1600" height="1067"');
    expect(h).toContain('loading="lazy"');
    expect(h).toContain('alt="Bé chơi cát"');
  });

  it('escape alt để không chèn được HTML', () => {
    const h = anhHtml('abc', 'a"><script>x</script>', { rong: 10, cao: 10 });
    expect(h).not.toContain('<script>');
    expect(h).toContain('alt="a&quot;&gt;&lt;script&gt;x&lt;/script&gt;"');
  });

  it('mã ảnh có ký tự lạ → ném lỗi (chống chèn đường dẫn)', () => {
    expect(() => anhHtml('../x', 'a', { rong: 1, cao: 1 })).toThrow(/mã ảnh/i);
  });
});

describe('remarkAnh', () => {
  const cay = () => ({
    type: 'root',
    children: [
      { type: 'paragraph', children: [{ type: 'image', url: 'anh:demo-bien', alt: 'Biển sáng' }] },
      { type: 'paragraph', children: [{ type: 'image', url: 'https://x.test/a.jpg', alt: 'Ngoài' }] },
    ],
  });
  const layMeta = async () => ({ rong: 1600, cao: 1067 });

  it('thay ảnh anh:MÃ bằng <picture>, giữ nguyên ảnh thường', async () => {
    const t: any = cay();
    await remarkAnh({ layMeta })()(t);
    expect(t.children[0].children[0]).toMatchObject({ type: 'html' });
    expect(t.children[0].children[0].value).toContain('/anh/demo-bien/960.webp');
    expect(t.children[1].children[0]).toMatchObject({ type: 'image', url: 'https://x.test/a.jpg' });
  });

  it('thiếu meta ảnh → ném lỗi nêu mã (build dừng)', async () => {
    const t: any = cay();
    await expect(remarkAnh({ layMeta: async () => { throw new Error('Ảnh "demo-bien": không tải được'); } })()(t)).rejects.toThrow(/demo-bien/);
  });
});
