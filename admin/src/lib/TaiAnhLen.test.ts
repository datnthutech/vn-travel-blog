// @vitest-environment jsdom
// TaiAnhLen: chọn 3 file → gọi API MỘT lần với cả 3 file; hiện lỗi riêng cho file bị từ chối.
import { mount, unmount, flushSync } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { goiTaiAnh } from './tai-anh';
import TaiAnhLen from './TaiAnhLen.svelte';

const file = (ten: string) => new File(['x'], ten, { type: 'image/jpeg' });
let goi: { url: string; method?: string; csrf?: string; ten: string[] }[];

beforeEach(() => {
  goi = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
    if (url.endsWith('/toi')) return new Response(JSON.stringify({ csrf: 'csrf-xyz' }), { status: 200 });
    const fd = init.body as FormData;
    goi.push({ url, method: init.method, csrf: (init.headers as Record<string, string>)['X-CSRF-Token'], ten: fd.getAll('files').map((f) => (f as File).name) });
    return new Response(JSON.stringify({ ok: [{ ma: 'm1', rong: 1, cao: 1 }, { ma: 'm2', rong: 1, cao: 1 }], loi: [{ ten: 'hong.jpg', loi: 'Không đọc được file này như một ảnh' }] }), { status: 200 });
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('goiTaiAnh', () => {
  it('gửi mọi file trong MỘT request multipart có X-CSRF-Token, trả kết quả riêng từng file', async () => {
    const kq = await goiTaiAnh([file('a.jpg'), file('b.jpg'), file('hong.jpg')]);
    expect(goi).toHaveLength(1);
    expect(goi[0]).toMatchObject({ url: '/api/admin/anh', method: 'POST', csrf: 'csrf-xyz', ten: ['a.jpg', 'b.jpg', 'hong.jpg'] });
    expect(kq.ok.map((x) => x.ma)).toEqual(['m1', 'm2']);
    expect(kq.loi).toEqual([{ ten: 'hong.jpg', loi: 'Không đọc được file này như một ảnh' }]);
  });

  it('máy chủ từ chối cả lượt (507) → ném LoiApi với thông báo máy chủ', async () => {
    vi.stubGlobal('fetch', async (url: string) => (url.endsWith('/toi') ? new Response(JSON.stringify({ csrf: 'c' })) : new Response(JSON.stringify({ loi: 'Ổ đĩa trên VPS gần đầy' }), { status: 507 })));
    await expect(goiTaiAnh([file('a.jpg')])).rejects.toMatchObject({ status: 507, loi: 'Ổ đĩa trên VPS gần đầy' });
  });
});

describe('<TaiAnhLen>', () => {
  it('chọn 3 file → một lần gọi API với 3 file; hiện số ảnh đã tải và lỗi riêng cho file bị từ chối', async () => {
    const target = document.createElement('div');
    document.body.append(target);
    const khiXong = vi.fn();
    const c = mount(TaiAnhLen, { target, props: { khiXong } });
    const input = target.querySelector('input[type=file]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [file('a.jpg'), file('b.jpg'), file('hong.jpg')], configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(khiXong).toHaveBeenCalled());
    flushSync();
    expect(goi).toHaveLength(1);
    expect(goi[0]!.ten).toEqual(['a.jpg', 'b.jpg', 'hong.jpg']);
    expect(target.textContent).toContain('Đã tải 2 ảnh');
    expect(target.textContent).toContain('hong.jpg');
    expect(target.textContent).toContain('Không đọc được file này như một ảnh');
    unmount(c);
    target.remove();
  });

  it('máy chủ từ chối cả lượt → hiện thông báo lỗi chung, không văng', async () => {
    vi.stubGlobal('fetch', async (url: string) => (url.endsWith('/toi') ? new Response(JSON.stringify({ csrf: 'c' })) : new Response(JSON.stringify({ loi: 'Ổ đĩa trên VPS gần đầy' }), { status: 507 })));
    const target = document.createElement('div');
    document.body.append(target);
    const c = mount(TaiAnhLen, { target, props: {} });
    const input = target.querySelector('input[type=file]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [file('a.jpg')], configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(target.textContent).toContain('Ổ đĩa trên VPS gần đầy'));
    unmount(c);
    target.remove();
  });
});
