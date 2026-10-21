import { describe, expect, it } from 'vitest';
import { duongDanRedirectHopLe, kiemTraRedirects } from './redirects';

const bai = [
  { slug: 'a', tinh: 'vung-tau' },
  { slug: 'top' },
];

describe('kiemTraRedirects', () => {
  it('không có redirect → mảng rỗng', () => {
    expect(kiemTraRedirects(bai, [])).toEqual([]);
  });

  it('redirect hợp lệ → trả lại đúng danh sách', () => {
    const r = [{ tu: '/kinh-nghiem/a/', den: '/vung-tau/a/' }];
    expect(kiemTraRedirects(bai, r)).toEqual(r);
  });

  it('den trỏ tới URL không có bài → throw', () => {
    expect(() => kiemTraRedirects(bai, [{ tu: '/cu/', den: '/khong-co/x/' }])).toThrow(/khong-co/);
  });

  it('chuyển hướng dây chuyền (đích của cái này là nguồn của cái kia) → throw', () => {
    expect(() =>
      kiemTraRedirects(bai, [
        { tu: '/cu/', den: '/kinh-nghiem/top/' },
        { tu: '/kinh-nghiem/top/', den: '/vung-tau/a/' },
      ]),
    ).toThrow();
  });

  it('tu trùng URL của một bài đang có → throw (sẽ đè bài thật)', () => {
    expect(() => kiemTraRedirects(bai, [{ tu: '/vung-tau/a/', den: '/kinh-nghiem/top/' }])).toThrow(/đè/);
  });

  it('tu trùng nhau → throw', () => {
    expect(() =>
      kiemTraRedirects(bai, [
        { tu: '/cu/', den: '/vung-tau/a/' },
        { tu: '/cu/', den: '/kinh-nghiem/top/' },
      ]),
    ).toThrow(/trùng/);
  });

  it('đường dẫn có ký tự lạ (CRLF, dấu nháy, khoảng trắng) → throw', () => {
    for (const tu of ['/cu/"; return 200; "', '/cu/\r\nSet-Cookie: x=1', '/cu /x/', '//evil.example/', 'cu/']) {
      expect(() => kiemTraRedirects(bai, [{ tu, den: '/vung-tau/a/' }]), tu).toThrow();
    }
  });
});

describe('duongDanRedirectHopLe', () => {
  it('chỉ nhận đường dẫn tương đối-gốc, kết thúc bằng /, ký tự an toàn', () => {
    expect(duongDanRedirectHopLe('/vung-tau/a/')).toBe(true);
    expect(duongDanRedirectHopLe('/')).toBe(true);
    for (const x of ['', 'a/', '/a', '/a b/', '/a/../b/', '//a/', 'https://x/', '/a?b=1/', '/A/']) {
      expect(duongDanRedirectHopLe(x), x).toBe(false);
    }
  });
});
