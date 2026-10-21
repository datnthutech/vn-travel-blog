import { describe, expect, it } from 'vitest';
import { coQuyen, TAT_CA_HANH_DONG, type HanhDong, type VaiTro } from './quyen';

const TOI = 7;
const nguoi = (vaiTro: VaiTro) => ({ id: TOI, vaiTro });
const CUA_MINH = { tacGiaId: TOI };
const CUA_NGUOI_KHAC = { tacGiaId: 99 };

// Bảng dữ liệu: [hành động, quan-tri, quan-ly, writer (của mình), writer (của người khác)]
const BANG: [HanhDong, boolean, boolean, boolean, boolean][] = [
  ['bai.tao', true, true, true, true],
  ['bai.xem', true, true, true, true],
  ['ban-dich.kiem-tra', true, true, true, true],
  ['anh.tai-len', true, true, true, true],
  ['bai.sua', true, true, true, false],
  ['bai.dang', true, true, true, false],
  ['bai.thung-rac', true, true, true, false],
  ['binh-luan.an-xoa', true, true, true, false],
  ['anh.xoa', true, true, true, false],
  ['bai.xoa-han', true, false, false, false],
  ['cau-truc.sua', true, true, false, false],
  ['cai-dat.sua', true, false, false, false],
  ['tai-khoan.quan-ly', true, false, false, false],
  ['nhat-ky.xem', true, false, false, false],
  ['ban-tin.gui', true, false, false, false],
];

describe('coQuyen — bảng quyền', () => {
  it('bảng dữ liệu phủ ĐÚNG mọi hành động (thêm hành động mà quên bảng này → test đỏ)', () => {
    expect(BANG.map((r) => r[0]).sort()).toEqual([...TAT_CA_HANH_DONG].sort());
  });

  it.each(BANG)('%s → quản trị %s · quản lý %s · writer của mình %s · writer của người khác %s', (hd, qt, ql, wMinh, wKhac) => {
    expect(coQuyen(nguoi('quan-tri'), hd, CUA_MINH), 'quản trị').toBe(qt);
    expect(coQuyen(nguoi('quan-tri'), hd, CUA_NGUOI_KHAC), 'quản trị (của người khác)').toBe(qt);
    expect(coQuyen(nguoi('quan-ly'), hd, CUA_MINH), 'quản lý').toBe(ql);
    expect(coQuyen(nguoi('quan-ly'), hd, CUA_NGUOI_KHAC), 'quản lý (của người khác)').toBe(ql);
    expect(coQuyen(nguoi('writer'), hd, CUA_MINH), 'writer của mình').toBe(wMinh);
    expect(coQuyen(nguoi('writer'), hd, CUA_NGUOI_KHAC), 'writer của người khác').toBe(wKhac);
  });

  it('writer không biết chủ sở hữu (thiếu tacGiaId / null) → coi như KHÔNG phải của mình', () => {
    for (const hd of ['bai.sua', 'bai.dang', 'bai.thung-rac', 'binh-luan.an-xoa', 'anh.xoa'] as const) {
      expect(coQuyen(nguoi('writer'), hd), hd).toBe(false);
      expect(coQuyen(nguoi('writer'), hd, { tacGiaId: null }), hd).toBe(false);
      expect(coQuyen(nguoi('writer'), hd, { tacGiaId: undefined }), hd).toBe(false);
    }
  });

  it('vai trò lạ (dữ liệu hỏng) → không có quyền nào', () => {
    for (const hd of TAT_CA_HANH_DONG) expect(coQuyen({ id: 1, vaiTro: 'khac' as VaiTro }, hd, { tacGiaId: 1 })).toBe(false);
  });
});
