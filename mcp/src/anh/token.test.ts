import { describe, expect, it } from 'vitest';
import { dongToken, dungToken, taoToken, trangThaiToken } from './token';

describe('token tải ảnh', () => {
  it('token mới hợp lệ, dài và ngẫu nhiên', () => {
    const a = taoToken();
    const b = taoToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
    expect(dungToken(a)).toBe(true);
    expect(trangThaiToken(a)).toBe('ok');
  });

  it('token lạ → khong-co', () => {
    expect(trangThaiToken('0'.repeat(64))).toBe('khong-co');
    expect(dungToken('')).toBe(false);
  });

  it('hết hạn sau ttl (mặc định 30 phút)', () => {
    const t = taoToken(30 * 60_000, () => 1_000);
    expect(trangThaiToken(t, () => 1_000 + 30 * 60_000 - 1)).toBe('ok');
    expect(trangThaiToken(t, () => 1_000 + 30 * 60_000)).toBe('het-han');
  });

  it('đóng rồi thì không dùng lại được', () => {
    const t = taoToken();
    dongToken(t);
    expect(trangThaiToken(t)).toBe('da-dong');
    expect(dungToken(t)).toBe(false);
  });
});
