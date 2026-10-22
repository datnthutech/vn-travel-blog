import { describe, expect, it } from 'vitest';
import { jsonLdChoScript } from './jsonld';
import { remarkAnToan, urlAnToan } from './remark-an-toan';

describe('urlAnToan', () => {
  it.each([
    ['https://a.vn/', true], ['http://a.vn', true], ['mailto:a@b.c', true], ['tel:0900', true],
    ['/kinh-nghiem/', true], ['#muc-1', true], ['./x', true], ['anh-bien.webp', true],
    ['javascript:alert(1)', false], ['JaVaScRiPt:alert(1)', false], ['java\tscript:alert(1)', false],
    [' javascript:alert(1)', false], ['data:text/html,<b>', false], ['vbscript:x', false],
  ])('%s → %s', (u, ok) => expect(urlAnToan(u)).toBe(ok));

  it('anh:MÃ chỉ hợp lệ cho ảnh', () => {
    expect(urlAnToan('anh:demo-bien', true)).toBe(true);
    expect(urlAnToan('anh:demo-bien')).toBe(false);
  });
});

describe('remarkAnToan', () => {
  it('đổi nút html thành chữ, link/ảnh nguy hiểm thành #, giữ link an toàn và ảnh anh:', () => {
    const cay = {
      type: 'root',
      children: [
        { type: 'html', value: '<script>alert(1)</script>' },
        { type: 'paragraph', children: [
          { type: 'html', value: '<b onmouseover="x">' },
          { type: 'link', url: 'javascript:alert(1)', children: [] },
          { type: 'link', url: 'https://example.com/', children: [] },
          { type: 'image', url: 'anh:demo-bien' },
          { type: 'image', url: 'javascript:alert(2)' },
        ] },
        { type: 'definition', url: 'javascript:alert(3)' },
      ],
    };
    remarkAnToan()()(cay);
    const [khoi, doan, dn] = cay.children as any[];
    expect(khoi).toEqual({ type: 'text', value: '<script>alert(1)</script>' });
    expect(doan.children.map((n: any) => [n.type, n.url ?? n.value])).toEqual([
      ['text', '<b onmouseover="x">'], ['link', '#'], ['link', 'https://example.com/'], ['image', 'anh:demo-bien'], ['image', '#'],
    ]);
    expect(dn.url).toBe('#');
  });
});

describe('jsonLdChoScript', () => {
  it('không còn < > & thô, vẫn parse ra đúng dữ liệu', () => {
    const o = { headline: 'A </script><script>x()</script> & b \u2028' };
    const s = jsonLdChoScript(o);
    expect(s).not.toMatch(/[<>&\u2028]/);
    expect(JSON.parse(s)).toEqual(o);
  });
});
