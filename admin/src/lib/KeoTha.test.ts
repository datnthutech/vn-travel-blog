// @vitest-environment jsdom
// KeoTha: nút "lên" ở mục đầu bị vô hiệu; sắp xếp xong gọi onDoiThuTu với thứ tự mới.
import { flushSync, mount, unmount } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import KeoTha from './KeoTha.svelte';

const MUC = [{ id: 'a', nhan: 'A' }, { id: 'b', nhan: 'B' }, { id: 'c', nhan: 'C' }];
function dung(onDoiThuTu = vi.fn()) {
  const target = document.createElement('div');
  document.body.append(target);
  const c = mount(KeoTha, { target, props: { muc: MUC, onDoiThuTu } });
  const nut = (loai: 'len' | 'xuong') => [...target.querySelectorAll<HTMLButtonElement>(`button.${loai}`)];
  return { target, nut, onDoiThuTu, huy: () => { unmount(c); target.remove(); } };
}

describe('<KeoTha>', () => {
  it('nút "lên" của mục đầu và nút "xuống" của mục cuối bị vô hiệu, các nút khác bật', () => {
    const k = dung();
    expect(k.nut('len').map((b) => b.disabled)).toEqual([true, false, false]);
    expect(k.nut('xuong').map((b) => b.disabled)).toEqual([false, false, true]);
    k.huy();
  });

  it('bấm "xuống" ở mục A → onDoiThuTu(["b","a","c"]); bấm "lên" ở mục C → ["a","c","b"]', () => {
    const k = dung();
    k.nut('xuong')[0]!.click();
    flushSync();
    expect(k.onDoiThuTu).toHaveBeenLastCalledWith(['b', 'a', 'c']);
    k.nut('len')[2]!.click();
    expect(k.onDoiThuTu).toHaveBeenLastCalledWith(['a', 'c', 'b']);
    expect(k.onDoiThuTu).toHaveBeenCalledTimes(2);
    k.huy();
  });

  it('kéo mục A thả vào vị trí mục C → ["b","c","a"]; thả tại chỗ không gọi gì', () => {
    const k = dung();
    const li = k.target.querySelectorAll('li');
    li[0]!.dispatchEvent(new Event('dragstart', { bubbles: true }));
    li[2]!.dispatchEvent(new Event('drop', { bubbles: true, cancelable: true }));
    expect(k.onDoiThuTu).toHaveBeenLastCalledWith(['b', 'c', 'a']);
    k.onDoiThuTu.mockClear();
    li[1]!.dispatchEvent(new Event('dragstart', { bubbles: true }));
    li[1]!.dispatchEvent(new Event('drop', { bubbles: true, cancelable: true }));
    expect(k.onDoiThuTu).not.toHaveBeenCalled();
    k.huy();
  });
});
