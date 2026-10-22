import { beforeEach, describe, expect, it } from 'vitest';
import { moDb, type Db } from '../db/ket-noi';
import { luuBai } from '../noi-dung/bai';
import { baiDayDu } from '../admin-api/thu-nghiem';
import type { BaiViet } from '@vntraveltips/schema';
import { bamGiaTri, chan, daBiChan, doiTrangThai, lietKeHien, themBinhLuan, xoa } from './kho';

let db: Db;
let baiId: number;
const them = (over: Partial<Parameters<typeof themBinhLuan>[1]> = {}, now = Date.now) =>
  themBinhLuan(db, { baiId, ngonNgu: 'vi', ten: 'An', email: 'an@x.vn', noiDung: 'Hay quá', ipBam: 'ip1', trangThai: 'hien', ...over }, now);
beforeEach(() => {
  db = moDb(':memory:');
  baiId = luuBai(db, { ngonNgu: 'vi', bai: baiDayDu('a') as unknown as BaiViet, noiDung: 'x', trangThai: 'da-dang' }).id;
});

describe('kho bình luận', () => {
  it('trả lời của trả lời (cấp 2) → lưu thành trả lời của cha cấp 1 (giữ 1 cấp)', () => {
    const cha = them({ noiDung: 'cha' });
    const con = them({ chaId: cha.id, noiDung: 'con' });
    const chau = them({ chaId: con.id, noiDung: 'cháu' });
    expect(con.chaId).toBe(cha.id);
    expect(chau.chaId).toBe(cha.id);
  });

  it('trả lời bình luận của bài khác / không tồn tại → lỗi', () => {
    const bai2 = luuBai(db, { ngonNgu: 'vi', bai: baiDayDu('b') as unknown as BaiViet, noiDung: 'x', trangThai: 'da-dang' }).id;
    const khac = themBinhLuan(db, { baiId: bai2, ngonNgu: 'vi', ten: 'B', email: 'b@x.vn', noiDung: 'x', ipBam: 'i', trangThai: 'hien' });
    expect(() => them({ chaId: khac.id })).toThrow();
    expect(() => them({ chaId: 9999 })).toThrow();
  });

  it('xoá cha → con biến mất; xoá con không ảnh hưởng cha', () => {
    const cha = them();
    const con = them({ chaId: cha.id });
    expect(xoa(db, con.id)).toBe(true);
    expect(db.prepare('SELECT count(*) AS n FROM binh_luan').get()).toEqual({ n: 1 });
    const con2 = them({ chaId: cha.id });
    expect(xoa(db, cha.id)).toBe(true);
    expect(db.prepare('SELECT count(*) AS n FROM binh_luan').get()).toEqual({ n: 0 });
    expect(xoa(db, con2.id)).toBe(false);
  });

  it('lietKeHien: KHÔNG có email, KHÔNG có bình luận ẩn/chờ xem; cha trước, con ngay sau cha, cũ → mới', () => {
    let t = 1000;
    const c1 = them({ noiDung: 'một' }, () => t++);
    const c2 = them({ noiDung: 'hai' }, () => t++);
    them({ chaId: c1.id, noiDung: 'con của một', laTacGia: true }, () => t++);
    them({ noiDung: 'bị ẩn', trangThai: 'an' }, () => t++);
    them({ noiDung: 'chờ xem', trangThai: 'cho-xem', lyDoChoXem: '3 link' }, () => t++);
    them({ chaId: c2.id, noiDung: 'con của hai' }, () => t++);
    const ds = lietKeHien(db, baiId, 'vi');
    expect(ds.map((x) => x.noiDung)).toEqual(['một', 'con của một', 'hai', 'con của hai']);
    expect(ds[1]).toMatchObject({ laTacGia: true, chaId: c1.id });
    expect(JSON.stringify(ds)).not.toMatch(/email|an@x\.vn|ip1/);
  });

  it('con của cha bị ẩn không hiện; hiện lại cha thì hiện con; ngôn ngữ khác không lẫn', () => {
    const cha = them({ noiDung: 'cha' });
    them({ chaId: cha.id, noiDung: 'con' });
    them({ ngonNgu: 'en', noiDung: 'english' });
    doiTrangThai(db, cha.id, 'an');
    expect(lietKeHien(db, baiId, 'vi')).toEqual([]);
    doiTrangThai(db, cha.id, 'hien');
    expect(lietKeHien(db, baiId, 'vi').map((x) => x.noiDung)).toEqual(['cha', 'con']);
    expect(lietKeHien(db, baiId, 'en').map((x) => x.noiDung)).toEqual(['english']);
  });

  it('chặn: chỉ lưu BĂM có muối (không lưu email/IP thô), không phân biệt hoa/thường', () => {
    chan(db, 'k'.repeat(64), 'email', 'Spam@X.vn');
    expect(daBiChan(db, 'k'.repeat(64), 'email', 'spam@x.vn')).toBe(true);
    expect(daBiChan(db, 'k'.repeat(64), 'email', 'khac@x.vn')).toBe(false);
    expect(daBiChan(db, 'khoa-khac', 'email', 'spam@x.vn')).toBe(false); // khác muối → khác băm
    expect(daBiChan(db, 'k'.repeat(64), 'ip', 'spam@x.vn')).toBe(false); // khác loại
    expect(JSON.stringify(db.prepare('SELECT * FROM chan_binh_luan').all())).not.toMatch(/spam|x\.vn/i);
    expect(bamGiaTri('k', 'ip', '1.2.3.4')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('xoá bài kéo theo xoá bình luận', () => {
    them();
    db.prepare('DELETE FROM bai WHERE id = ?').run(baiId);
    expect(db.prepare('SELECT count(*) AS n FROM binh_luan').get()).toEqual({ n: 0 });
  });
});
