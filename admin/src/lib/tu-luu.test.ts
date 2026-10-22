import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { taoTuLuu } from './tu-luu';

class Kho {
  d = new Map<string, string>();
  getItem = (k: string) => this.d.get(k) ?? null;
  setItem = (k: string, v: string) => void this.d.set(k, v);
  removeItem = (k: string) => void this.d.delete(k);
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('taoTuLuu', () => {
  it('10 lần doi trong 2 giây → chỉ 1 lần luu với bản cuối, sau 3 giây không gõ', async () => {
    const luu = vi.fn(async () => {});
    const t = taoTuLuu({ luu });
    for (let i = 1; i <= 10; i++) {
      t.doi({ n: i });
      await vi.advanceTimersByTimeAsync(200);
    }
    expect(luu).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(3000);
    expect(luu).toHaveBeenCalledTimes(1);
    expect(luu).toHaveBeenCalledWith({ n: 10 });
  });

  it('đang gửi mà có thay đổi mới → gửi tiếp bản mới sau khi lần trước xong (không gửi chồng)', async () => {
    let xong!: () => void;
    const luu = vi.fn(() => new Promise<void>((r) => (xong = r)));
    const t = taoTuLuu({ luu });
    t.doi({ n: 1 });
    await vi.advanceTimersByTimeAsync(3000);
    expect(luu).toHaveBeenCalledTimes(1);
    t.doi({ n: 2 });
    await vi.advanceTimersByTimeAsync(5000);
    expect(luu).toHaveBeenCalledTimes(1); // vẫn đang chờ lần đầu xong
    xong();
    await vi.advanceTimersByTimeAsync(0);
    expect(luu).toHaveBeenCalledTimes(2);
    expect(luu).toHaveBeenLastCalledWith({ n: 2 });
  });

  it('luu ném lỗi mạng → giữ bản trong localStorage (vtt-nhap-<id>), báo "loi"; lần doi kế tiếp gửi lại; thành công thì xoá bản giữ', async () => {
    const kho = new Kho();
    const trangThai: string[] = [];
    let hong = true;
    const luu = vi.fn(async () => {
      if (hong) throw new Error('mất mạng');
    });
    const t = taoTuLuu({ luu, khoa: 'vtt-nhap-7', kho, khiDoiTrangThai: (s) => trangThai.push(s) });
    t.doi({ n: 1 });
    await vi.advanceTimersByTimeAsync(3000);
    expect(JSON.parse(kho.getItem('vtt-nhap-7')!)).toEqual({ n: 1 });
    expect(trangThai.at(-1)).toBe('loi');
    hong = false;
    t.doi({ n: 2 });
    await vi.advanceTimersByTimeAsync(3000);
    expect(luu).toHaveBeenCalledTimes(2);
    expect(luu).toHaveBeenLastCalledWith({ n: 2 });
    expect(kho.getItem('vtt-nhap-7')).toBeNull();
    expect(trangThai.at(-1)).toBe('da-luu');
  });

  it('dungNgay gửi ngay bản mới nhất và chờ xong; không có gì chờ thì không gửi', async () => {
    const luu = vi.fn(async () => {});
    const t = taoTuLuu({ luu });
    await t.dungNgay();
    expect(luu).not.toHaveBeenCalled();
    t.doi({ n: 5 });
    await t.dungNgay();
    expect(luu).toHaveBeenCalledWith({ n: 5 });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(luu).toHaveBeenCalledTimes(1); // hẹn giờ cũ đã bị huỷ
  });

  it('localStorage hỏng/không dùng được cũng không làm tự lưu văng lỗi', async () => {
    const kho = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); }, removeItem: () => { throw new Error('x'); } };
    const t = taoTuLuu({ luu: async () => { throw new Error('mạng'); }, khoa: 'k', kho });
    t.doi({ n: 1 });
    await expect(vi.advanceTimersByTimeAsync(3000)).resolves.not.toThrow();
  });
});
