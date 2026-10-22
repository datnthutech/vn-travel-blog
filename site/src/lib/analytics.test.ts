import { describe, expect, it } from 'vitest';
import { goatcounterScript } from './analytics';

describe('goatcounterScript', () => {
  it('có mã trong Cài đặt site → chỉ production có script; preview thì không', () => {
    const cd = { goatcounterCode: 'vntraveltips' };
    expect(goatcounterScript({ BUILD_TARGET: 'production' }, cd)).toEqual({ endpoint: 'https://vntraveltips.goatcounter.com/count', src: 'https://gc.zgo.at/count.js' });
    expect(goatcounterScript({ BUILD_TARGET: 'preview' }, cd)).toBeNull();
  });
  it('có cài đặt nhưng không có mã → không script, dù env có GOATCOUNTER_CODE (env chỉ là giá trị khởi tạo)', () => {
    expect(goatcounterScript({ BUILD_TARGET: 'production', GOATCOUNTER_CODE: 'cu' }, { goatcounterCode: undefined })).toBeNull();
  });
  it('chưa có cai-dat.json (null) → dùng env như trước', () => {
    expect(goatcounterScript({ BUILD_TARGET: 'production', GOATCOUNTER_CODE: 'cu' }, null)?.endpoint).toBe('https://cu.goatcounter.com/count');
    expect(goatcounterScript({ BUILD_TARGET: 'production' }, null)).toBeNull();
  });
  it('mã sai dạng → không script', () => {
    expect(goatcounterScript({ BUILD_TARGET: 'production' }, { goatcounterCode: 'A B' })).toBeNull();
  });
});
