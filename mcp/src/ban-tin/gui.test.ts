// Gửi bản tin cho nhiều người qua service mail: hạn mức Gmail 500 + Brevo 300 (dự phòng 30 mỗi cái), chờ qua ngày, không gửi trùng (Review Focus).
import { beforeEach, describe, expect, it } from 'vitest';
import { moDb, type Db } from '../db/ket-noi';
import { taoDichVuMail, type DichVuMail, type Transport } from '../mail/dich-vu';
import { themNhaCungCap } from '../mail/nha-cung-cap';
import { dangKyBoLocBanTin, tienDo, xepHangGui } from './gui';
import { dangKy, huy, xacNhan, xoaNguoiDangKy } from './kho';

const KHOA = 'c'.repeat(64);
const NGAY = 24 * 60 * 60_000;
let db: Db;
let now: number;
let dv: DichVuMail;
let daGui: string[];

const them = (ten: string, gioiHan: number, laChinh: boolean, thuTu = 0) =>
  themNhaCungCap(db, KHOA, { ten, host: `smtp.${ten}.test`, cong: 465, baoMat: 'ssl', taiKhoan: `u@${ten}.test`, matKhau: `mk-${ten}-rat-bi-mat`, diaChiGui: `blog@${ten}.test`, gioiHanNgay: gioiHan, duPhongQuanTrong: 30, thuTu, laChinh, bat: true });
const banTin = (ngonNgu = 'vi') => Number(db.prepare("INSERT INTO ban_tin (tieu_de, noi_dung, ngon_ngu, loai, trang_thai, tao_luc) VALUES ('Tin', 'Nội dung', ?, 'tu-soan', 'nhap', 0)").run(ngonNgu).lastInsertRowid);
const nguoi = (email: string, ngonNgu = 'vi') => {
  xacNhan(db, dangKy(db, email, ngonNgu, 0).token!, 1);
  return (db.prepare('SELECT token_huy FROM nguoi_dang_ky WHERE email = ?').get(email) as { token_huy: string }).token_huy;
};
const xep = (id: number) => xepHangGui(db, dv, { banTinId: id, publicBaseUrl: 'https://x.vn', nguoiGuiId: 1, now: () => now });
/** Chạy hàng đợi tới khi không gửi thêm được nữa. */
async function chayHetHomNay() {
  for (;;) if ((await dv.xuLyHangDoi()).daGui === 0) return;
}

beforeEach(() => {
  db = moDb(':memory:');
  now = Date.UTC(2026, 9, 21, 3, 0, 0);
  daGui = [];
  dv = taoDichVuMail(db, { khoaBiMat: KHOA, now: () => now, taoTransport: (): Transport => ({ sendMail: async (o) => void daGui.push(o.to) }) });
  dangKyBoLocBanTin(db, dv);
});

describe('hạn mức và chờ qua ngày', () => {
  it('1 200 người, Gmail 500 + Brevo 300, dự phòng 30 mỗi cái → hôm nay đúng 740; hôm sau gửi tiếp 460 còn lại; mỗi người đúng 1 mail (Review Focus)', async () => {
    them('gmail', 500, true);
    them('brevo', 300, false, 1);
    const SO = 1200;
    db.transaction(() => {
      for (let i = 0; i < SO; i++) {
        db.prepare("INSERT INTO nguoi_dang_ky (email, ngon_ngu, trang_thai, token_xac_nhan_bam, token_huy, tao_luc, gui_xac_nhan_cuoi_luc) VALUES (?, 'vi', 'da-xac-nhan', ?, ?, 0, 0)").run(`u${i}@x.vn`, `x${i}`, `h${i}`);
      }
    })();
    const id = banTin();
    expect(xep(id)).toEqual({ soNguoiNhan: SO, moiXep: SO });
    await chayHetHomNay();
    expect(daGui).toHaveLength(740);
    expect(tienDo(db, id)).toMatchObject({ tong: SO, daGui: 740, dangCho: 460 });
    expect((db.prepare('SELECT trang_thai FROM ban_tin WHERE id = ?').get(id) as { trang_thai: string }).trang_thai).toBe('dang-gui');
    now += NGAY; // sang ngày VN kế tiếp
    await chayHetHomNay();
    expect(daGui).toHaveLength(1200);
    expect(new Set(daGui).size).toBe(1200); // không ai nhận 2 lần
    expect(tienDo(db, id)).toMatchObject({ tong: SO, daGui: SO, dangCho: 0, boQua: 0 });
    expect((db.prepare('SELECT trang_thai FROM ban_tin WHERE id = ?').get(id) as { trang_thai: string }).trang_thai).toBe('da-gui');
  }, 60_000);
});

describe('không xếp trùng', () => {
  it('bấm "Gửi" hai lần → lần hai không xếp thêm; người mới xác nhận sau đó thì được xếp bổ sung đúng 1 mail', () => {
    them('gmail', 500, true);
    nguoi('a@x.vn');
    nguoi('b@x.vn');
    const id = banTin();
    expect(xep(id)).toEqual({ soNguoiNhan: 2, moiXep: 2 });
    expect(xep(id)).toEqual({ soNguoiNhan: 2, moiXep: 0 });
    expect((db.prepare("SELECT count(*) AS n FROM mail_hang_doi").get() as { n: number }).n).toBe(2);
    nguoi('c@x.vn');
    expect(xep(id)).toEqual({ soNguoiNhan: 3, moiXep: 1 });
  });

  it('chỉ gửi người đã xác nhận VÀ cùng ngôn ngữ với bản tin; mail có header huỷ riêng của từng người', () => {
    nguoi('vi@x.vn');
    nguoi('en@x.vn', 'en');
    dangKy(db, 'cho@x.vn', 'vi', 0); // chưa xác nhận
    const daHuy = nguoi('huy@x.vn');
    huy(db, daHuy, 2);
    xep(banTin('vi'));
    const mails = db.prepare('SELECT den, headers FROM mail_hang_doi').all() as { den: string; headers: string }[];
    expect(mails.map((m) => m.den)).toEqual(['vi@x.vn']);
    const th = (db.prepare("SELECT token_huy FROM nguoi_dang_ky WHERE email = 'vi@x.vn'").get() as { token_huy: string }).token_huy;
    expect(JSON.parse(mails[0]!.headers)['List-Unsubscribe']).toBe(`<https://x.vn/api/cong-khai/ban-tin/huy?token=${th}>`);
    expect(JSON.parse(mails[0]!.headers)['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
  });
});

describe('không có người nhận', () => {
  it('gửi khi chưa ai (cùng ngôn ngữ) xác nhận → không xếp gì và bản nháp VẪN là nháp, sửa/gửi lại được', () => {
    nguoi('en@x.vn', 'en');
    const id = banTin('vi');
    expect(xep(id)).toEqual({ soNguoiNhan: 0, moiXep: 0 });
    expect(tienDo(db, id).dangCho).toBe(0);
    expect((db.prepare('SELECT trang_thai FROM ban_tin WHERE id = ?').get(id) as { trang_thai: string }).trang_thai).toBe('nhap');
    nguoi('vi@x.vn');
    expect(xep(id)).toEqual({ soNguoiNhan: 1, moiXep: 1 });
  });
});

describe('người huỷ trong lúc đang gửi', () => {
  it('mail chưa đi của người đã huỷ (hoặc bị xoá) bị bỏ ở bước truocKhiGui; mail người khác vẫn đi', async () => {
    them('gmail', 500, true);
    const thHuy = nguoi('huy@x.vn');
    nguoi('xoa@x.vn');
    nguoi('con@x.vn');
    const id = banTin();
    xep(id);
    huy(db, thHuy, 5);
    expect(xoaNguoiDangKy(db, (db.prepare("SELECT id FROM nguoi_dang_ky WHERE email = 'xoa@x.vn'").get() as { id: number }).id)).toBe(true);
    await chayHetHomNay();
    expect(daGui).toEqual(['con@x.vn']);
    expect(tienDo(db, id)).toMatchObject({ tong: 2, daGui: 1, boQua: 1, dangCho: 0 }); // người bị xoá: dòng ban_tin_gui mất theo (CASCADE), mail của họ đã bị bỏ khi xoá
  });

  it('mail không thuộc bản tin (ví dụ đặt lại mật khẩu) không bị bộ lọc đụng tới', async () => {
    them('gmail', 500, true);
    dv.gui({ loai: 'quan-trong', den: 'khac@x.vn', tieuDe: 'Khác', html: '<p>x</p>', text: 'x' });
    await chayHetHomNay();
    expect(daGui).toEqual(['khac@x.vn']);
  });
});
