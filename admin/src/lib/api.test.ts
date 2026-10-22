// Kiểm tra lớp gọi API: gắn CSRF cho request ghi, 401 → chuyển trang đăng nhập, ném LoiApi.
import { beforeEach, describe, expect, it } from 'vitest';
import { datMoiTruong, goiApi, LoiApi, xoaCsrf } from './api';

interface Goi { url: string; method: string; headers: Record<string, string>; body?: string }
let goi: Goi[];
let chuyen: string[];
let tra: (url: string, method: string) => { status: number; body: unknown };

beforeEach(() => {
  goi = [];
  chuyen = [];
  xoaCsrf();
  tra = (url) => (url.endsWith('/toi') ? { status: 200, body: { csrf: 'csrf-123', nguoiDung: {} } } : { status: 200, body: { ok: true } });
  datMoiTruong({
    fetch: (async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      goi.push({ url, method, headers: (init.headers ?? {}) as Record<string, string>, body: init.body as string | undefined });
      const r = tra(url, method);
      return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch,
    chuyenTrang: (d) => void chuyen.push(d),
  });
});

describe('goiApi', () => {
  it('GET không gắn X-CSRF-Token và không gọi /toi để lấy token', async () => {
    await goiApi('GET', '/mail/thong-ke');
    expect(goi).toHaveLength(1);
    expect(goi[0]!.url).toBe('/api/admin/mail/thong-ke');
    expect(goi[0]!.headers['X-CSRF-Token']).toBeUndefined();
  });

  it('POST gắn X-CSRF-Token lấy từ /toi (chỉ lấy một lần), gửi JSON, kèm cookie', async () => {
    await goiApi('POST', '/dang-xuat-moi-noi', { a: 1 });
    await goiApi('PUT', '/mail/nha-cung-cap/1', { b: 2 });
    expect(goi.map((g) => `${g.method} ${g.url}`)).toEqual([
      'GET /api/admin/toi',
      'POST /api/admin/dang-xuat-moi-noi',
      'PUT /api/admin/mail/nha-cung-cap/1',
    ]);
    expect(goi[1]!.headers['X-CSRF-Token']).toBe('csrf-123');
    expect(goi[2]!.headers['X-CSRF-Token']).toBe('csrf-123');
    expect(goi[1]!.headers['Content-Type']).toBe('application/json');
    expect(goi[1]!.body).toBe('{"a":1}');
  });

  it('các API đăng nhập (chưa có phiên) không cần CSRF và không gọi /toi', async () => {
    await goiApi('POST', '/dang-nhap', { email: 'a', matKhau: 'b' }, { khongChuyenTrang: true });
    expect(goi).toHaveLength(1);
    expect(goi[0]!.headers['X-CSRF-Token']).toBeUndefined();
  });

  it('nhận lời mời (/loi-moi/:token/nhan, chưa có phiên) không cần CSRF và không gọi /toi', async () => {
    await goiApi('POST', '/loi-moi/abc/nhan', { ten: 'A', matKhau: 'x' }, { khongChuyenTrang: true });
    expect(goi).toHaveLength(1);
    expect(goi[0]!.headers['X-CSRF-Token']).toBeUndefined();
  });

  it('401 → gọi hàm chuyển sang trang đăng nhập và ném LoiApi', async () => {
    tra = () => ({ status: 401, body: { loi: 'Chưa đăng nhập' } });
    await expect(goiApi('GET', '/phien')).rejects.toMatchObject({ status: 401, loi: 'Chưa đăng nhập' });
    expect(chuyen).toEqual(['/quan-tri/dang-nhap']);
  });

  it('401 với khongChuyenTrang (đăng nhập sai) → không chuyển trang, vẫn ném LoiApi có thông báo', async () => {
    tra = () => ({ status: 401, body: { loi: 'Sai email hoặc mật khẩu' } });
    const e = await goiApi('POST', '/dang-nhap', {}, { khongChuyenTrang: true }).catch((x) => x);
    expect(e).toBeInstanceOf(LoiApi);
    expect(e).toMatchObject({ status: 401, loi: 'Sai email hoặc mật khẩu' });
    expect(chuyen).toEqual([]);
  });

  it('lỗi khác (400/429/503) → ném LoiApi mang status, loi và dữ liệu thêm; không chuyển trang', async () => {
    tra = (url) => (url.endsWith('/toi') ? { status: 200, body: { csrf: 'c' } } : { status: 429, body: { loi: 'Quá nhiều', conLaiGiay: 90 } });
    const e = (await goiApi('POST', '/x', {}).catch((x) => x)) as LoiApi;
    expect(e).toMatchObject({ status: 429, loi: 'Quá nhiều' });
    expect(e.du).toMatchObject({ conLaiGiay: 90 });
    expect(chuyen).toEqual([]);
  });

  it('403 do CSRF hết hạn → lấy lại token một lần rồi thử lại', async () => {
    let lan = 0;
    tra = (url) => {
      if (url.endsWith('/toi')) return { status: 200, body: { csrf: `c${++lan}` } };
      return goi.filter((g) => g.url.endsWith('/x')).length === 1 ? { status: 403, body: { loi: 'CSRF' } } : { status: 200, body: { ok: 1 } };
    };
    expect(await goiApi('POST', '/x', {})).toEqual({ ok: 1 });
    expect(goi.filter((g) => g.url.endsWith('/toi'))).toHaveLength(2);
    expect(goi.at(-1)!.headers['X-CSRF-Token']).toBe('c2');
  });

  it('phản hồi không phải JSON → vẫn ném LoiApi có thông báo chung, không văng lỗi parse', async () => {
    datMoiTruong({ fetch: (async () => new Response('<html>lỗi</html>', { status: 502 })) as typeof fetch });
    await expect(goiApi('GET', '/x')).rejects.toMatchObject({ status: 502 });
  });
});
