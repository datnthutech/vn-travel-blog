// @vitest-environment jsdom
// Script bình luận phía người đọc: nạp khi khung sắp vào tầm nhìn, hiển thị bằng textContent (không chạy HTML), gửi bằng fetch.
import { describe, expect, it, vi } from 'vitest';
import { gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { khoiTaoBinhLuan } from './binh-luan';

const KHUNG = `<section data-binh-luan data-bai="12" data-ngon-ngu="vi">
  <h2>Bình luận</h2><div class="bl-danh-sach"></div><p class="bl-trang-thai" hidden></p>
  <form class="bl-form" hidden>
    <input name="ten"><input name="email"><textarea name="noiDung"></textarea>
    <input name="website" class="bl-bay" tabindex="-1" autocomplete="off"><button type="submit">Gửi bình luận</button>
  </form></section>`;

function dung(trangThai: { get?: unknown; post?: { status: number; body: unknown } } = {}) {
  document.body.innerHTML = KHUNG;
  const khung = document.querySelector<HTMLElement>('[data-binh-luan]')!;
  const goi: { url: string; method: string; body?: any }[] = [];
  const fetchGia = vi.fn(async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    goi.push({ url, method, body: init.body ? JSON.parse(String(init.body)) : undefined });
    if (method === 'GET') return new Response(JSON.stringify(trangThai.get ?? { binhLuan: [], veGui: 've-1' }), { status: 200 });
    const p = trangThai.post ?? { status: 201, body: { id: 5, trangThai: 'hien' } };
    return new Response(JSON.stringify(p.body), { status: p.status });
  });
  let goiQuanSat: ((e: { isIntersecting: boolean }[]) => void) | undefined;
  let tuyChonQuanSat: IntersectionObserverInit | undefined;
  class QuanSat {
    constructor(cb: (e: { isIntersecting: boolean }[]) => void, o?: IntersectionObserverInit) { goiQuanSat = cb; tuyChonQuanSat = o; }
    observe() {}
    disconnect() {}
    unobserve() {}
  }
  khoiTaoBinhLuan(khung, { fetch: fetchGia as unknown as typeof fetch, IntersectionObserver: QuanSat as unknown as typeof IntersectionObserver });
  return { khung, goi, fetchGia, vaoTamNhin: () => goiQuanSat!([{ isIntersecting: true }]), tuyChonQuanSat: () => tuyChonQuanSat };
}
const doi = () => new Promise((r) => setTimeout(r, 0));

describe('nạp bình luận', () => {
  it('TRƯỚC khi khung vào tầm nhìn không có fetch nào; quan sát khi còn cách 600 px', () => {
    const t = dung();
    expect(t.fetchGia).not.toHaveBeenCalled();
    expect(t.tuyChonQuanSat()?.rootMargin).toBe('600px 0px');
  });

  it('khi vào tầm nhìn: GET đúng URL, vẽ bình luận (cha trước, con thụt), hiện form; chỉ nạp MỘT lần', async () => {
    const t = dung({ get: { veGui: 've-1', binhLuan: [
      { id: 1, chaId: null, ten: 'Lan', noiDung: 'Hay quá', laTacGia: false, taoLuc: 1700000000000 },
      { id: 2, chaId: 1, ten: 'Chủ blog', noiDung: 'Cảm ơn bạn', laTacGia: true, taoLuc: 1700000100000 },
    ] } });
    t.vaoTamNhin();
    t.vaoTamNhin();
    await doi();
    expect(t.goi).toHaveLength(1);
    expect(t.goi[0]).toMatchObject({ url: '/api/cong-khai/binh-luan?bai=12&ngonNgu=vi', method: 'GET' });
    const muc = t.khung.querySelectorAll('.bl-muc');
    expect(muc).toHaveLength(2);
    expect(muc[1]!.classList.contains('bl-con')).toBe(true);
    expect(muc[1]!.textContent).toContain('Tác giả');
    expect(muc[0]!.textContent).not.toContain('Tác giả');
    expect(t.khung.querySelector<HTMLFormElement>('.bl-form')!.hidden).toBe(false);
  });

  it('bình luận tắt ({ tat: true }) → ẩn cả khung', async () => {
    const t = dung({ get: { tat: true } });
    t.vaoTamNhin();
    await doi();
    expect(t.khung.hidden).toBe(true);
  });
});

describe('an toàn (Review Focus): HTML của người dùng chỉ là chữ', () => {
  it('<img onerror> / <script> trong tên và nội dung → hiển thị nguyên văn, DOM không có img/script, xuống dòng thành <br>', async () => {
    const xau = '<img src=x onerror=alert(1)>';
    const t = dung({ get: { veGui: 'v', binhLuan: [{ id: 1, chaId: null, ten: '<script>alert(2)</script>', noiDung: `${xau}\ndòng hai`, laTacGia: false, taoLuc: 1 }] } });
    t.vaoTamNhin();
    await doi();
    const ds = t.khung.querySelector('.bl-danh-sach')!;
    expect(ds.querySelector('img, script')).toBeNull();
    expect(ds.textContent).toContain(xau);
    expect(ds.textContent).toContain('<script>alert(2)</script>');
    expect(ds.querySelectorAll('br')).toHaveLength(1);
  });
});

describe('gửi bình luận', () => {
  async function guiBinhLuan(t: ReturnType<typeof dung>, over: Record<string, string> = {}) {
    t.vaoTamNhin();
    await doi();
    const f = t.khung.querySelector<HTMLFormElement>('.bl-form')!;
    const gan = (ten: string, v: string) => ((f.elements.namedItem(ten) as HTMLInputElement).value = v);
    gan('ten', over.ten ?? 'Minh');
    gan('email', over.email ?? 'minh@x.vn');
    gan('noiDung', over.noiDung ?? 'Bình luận mới');
    gan('website', over.website ?? '');
    f.dispatchEvent(new Event('submit', { cancelable: true }));
    await doi();
    await doi();
  }

  it('POST đúng nội dung (kèm vé gửi và ô bẫy), bình luận vừa gửi hiện NGAY, ô nhập được xoá', async () => {
    const t = dung();
    await guiBinhLuan(t);
    const post = t.goi.find((g) => g.method === 'POST')!;
    expect(post.url).toBe('/api/cong-khai/binh-luan');
    expect(post.body).toMatchObject({ bai: 12, ngonNgu: 'vi', ten: 'Minh', email: 'minh@x.vn', noiDung: 'Bình luận mới', website: '', veGui: 've-1' });
    expect(t.khung.querySelector('.bl-danh-sach')!.textContent).toContain('Bình luận mới');
    expect((t.khung.querySelector('textarea') as HTMLTextAreaElement).value).toBe('');
  });

  it('bình luận chờ xem → báo "đang chờ", KHÔNG hiện trong danh sách', async () => {
    const t = dung({ post: { status: 201, body: { id: 6, trangThai: 'cho-xem' } } });
    await guiBinhLuan(t, { noiDung: 'có nhiều link' });
    expect(t.khung.querySelector('.bl-trang-thai')!.textContent).toMatch(/chờ/);
    expect(t.khung.querySelector('.bl-danh-sach')!.textContent).not.toContain('có nhiều link');
  });

  it('lỗi máy chủ (429/400) → hiện đúng thông báo từ máy chủ, không thêm bình luận', async () => {
    const t = dung({ post: { status: 429, body: { loi: 'Bạn bình luận quá nhiều, hãy thử lại sau ít phút' } } });
    await guiBinhLuan(t);
    expect(t.khung.querySelector('.bl-trang-thai')!.textContent).toContain('quá nhiều');
    expect(t.khung.querySelectorAll('.bl-muc')).toHaveLength(0);
  });

  it('thông báo lỗi chứa HTML từ máy chủ cũng chỉ là chữ', async () => {
    const t = dung({ post: { status: 400, body: { loi: '<img src=x onerror=alert(1)>' } } });
    await guiBinhLuan(t);
    expect(t.khung.querySelector('.bl-trang-thai img')).toBeNull();
  });
});

describe('kích thước', () => {
  it('mã nguồn script ≤ 5 KB gzip (đo trên bản nguồn đã loại chú thích đơn giản)', () => {
    const nguon = readFileSync(join(__dirname, 'binh-luan.ts'), 'utf8').replace(/^\s*\/\/.*$/gm, '');
    expect(gzipSync(nguon).length).toBeLessThanOrEqual(5 * 1024);
  });
});
