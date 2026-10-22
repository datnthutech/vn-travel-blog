// Kho người đăng ký bản tin: đăng ký 2 bước, huỷ idempotent, giới hạn gửi lại mail xác nhận.
import { beforeEach, describe, expect, it } from 'vitest';
import { moDb, type Db } from '../db/ket-noi';
import { dangKy, demDaXacNhan, huy, lietKe, xacNhan, xoaNguoiDangKy } from './kho';

const PHUT = 60_000;
const NGAY = 24 * 60 * PHUT;
let db: Db;
beforeEach(() => {
  db = moDb(':memory:');
});
const dong = (email: string) => db.prepare('SELECT * FROM nguoi_dang_ky WHERE email = ?').get(email) as any;

describe('dangKy', () => {
  it('email mới → cho-xac-nhan, trả token; DB chỉ lưu bản băm của token xác nhận', () => {
    const r = dangKy(db, 'Lan@X.vn ', 'vi', 1000);
    expect(r.canGuiXacNhan).toBe(true);
    expect(r.token).toMatch(/^[0-9a-f]{64}$/);
    const d = dong('lan@x.vn');
    expect(d).toMatchObject({ trang_thai: 'cho-xac-nhan', ngon_ngu: 'vi' });
    expect(d.token_xac_nhan_bam).not.toBe(r.token);
    expect(JSON.stringify(d)).not.toContain(r.token!);
  });

  it('đăng ký 2 lần trong 10 phút → chỉ lần đầu được gửi mail; vẫn 1 dòng (không phân biệt hoa thường)', () => {
    expect(dangKy(db, 'a@x.vn', 'vi', 0).canGuiXacNhan).toBe(true);
    for (let i = 1; i <= 9; i++) expect(dangKy(db, i % 2 ? 'A@x.vn' : 'a@x.vn', 'vi', i * PHUT / 10).canGuiXacNhan).toBe(false);
    expect((db.prepare('SELECT count(*) AS n FROM nguoi_dang_ky').get() as { n: number }).n).toBe(1);
    expect(dangKy(db, 'a@x.vn', 'vi', 10 * PHUT + 1).canGuiXacNhan).toBe(true); // qua 10 phút → gửi lại được
  });

  it('gửi lại mail xác nhận → token mới, token cũ hết tác dụng', () => {
    const t1 = dangKy(db, 'a@x.vn', 'vi', 0).token!;
    const t2 = dangKy(db, 'a@x.vn', 'vi', 11 * PHUT).token!;
    expect(t2).not.toBe(t1);
    expect(xacNhan(db, t1, 12 * PHUT)).toBe(false);
    expect(xacNhan(db, t2, 12 * PHUT)).toBe(true);
  });

  it('email đã xác nhận → không gửi lại, trạng thái giữ nguyên', () => {
    const t = dangKy(db, 'a@x.vn', 'vi', 0).token!;
    xacNhan(db, t, 1);
    expect(dangKy(db, 'a@x.vn', 'vi', NGAY)).toEqual({ canGuiXacNhan: false });
    expect(dong('a@x.vn').trang_thai).toBe('da-xac-nhan');
  });

  it('đăng ký lại email da-huy → về cho-xac-nhan với token mới', () => {
    const t = dangKy(db, 'a@x.vn', 'vi', 0).token!;
    xacNhan(db, t, 1);
    huy(db, dong('a@x.vn').token_huy, 2);
    const r = dangKy(db, 'a@x.vn', 'en', 20 * PHUT);
    expect(r.canGuiXacNhan).toBe(true);
    expect(r.token).not.toBe(t);
    expect(dong('a@x.vn')).toMatchObject({ trang_thai: 'cho-xac-nhan', ngon_ngu: 'en', huy_luc: null, xac_nhan_luc: null });
    expect(xacNhan(db, t, 21 * PHUT)).toBe(false);
  });
});

describe('xacNhan', () => {
  it('đúng token → da-xac-nhan; bấm lần 2 vẫn true; token lạ → false', () => {
    const t = dangKy(db, 'a@x.vn', 'vi', 0).token!;
    expect(xacNhan(db, t, 5)).toBe(true);
    expect(xacNhan(db, t, 6)).toBe(true);
    expect(dong('a@x.vn')).toMatchObject({ trang_thai: 'da-xac-nhan', xac_nhan_luc: 5 });
    expect(xacNhan(db, 'a'.repeat(64), 6)).toBe(false);
    expect(xacNhan(db, '', 6)).toBe(false);
  });

  it('quá 7 ngày → false và vẫn cho-xac-nhan', () => {
    const t = dangKy(db, 'a@x.vn', 'vi', 0).token!;
    expect(xacNhan(db, t, 7 * NGAY + 1)).toBe(false);
    expect(xacNhan(db, t, 7 * NGAY)).toBe(true);
  });

  it('người đã huỷ bấm lại link xác nhận cũ → false (không tự đăng ký lại)', () => {
    const t = dangKy(db, 'a@x.vn', 'vi', 0).token!;
    xacNhan(db, t, 1);
    huy(db, dong('a@x.vn').token_huy, 2);
    expect(xacNhan(db, t, 3)).toBe(false);
    expect(dong('a@x.vn').trang_thai).toBe('da-huy');
  });
});

describe('huy', () => {
  it('huỷ hai lần → cả hai true, thời điểm huỷ giữ lần đầu; token lạ → false', () => {
    dangKy(db, 'a@x.vn', 'vi', 0);
    const th = dong('a@x.vn').token_huy;
    expect(th).toMatch(/^[0-9a-f]{64}$/);
    expect(huy(db, th, 10)).toBe(true);
    expect(huy(db, th, 20)).toBe(true);
    expect(dong('a@x.vn')).toMatchObject({ trang_thai: 'da-huy', huy_luc: 10 });
    expect(huy(db, 'b'.repeat(64), 30)).toBe(false);
    expect(huy(db, '', 30)).toBe(false);
  });
});

describe('lietKe / xoa / đếm', () => {
  it('lọc theo trạng thái, ngôn ngữ, tìm email; phân trang; xoá', () => {
    for (const [e, nn] of [['a@x.vn', 'vi'], ['b@y.vn', 'en'], ['c@x.vn', 'vi']] as const) xacNhan(db, dangKy(db, e, nn, 0).token!, 1);
    dangKy(db, 'd@x.vn', 'vi', 0);
    expect(lietKe(db, {}).tong).toBe(4);
    expect(lietKe(db, { trangThai: 'da-xac-nhan' }).tong).toBe(3);
    expect(lietKe(db, { ngonNgu: 'en' }).nguoi.map((n) => n.email)).toEqual(['b@y.vn']);
    expect(lietKe(db, { q: '@x.vn' }).tong).toBe(3);
    expect(lietKe(db, { q: '%' }).tong).toBe(0); // ký tự LIKE được thoát
    expect(lietKe(db, { trang: 2, moiTrang: 3 }).nguoi).toHaveLength(1);
    expect(JSON.stringify(lietKe(db, {}))).not.toMatch(/token/);
    expect(demDaXacNhan(db)).toBe(3);
    const id = lietKe(db, { q: 'a@x.vn' }).nguoi[0]!.id;
    expect(xoaNguoiDangKy(db, id)).toBe(true);
    expect(xoaNguoiDangKy(db, id)).toBe(false);
    expect(demDaXacNhan(db)).toBe(2);
  });
});
