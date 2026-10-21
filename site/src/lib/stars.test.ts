import { describe, expect, it } from 'vitest';
import { sao } from './stars';

describe('sao', () => {
  it('đổi điểm 1–5 thành chuỗi sao', () => {
    expect(sao(5)).toBe('★★★★★');
    expect(sao(4)).toBe('★★★★☆');
    expect(sao(1)).toBe('★☆☆☆☆');
  });
  it('kẹp điểm ngoài khoảng 1–5', () => {
    expect(sao(0)).toBe('★☆☆☆☆');
    expect(sao(9)).toBe('★★★★★');
  });
});
