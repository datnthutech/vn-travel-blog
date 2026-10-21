import { describe, expect, it } from 'vitest';
import { coNoindex } from './noindex';

describe('coNoindex', () => {
  it('mặc định bật noindex toàn site (cho tới khi chủ blog gỡ)', () => {
    expect(coNoindex({ BUILD_TARGET: 'production' })).toBe(true);
  });
  it('production + NOINDEX_ALL=false → cho Google lập chỉ mục', () => {
    expect(coNoindex({ BUILD_TARGET: 'production', NOINDEX_ALL: 'false' })).toBe(false);
  });
  it('bản preview luôn noindex dù NOINDEX_ALL=false', () => {
    expect(coNoindex({ BUILD_TARGET: 'preview', NOINDEX_ALL: 'false' })).toBe(true);
    expect(coNoindex({ NOINDEX_ALL: 'false' })).toBe(true);
  });
});
