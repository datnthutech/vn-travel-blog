import { describe, expect, it } from 'vitest';
import { doiHtml } from './doi-goc.mjs';

describe('doiHtml — đưa bản demo vào thư mục con', () => {
  const goc = '/vn-travel-blog/';
  it('thêm tiền tố cho href/src/action và từng ảnh trong srcset', () => {
    const ra = doiHtml('<a href="/da-lat/"><img src="/anh/a/960.webp" srcset="/anh/a/480.webp 480w, /anh/a/960.webp 960w"><form action="/api/x">', goc);
    expect(ra).toBe('<a href="/vn-travel-blog/da-lat/"><img src="/vn-travel-blog/anh/a/960.webp" srcset="/vn-travel-blog/anh/a/480.webp 480w, /vn-travel-blog/anh/a/960.webp 960w"><form action="/vn-travel-blog/api/x">');
  });
  it('giữ nguyên link ngoài, //cdn, #neo, đường dẫn tương đối', () => {
    const vao = '<a href="https://x.vn/"></a><script src="//cdn.x/a.js"></script><a href="#faq"></a><a href="a/"></a>';
    expect(doiHtml(vao, goc)).toBe(vao);
  });
  it('báo Pagefind gắn tiền tố vào link kết quả tìm kiếm', () => {
    expect(doiHtml("new PagefindUI({ element: '#t' })", goc)).toBe("new PagefindUI({ baseUrl: '/vn-travel-blog/', element: '#t' })");
  });
});
