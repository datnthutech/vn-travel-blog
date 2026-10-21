import { describe, expect, it } from 'vitest';
import { duongDanMuc, giaiMenu, loiMenu, menuSchema } from './menu';

const du = { chuyenMuc: ['an-uong'], tinh: ['vung-tau'], trang: ['gioi-thieu'], bai: [{ slug: 'a', tinh: 'vung-tau' }, { slug: 'b' }] };
const ok = { dauTrang: [{ nhan: 'Ăn uống', loai: 'chuyen-muc' as const, giaTri: 'an-uong' }], chanTrang: [] };

describe('menuSchema', () => {
  it('menu hợp lệ 1 cấp con', () => {
    const m = { dauTrang: [{ nhan: 'Điểm đến', loai: 'link', giaTri: '/', con: [{ nhan: 'Vũng Tàu', loai: 'tinh', giaTri: 'vung-tau' }] }], chanTrang: [] };
    expect(menuSchema.safeParse(m).success).toBe(true);
    expect(menuSchema.safeParse(ok).success).toBe(true);
  });

  it('lồng 2 cấp (con của con) → lỗi', () => {
    const m = { dauTrang: [{ nhan: 'A', loai: 'link', giaTri: '/', con: [{ nhan: 'B', loai: 'link', giaTri: '/b/', con: [{ nhan: 'C', loai: 'link', giaTri: '/c/' }] }] }], chanTrang: [] };
    const r = menuSchema.safeParse(m);
    expect(r.success).toBe(false);
    expect(loiMenu(r.error!).join('\n')).toMatch(/dauTrang\.0\.con\.0: menu chỉ được lồng 1 cấp/);
  });

  it('link: javascript:, data:, http:, //host, có khoảng trắng → lỗi; https:// và /đường-dẫn → hợp lệ', () => {
    const thu = (giaTri: string) => menuSchema.safeParse({ dauTrang: [{ nhan: 'x', loai: 'link', giaTri }], chanTrang: [] }).success;
    for (const x of ['javascript:alert(1)', 'data:text/html,x', 'http://x.vn', '//evil.com', '/a b', 'ftp://x.vn', 'JaVaScRiPt:alert(1)']) expect(thu(x), x).toBe(false);
    for (const x of ['https://facebook.com/vntraveltips', '/tim-kiem/', '/']) expect(thu(x), x).toBe(true);
  });

  it('loại không phải link phải có slug hợp lệ; nhãn rỗng/dài; số mục vượt giới hạn; trường lạ → lỗi', () => {
    const thu = (m: object) => menuSchema.safeParse({ dauTrang: [m], chanTrang: [] }).success;
    expect(thu({ nhan: 'x', loai: 'tinh', giaTri: 'Sai Dạng' })).toBe(false);
    expect(thu({ nhan: '', loai: 'tinh', giaTri: 'a' })).toBe(false);
    expect(thu({ nhan: 'x'.repeat(41), loai: 'tinh', giaTri: 'a' })).toBe(false);
    expect(thu({ nhan: 'x', loai: 'la', giaTri: 'a' })).toBe(false);
    expect(thu({ nhan: 'x', loai: 'tinh', giaTri: 'a', html: '<script>' })).toBe(false);
    expect(menuSchema.safeParse({ dauTrang: Array(13).fill({ nhan: 'x', loai: 'tinh', giaTri: 'a' }), chanTrang: [] }).success).toBe(false);
  });
});

describe('duongDanMuc / giaiMenu', () => {
  it('trả URL đúng cho từng loại; đích không tồn tại → null', () => {
    expect(duongDanMuc({ loai: 'chuyen-muc', giaTri: 'an-uong' }, du)).toBe('/chu-de/an-uong/');
    expect(duongDanMuc({ loai: 'tinh', giaTri: 'vung-tau' }, du)).toBe('/vung-tau/');
    expect(duongDanMuc({ loai: 'trang', giaTri: 'gioi-thieu' }, du)).toBe('/gioi-thieu/');
    expect(duongDanMuc({ loai: 'bai', giaTri: 'a' }, du)).toBe('/vung-tau/a/');
    expect(duongDanMuc({ loai: 'bai', giaTri: 'b' }, du)).toBe('/kinh-nghiem/b/');
    expect(duongDanMuc({ loai: 'bai', giaTri: 'khong-co' }, du)).toBeNull();
    expect(duongDanMuc({ loai: 'tinh', giaTri: 'da-lat' }, du)).toBeNull();
    expect(duongDanMuc({ loai: 'link', giaTri: 'javascript:x' }, du)).toBeNull();
  });
  it('giải menu bỏ mục chết; mục cha chết thì mất cả nhóm; mục con chết bị bỏ riêng', () => {
    const r = giaiMenu(
      [
        { nhan: 'Bài chết', loai: 'bai', giaTri: 'chua-dang', con: [{ nhan: 'x', loai: 'tinh', giaTri: 'vung-tau' }] },
        { nhan: 'Điểm đến', loai: 'link', giaTri: '/', con: [{ nhan: 'Vũng Tàu', loai: 'tinh', giaTri: 'vung-tau' }, { nhan: 'Đà Lạt', loai: 'tinh', giaTri: 'da-lat' }] },
      ],
      du,
    );
    expect(r).toEqual([{ nhan: 'Điểm đến', href: '/', con: [{ nhan: 'Vũng Tàu', href: '/vung-tau/' }] }]);
  });
});
