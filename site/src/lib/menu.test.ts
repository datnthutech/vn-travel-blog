import { describe, expect, it } from 'vitest';
import { giaiMenuViTri, MENU_MAC_DINH } from './menu';

describe('menu mặc định', () => {
  it('khi không có menu.json: không có mục nào (giữ nguyên giao diện cũ: chỉ có tên blog)', () => {
    expect(MENU_MAC_DINH).toEqual({ dauTrang: [], chanTrang: [] });
    const d = { chuyenMuc: [], tinh: [], trang: [], bai: [] };
    expect(giaiMenuViTri('dauTrang', d, MENU_MAC_DINH)).toEqual([]);
    expect(giaiMenuViTri('chanTrang', d, MENU_MAC_DINH)).toEqual([]);
  });
});
