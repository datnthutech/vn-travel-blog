// API bản tin công khai: đăng ký 10 lần → 1 dòng + 1 mail (Review Focus), huỷ idempotent, hết hạn 7 ngày, one-click, bẫy, giới hạn IP.
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { dungAdmin } from '../admin-api/thu-nghiem';
import { mauMailBanTin, mauMailXacNhan } from '../ban-tin/mau-mail';

type Moi = Awaited<ReturnType<typeof dungAdmin>>;
let m: Moi;
const NGAY = 24 * 60 * 60_000;
const gui = (body: object, ip = '1.1.1.1') => request(m.app).post('/api/cong-khai/ban-tin/dang-ky').set('X-Forwarded-For', ip).send(body);
const mailXacNhan = () => m.db.prepare("SELECT * FROM mail_hang_doi WHERE tieu_de LIKE 'Xác nhận đăng ký%' ORDER BY id").all() as { loai: string; den: string; text: string; trang_thai: string }[];
const dong = (email: string) => m.db.prepare('SELECT * FROM nguoi_dang_ky WHERE email = ?').get(email) as any;
const tokenTuMail = (i = 0) => /token=([0-9a-f]{64})/.exec(mailXacNhan()[i]!.text)![1]!;

beforeEach(async () => {
  m = await dungAdmin();
});

describe('đăng ký', () => {
  it('10 lần cùng email → 1 dòng, đúng 1 mail xác nhận (quan-trong, link đúng), cùng nội dung trả lời (Review Focus)', async () => {
    const kq = [];
    for (let i = 0; i < 4; i++) kq.push(await gui({ email: i % 2 ? 'Lan@X.vn' : 'lan@x.vn', ngonNgu: 'vi', website: '' }, `2.2.2.${i}`));
    for (let i = 0; i < 6; i++) kq.push(await gui({ email: 'lan@x.vn', ngonNgu: 'vi', website: '' }, `3.3.3.${i}`));
    expect(kq.every((r) => r.status === 200 && JSON.stringify(r.body) === '{"ok":true}')).toBe(true);
    expect((m.db.prepare('SELECT count(*) AS n FROM nguoi_dang_ky').get() as { n: number }).n).toBe(1);
    const mails = mailXacNhan();
    expect(mails).toHaveLength(1);
    expect(mails[0]).toMatchObject({ loai: 'quan-trong', den: 'lan@x.vn' });
    expect(mails[0]!.text).toContain('http://localhost:8090/api/cong-khai/ban-tin/xac-nhan?token=');
  });

  it('email đã xác nhận đăng ký lại → vẫn trả giống hệt (không lộ), không gửi mail thêm', async () => {
    await gui({ email: 'a@x.vn' });
    await request(m.app).get(`/api/cong-khai/ban-tin/xac-nhan?token=${tokenTuMail()}`);
    const moi = await gui({ email: 'b@x.vn' }, '9.9.9.9');
    const cu = await gui({ email: 'a@x.vn' }, '9.9.9.8');
    expect(cu.body).toEqual(moi.body);
    expect(mailXacNhan()).toHaveLength(2); // a lần đầu + b; a lần hai không gửi
  });

  it('email sai → 400; ô bẫy website điền → 200 giả, không lưu; ngôn ngữ lạ → vi; không cookie', async () => {
    expect((await gui({ email: 'khong-phai-email' })).status).toBe(400);
    expect((await gui({ email: '' })).status).toBe(400);
    const bay = await gui({ email: 'bot@x.vn', website: 'http://spam' });
    expect(bay).toMatchObject({ status: 200, body: { ok: true } });
    expect(dong('bot@x.vn')).toBeUndefined();
    const r = await gui({ email: 'c@x.vn', ngonNgu: '../../etc' });
    expect(dong('c@x.vn').ngon_ngu).toBe('vi');
    expect(r.headers['set-cookie']).toBeUndefined();
  });

  it('6 lần/giờ từ một IP → lần thứ 6 là 429; IP khác không ảnh hưởng; qua 1 giờ dùng lại được', async () => {
    for (let i = 0; i < 5; i++) expect((await gui({ email: `u${i}@x.vn` }, '4.4.4.4')).status).toBe(200);
    expect((await gui({ email: 'u6@x.vn' }, '4.4.4.4')).status).toBe(429);
    expect((await gui({ email: 'u7@x.vn' }, '4.4.4.5')).status).toBe(200);
    m.dongHo.v += 61 * 60_000;
    expect((await gui({ email: 'u8@x.vn' }, '4.4.4.4')).status).toBe(200);
  });

  it('form không JS (urlencoded) → 303 về TRANG TRƯỚC kèm ?dang-ky=da-gui#ban-tin-da-gui (CSS :target hiện lời nhắn); Referer ngoài site/độc hại không gây open redirect', async () => {
    const f = (ref: string | undefined, email: string, ip: string) => {
      const q = request(m.app).post('/api/cong-khai/ban-tin/dang-ky').set('X-Forwarded-For', ip).type('form');
      return (ref ? q.set('Referer', ref) : q).send({ email, ngonNgu: 'vi', website: '' });
    };
    const a = await f('http://localhost:8090/da-nang/bai-hay/', 'f1@x.vn', '6.6.6.1');
    expect(a.status).toBe(303);
    expect(a.headers.location).toBe('/da-nang/bai-hay/?dang-ky=da-gui#ban-tin-da-gui');
    expect((await f('https://evil.com//evil.com', 'f2@x.vn', '6.6.6.2')).headers.location).toBe('/?dang-ky=da-gui#ban-tin-da-gui');
    expect((await f(undefined, 'f3@x.vn', '6.6.6.3')).headers.location).toBe('/?dang-ky=da-gui#ban-tin-da-gui');
    expect(dong('f1@x.vn')).toBeTruthy();
  });
});

describe('xác nhận', () => {
  it('link đúng → HTML "Đã xác nhận" (noindex, không JS); bấm lại vẫn được; token lạ → "hết hạn"', async () => {
    await gui({ email: 'a@x.vn' });
    const t = tokenTuMail();
    const r = await request(m.app).get(`/api/cong-khai/ban-tin/xac-nhan?token=${t}`);
    expect(r.status).toBe(200);
    expect(r.headers['x-robots-tag']).toBe('noindex');
    expect(r.headers['content-type']).toMatch(/html/);
    expect(r.text).toContain('Đã xác nhận');
    expect(r.text).not.toMatch(/<script/i);
    expect(dong('a@x.vn').trang_thai).toBe('da-xac-nhan');
    expect((await request(m.app).get(`/api/cong-khai/ban-tin/xac-nhan?token=${t}`)).text).toContain('Đã xác nhận');
    expect((await request(m.app).get(`/api/cong-khai/ban-tin/xac-nhan?token=${'0'.repeat(64)}`)).text).toContain('hết hạn');
  });

  it('token xác nhận quá 7 ngày → HTML "Link hết hạn", vẫn chờ xác nhận', async () => {
    await gui({ email: 'a@x.vn' });
    const t = tokenTuMail();
    m.dongHo.v += 7 * NGAY + 1000;
    const r = await request(m.app).get(`/api/cong-khai/ban-tin/xac-nhan?token=${t}`);
    expect(r.status).toBe(400);
    expect(r.text).toContain('hết hạn');
    expect(dong('a@x.vn').trang_thai).toBe('cho-xac-nhan');
  });
});

describe('huỷ', () => {
  const dangKyXong = async (email = 'a@x.vn') => {
    await gui({ email }, '8.8.8.8');
    await request(m.app).get(`/api/cong-khai/ban-tin/xac-nhan?token=${tokenTuMail(mailXacNhan().length - 1)}`);
    return dong(email).token_huy as string;
  };

  it('GET /huy chỉ hiện nút (KHÔNG huỷ — bộ quét link của mail không huỷ hộ); POST → "Đã huỷ"', async () => {
    const th = await dangKyXong();
    const g = await request(m.app).get(`/api/cong-khai/ban-tin/huy?token=${th}`);
    expect(g.text).toContain('Xác nhận huỷ');
    expect(dong('a@x.vn').trang_thai).toBe('da-xac-nhan');
    const p = await request(m.app).post(`/api/cong-khai/ban-tin/huy?token=${th}`).type('form').send({});
    expect(p.text).toContain('Đã huỷ');
    expect(dong('a@x.vn').trang_thai).toBe('da-huy');
  });

  it('one-click (List-Unsubscribe=One-Click) → 200 và da-huy; bấm link huỷ trong mail cũ lần 2 vẫn "Đã huỷ", không lỗi (Review Focus)', async () => {
    const th = await dangKyXong();
    const url = `/api/cong-khai/ban-tin/huy?token=${th}`;
    const a = await request(m.app).post(url).type('form').send('List-Unsubscribe=One-Click');
    expect(a.status).toBe(200);
    expect(dong('a@x.vn').trang_thai).toBe('da-huy');
    const b = await request(m.app).post(url).type('form').send('List-Unsubscribe=One-Click');
    expect(b.status).toBe(200);
    expect(b.text).toContain('Đã huỷ');
    expect((await request(m.app).post('/api/cong-khai/ban-tin/huy?token=zzz').type('form').send({})).status).toBe(400);
  });
});

describe('mẫu mail', () => {
  it('mẫu bản tin có 2 header huỷ + link huỷ trong CẢ html lẫn text; nội dung bị thoát HTML, link thành thẻ a, dòng ảnh thành img', () => {
    const t = mauMailBanTin({
      banTin: { tieuDe: 'Tin tháng 10', ngonNgu: 'vi', noiDung: 'Chào <b>bạn</b>\n\nhttps://x.vn/bai?a=1&b=2\n\nhttps://x.vn/anh.jpg' },
      nguoiNhan: { email: 'a@x.vn' },
      linkHuy: 'https://x.vn/huy?token=abc',
    });
    expect(t.headers).toEqual({ 'List-Unsubscribe': '<https://x.vn/huy?token=abc>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' });
    expect(t.html).toContain('https://x.vn/huy?token=abc');
    expect(t.text).toContain('https://x.vn/huy?token=abc');
    expect(t.html).not.toContain('<b>bạn</b>');
    expect(t.html).toContain('&lt;b&gt;bạn&lt;/b&gt;');
    expect(t.html).toContain('<a href="https://x.vn/bai?a=1&amp;b=2">');
    expect(t.html).toContain('<img src="https://x.vn/anh.jpg"');
  });

  it('mẫu xác nhận có link trong html và text', () => {
    const t = mauMailXacNhan({ ngonNgu: 'vi', link: 'https://x.vn/xn?token=1' });
    expect(t.html).toContain('https://x.vn/xn?token=1');
    expect(t.text).toContain('https://x.vn/xn?token=1');
  });
});
