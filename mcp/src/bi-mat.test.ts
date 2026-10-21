// Mã hoá bí mật AES-256-GCM và ngày giờ Việt Nam.
import { describe, expect, it } from 'vitest';
import { docBiMat, giaiMa, luuBiMat, maHoa } from './bi-mat';
import { moDb } from './db/ket-noi';
import { ngayVN } from './mail/ngay-vn';

const K1 = 'a'.repeat(64);
const K2 = 'b'.repeat(64);

describe('maHoa / giaiMa', () => {
  it('mã hoá rồi giải mã đúng; mỗi lần ra chuỗi khác nhau (IV ngẫu nhiên); bản mã không chứa bản rõ', () => {
    const a = maHoa(K1, 'mat-khau-smtp');
    expect(giaiMa(K1, a)).toBe('mat-khau-smtp');
    expect(maHoa(K1, 'mat-khau-smtp')).not.toBe(a);
    expect(a).not.toContain('mat-khau-smtp');
  });

  it('sai khoá hoặc dữ liệu bị sửa → ném lỗi (không trả rác)', () => {
    const a = maHoa(K1, 'bi-mat');
    expect(() => giaiMa(K2, a)).toThrow();
    const hong = a.slice(0, -2) + (a.endsWith('AA') ? 'BB' : 'AA');
    expect(() => giaiMa(K1, hong)).toThrow();
    expect(() => giaiMa(K1, 'ngan')).toThrow();
  });

  it('khoá không đúng 64 hex → lỗi', () => {
    expect(() => maHoa('abc', 'x')).toThrow(/64/);
  });

  it('luuBiMat/docBiMat: lưu mã hoá trong bảng bi_mat, đọc lại đúng; thiếu → null', () => {
    const db = moDb(':memory:');
    luuBiMat(db, K1, 'ai_api_key', 'sk-ant-xyz');
    const tho = (db.prepare("SELECT gia_tri_ma_hoa FROM bi_mat WHERE khoa = 'ai_api_key'").get() as { gia_tri_ma_hoa: string }).gia_tri_ma_hoa;
    expect(tho).not.toContain('sk-ant');
    expect(docBiMat(db, K1, 'ai_api_key')).toBe('sk-ant-xyz');
    expect(docBiMat(db, K1, 'khong-co')).toBeNull();
    luuBiMat(db, K1, 'ai_api_key', 'moi');
    expect(docBiMat(db, K1, 'ai_api_key')).toBe('moi');
  });
});

describe('ngayVN (Review Focus 4)', () => {
  it('17:00 UTC là 0 giờ ngày hôm sau theo giờ Việt Nam, bất kể TZ máy', () => {
    expect(ngayVN(Date.UTC(2026, 9, 21, 16, 59, 59))).toBe('2026-10-21');
    expect(ngayVN(Date.UTC(2026, 9, 21, 17, 0, 0))).toBe('2026-10-22');
    expect(ngayVN(Date.UTC(2026, 11, 31, 17, 0, 0))).toBe('2027-01-01');
  });
});
