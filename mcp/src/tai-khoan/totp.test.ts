// TOTP: lệch ±1 bước được, ±2 không; mã dự phòng 10 mã × 10 ký tự.
import { describe, expect, it } from 'vitest';
import { bamMaDuPhong, kiemMaTotp, maTotpHienTai, taoBiMatTotp, taoMaDuPhong } from './totp';

const T = Date.UTC(2026, 9, 21, 3, 0, 15);
const BUOC = 30_000;

describe('totp', () => {
  it('otpauthUrl có issuer VNTravelTips, 6 số, 30 giây, nhãn là email', () => {
    const { biMat, otpauthUrl } = taoBiMatTotp('chu@x.vn');
    expect(biMat).toMatch(/^[A-Z2-7]{32}$/);
    expect(otpauthUrl).toMatch(/^otpauth:\/\/totp\//);
    expect(otpauthUrl).toContain('issuer=VNTravelTips');
    expect(otpauthUrl).toContain('digits=6');
    expect(otpauthUrl).toContain('period=30');
    expect(decodeURIComponent(otpauthUrl)).toContain('chu@x.vn');
    expect(otpauthUrl).toContain(`secret=${biMat}`);
  });

  it('mã đúng ở bước hiện tại và ±1 → đúng; ±2 → sai', () => {
    const { biMat } = taoBiMatTotp('a@x.vn');
    expect(kiemMaTotp(biMat, maTotpHienTai(biMat, T), T)).toBe(true);
    expect(kiemMaTotp(biMat, maTotpHienTai(biMat, T - BUOC), T)).toBe(true);
    expect(kiemMaTotp(biMat, maTotpHienTai(biMat, T + BUOC), T)).toBe(true);
    expect(kiemMaTotp(biMat, maTotpHienTai(biMat, T - 2 * BUOC), T)).toBe(false);
    expect(kiemMaTotp(biMat, maTotpHienTai(biMat, T + 2 * BUOC), T)).toBe(false);
  });

  it('mã sai định dạng → sai, không ném lỗi', () => {
    const { biMat } = taoBiMatTotp('a@x.vn');
    for (const ma of ['', '12345', '1234567', 'abcdef', '12 345']) expect(kiemMaTotp(biMat, ma, T)).toBe(false);
  });

  it('10 mã dự phòng, mỗi mã 10 ký tự, không trùng; băm không phân biệt hoa/thường và dấu cách', () => {
    const ds = taoMaDuPhong();
    expect(ds).toHaveLength(10);
    for (const m of ds) expect(m).toMatch(/^[a-z2-9]{10}$/);
    expect(new Set(ds).size).toBe(10);
    expect(bamMaDuPhong(ds[0]!.toUpperCase())).toBe(bamMaDuPhong(ds[0]!));
    expect(bamMaDuPhong(ds[0]!)).not.toContain(ds[0]!);
  });
});
