import { describe, expect, it } from 'vitest';
import { caiDatSiteMacDinh, caiDatSiteSchema } from './cai-dat';

describe('caiDatSiteMacDinh (env chỉ là giá trị khởi tạo)', () => {
  it('không có env → chặn lập chỉ mục, không GoatCounter, quảng cáo tắt', () => {
    const c = caiDatSiteMacDinh({});
    expect(c).toMatchObject({ tenSite: 'VNTravelTips', choPhepLapChiMuc: false, quangCao: { bat: false }, muiGio: 'Asia/Ho_Chi_Minh' });
    expect(c.goatcounterCode).toBeUndefined();
  });
  it('NOINDEX_ALL=true → vẫn chặn; =false → cho phép; GOATCOUNTER_CODE hợp lệ được lấy, sai dạng bị bỏ', () => {
    expect(caiDatSiteMacDinh({ NOINDEX_ALL: 'true' }).choPhepLapChiMuc).toBe(false);
    expect(caiDatSiteMacDinh({ NOINDEX_ALL: 'false' }).choPhepLapChiMuc).toBe(true);
    expect(caiDatSiteMacDinh({ GOATCOUNTER_CODE: 'vntraveltips' }).goatcounterCode).toBe('vntraveltips');
    expect(caiDatSiteMacDinh({ GOATCOUNTER_CODE: 'sai dạng!' }).goatcounterCode).toBeUndefined();
  });
});

describe('caiDatSiteSchema', () => {
  const co = caiDatSiteMacDinh({});
  it('mạng xã hội http:// hoặc không phải URL → lỗi; https:// → hợp lệ', () => {
    expect(caiDatSiteSchema.safeParse({ ...co, mangXaHoi: { facebook: 'http://facebook.com/x' } }).success).toBe(false);
    expect(caiDatSiteSchema.safeParse({ ...co, mangXaHoi: { facebook: 'javascript:alert(1)' } }).success).toBe(false);
    expect(caiDatSiteSchema.safeParse({ ...co, mangXaHoi: { facebook: 'https://facebook.com/x' } }).success).toBe(true);
  });
  it('tên rỗng, mô tả quá dài, mã GoatCounter lạ, múi giờ khác, vị trí quảng cáo lạ → lỗi', () => {
    expect(caiDatSiteSchema.safeParse({ ...co, tenSite: '' }).success).toBe(false);
    expect(caiDatSiteSchema.safeParse({ ...co, moTaMacDinh: 'x'.repeat(301) }).success).toBe(false);
    expect(caiDatSiteSchema.safeParse({ ...co, goatcounterCode: 'A B' }).success).toBe(false);
    expect(caiDatSiteSchema.safeParse({ ...co, muiGio: 'UTC' }).success).toBe(false);
    expect(caiDatSiteSchema.safeParse({ ...co, quangCao: { bat: true, viTri: ['dau-trang'] } }).success).toBe(false);
  });
});
