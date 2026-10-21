// Service mail: hạn mức theo ngày giờ VN, dự phòng cho mail quan trọng, tự chuyển nhà cung cấp, tạm bỏ qua khi lỗi.
import { beforeEach, describe, expect, it } from 'vitest';
import { moDb, type Db } from '../db/ket-noi';
import { taoDichVuMail, type DichVuMail, type Transport } from './dich-vu';
import { themNhaCungCap } from './nha-cung-cap';

const KHOA = 'c'.repeat(64);
const PHUT = 60_000;

let db: Db;
let now: number;
let goi: { ncc: string; den: string; matKhau: string }[];
let loiTheo: Record<string, number>; // số lần còn lại sẽ ném lỗi, theo tên nhà cung cấp
let dv: DichVuMail;

const mailThuong = (den: string) => ({ loai: 'thuong' as const, den, tieuDe: 'Chào', html: '<p>x</p>', text: 'x' });
const mailQuanTrong = (den: string) => ({ ...mailThuong(den), loai: 'quan-trong' as const });
const them = (ten: string, gioiHan: number, duPhong: number, laChinh: boolean, thuTu = 0) =>
  themNhaCungCap(db, KHOA, {
    ten, host: `smtp.${ten}.test`, cong: 465, baoMat: 'ssl', taiKhoan: `u@${ten}.test`, matKhau: `mk-${ten}-rat-bi-mat`,
    diaChiGui: `blog@${ten}.test`, gioiHanNgay: gioiHan, duPhongQuanTrong: duPhong, thuTu, laChinh, bat: true,
  });

beforeEach(() => {
  db = moDb(':memory:');
  now = Date.UTC(2026, 9, 21, 3, 0, 0);
  goi = [];
  loiTheo = {};
  dv = taoDichVuMail(db, {
    khoaBiMat: KHOA,
    now: () => now,
    taoTransport: (ncc, matKhau): Transport => ({
      sendMail: async (o) => {
        if ((loiTheo[ncc.ten] ?? 0) > 0) {
          loiTheo[ncc.ten]!--;
          throw new Error(`Đăng nhập SMTP lỗi với mật khẩu ${matKhau}`);
        }
        goi.push({ ncc: ncc.ten, den: o.to, matKhau });
      },
    }),
  });
});

const qua = () => goi.map((g) => g.ncc);

describe('chọn nhà cung cấp theo hạn mức', () => {
  it('Gmail giới hạn 3, dự phòng 1: 3 mail thường → 2 qua Gmail, 1 qua Brevo, nhật ký có dòng chuyển; mail quan trọng thứ 4 vẫn đi Gmail', async () => {
    them('gmail', 3, 1, true);
    them('brevo', 300, 30, false, 1);
    for (const d of ['a', 'b', 'c']) dv.gui(mailThuong(`${d}@x.vn`));
    await dv.xuLyHangDoi();
    expect(qua()).toEqual(['gmail', 'gmail', 'brevo']);
    const chuyen = db.prepare("SELECT count(*) AS n FROM mail_nhat_ky WHERE ket_qua = 'chuyen-nha-cung-cap'").get() as { n: number };
    expect(chuyen.n).toBe(1);
    expect(db.prepare("SELECT count(*) AS n FROM nhat_ky WHERE loai = 'mail-chuyen-nha-cung-cap'").get()).toEqual({ n: 1 });
    dv.gui(mailQuanTrong('d@x.vn'));
    await dv.xuLyHangDoi();
    expect(qua()).toEqual(['gmail', 'gmail', 'brevo', 'gmail']);
    expect(dv.thongKeHomNay().find((t) => t.ten === 'gmail')).toMatchObject({ daGui: 3, gioiHan: 3 });
  });

  it('mail quan-trọng xếp sau vẫn được gửi trước mail thường xếp trước', async () => {
    them('gmail', 100, 10, true);
    dv.gui(mailThuong('thuong@x.vn'));
    dv.gui(mailQuanTrong('quantrong@x.vn'));
    await dv.xuLyHangDoi();
    expect(goi.map((g) => g.den)).toEqual(['quantrong@x.vn', 'thuong@x.vn']);
  });

  it('mỗi lượt gửi tối đa 20 mail; phần còn lại ở hàng đợi', async () => {
    them('gmail', 1000, 0, true);
    for (let i = 0; i < 25; i++) dv.gui(mailThuong(`u${i}@x.vn`));
    expect(await dv.xuLyHangDoi()).toEqual({ daGui: 20, conCho: 5 });
    expect(await dv.xuLyHangDoi()).toEqual({ daGui: 5, conCho: 0 });
  });

  it('nhà cung cấp đang tắt không được dùng', async () => {
    const id = them('gmail', 100, 0, true);
    them('brevo', 100, 0, false, 1);
    db.prepare('UPDATE nha_cung_cap_mail SET bat = 0 WHERE id = ?').run(id);
    dv.gui(mailThuong('a@x.vn'));
    await dv.xuLyHangDoi();
    expect(qua()).toEqual(['brevo']);
  });
});

describe('lỗi và tạm bỏ qua', () => {
  it('Gmail lỗi 3 lần → bỏ qua 15 phút, mail đi Brevo; sau 15 phút Gmail được thử lại', async () => {
    them('gmail', 100, 0, true);
    them('brevo', 100, 0, false, 1);
    loiTheo.gmail = 3;
    for (const d of ['a', 'b', 'c']) dv.gui(mailThuong(`${d}@x.vn`));
    await dv.xuLyHangDoi();
    expect(qua()).toEqual(['brevo', 'brevo', 'brevo']); // mỗi mail thử Gmail (lỗi) rồi qua Brevo
    expect(db.prepare("SELECT count(*) AS n FROM mail_nhat_ky WHERE ket_qua = 'tam-bo-qua'").get()).toEqual({ n: 1 });
    dv.gui(mailThuong('d@x.vn'));
    await dv.xuLyHangDoi();
    expect(qua().at(-1)).toBe('brevo'); // Gmail đang bị bỏ qua dù đã hết lỗi giả lập
    now += 15 * PHUT + 1;
    dv.gui(mailThuong('e@x.vn'));
    await dv.xuLyHangDoi();
    expect(qua().at(-1)).toBe('gmail');
  });

  it('lỗi gửi được ghi nhật ký nhưng KHÔNG chứa mật khẩu SMTP', async () => {
    them('gmail', 100, 0, true);
    loiTheo.gmail = 1;
    dv.gui(mailThuong('a@x.vn'));
    const kq = await dv.xuLyHangDoi();
    expect(kq).toEqual({ daGui: 0, conCho: 1 });
    const toanBo = JSON.stringify(db.prepare('SELECT * FROM mail_nhat_ky').all()) + JSON.stringify(db.prepare('SELECT * FROM mail_hang_doi').all());
    expect(toanBo).toContain('Đăng nhập SMTP lỗi');
    expect(toanBo).not.toContain('mk-gmail-rat-bi-mat');
  });

  it('mail lỗi ở lượt này vẫn nằm trong hàng đợi và được gửi ở lượt sau', async () => {
    them('gmail', 100, 0, true);
    loiTheo.gmail = 1;
    dv.gui(mailThuong('a@x.vn'));
    await dv.xuLyHangDoi();
    expect(goi).toHaveLength(0);
    await dv.xuLyHangDoi();
    expect(qua()).toEqual(['gmail']);
  });
});

describe('Review Focus 4: máy chủ UTC, hạn mức theo ngày giờ Việt Nam', () => {
  it('hết hạn mức → mail ở lại hàng đợi; 17:00 UTC (0 giờ VN) bộ đếm mới → gửi được', async () => {
    them('gmail', 1, 0, true);
    now = Date.UTC(2026, 9, 21, 16, 59, 0);
    dv.gui(mailThuong('a@x.vn'));
    dv.gui(mailThuong('b@x.vn'));
    expect(await dv.xuLyHangDoi()).toEqual({ daGui: 1, conCho: 1 });
    now = Date.UTC(2026, 9, 21, 16, 59, 59);
    expect(await dv.xuLyHangDoi()).toEqual({ daGui: 0, conCho: 1 }); // vẫn cùng ngày VN
    now = Date.UTC(2026, 9, 21, 17, 0, 0);
    expect(await dv.xuLyHangDoi()).toEqual({ daGui: 1, conCho: 0 });
    expect(dv.thongKeHomNay()[0]).toMatchObject({ daGui: 1 });
  });
});

describe('không có nhà cung cấp', () => {
  it('gui vẫn nhận vào hàng đợi, xuLyHangDoi không ném lỗi', async () => {
    const id = dv.gui(mailThuong('a@x.vn'));
    expect(id).toBeGreaterThan(0);
    await expect(dv.xuLyHangDoi()).resolves.toEqual({ daGui: 0, conCho: 1 });
  });
});

describe('guiThu', () => {
  it('gửi thử qua đúng nhà cung cấp; lỗi → ném thông báo không chứa mật khẩu', async () => {
    const id = them('gmail', 100, 0, true);
    await dv.guiThu(id, 'toi@x.vn');
    expect(goi).toEqual([{ ncc: 'gmail', den: 'toi@x.vn', matKhau: 'mk-gmail-rat-bi-mat' }]);
    loiTheo.gmail = 1;
    await expect(dv.guiThu(id, 'toi@x.vn')).rejects.toThrow(/Đăng nhập SMTP lỗi/);
    loiTheo.gmail = 1;
    await expect(dv.guiThu(id, 'toi@x.vn').catch((e: Error) => e.message)).resolves.not.toContain('mk-gmail');
    await expect(dv.guiThu(999, 'a@x.vn')).rejects.toThrow(/Không tìm thấy/);
  });
});
