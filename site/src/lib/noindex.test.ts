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

describe('coNoindex theo Cài đặt site (cai-dat.json)', () => {
  it('có cài đặt: choPhepLapChiMuc quyết định ở production, NOINDEX_ALL không còn tác dụng', () => {
    expect(coNoindex({ BUILD_TARGET: 'production', NOINDEX_ALL: 'false' }, { choPhepLapChiMuc: false })).toBe(true);
    expect(coNoindex({ BUILD_TARGET: 'production', NOINDEX_ALL: 'true' }, { choPhepLapChiMuc: true })).toBe(false);
  });
  it('preview luôn noindex dù cài đặt cho phép', () => {
    expect(coNoindex({ BUILD_TARGET: 'preview' }, { choPhepLapChiMuc: true })).toBe(true);
  });
});
