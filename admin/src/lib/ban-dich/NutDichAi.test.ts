// @vitest-environment jsdom
// NutDichAi: kết quả AI được ĐƯA CHO FORM mà KHÔNG gọi API lưu; lỗi 503 hiện thông báo tiếng Việt từ máy chủ; sau lỗi form vẫn dùng được.
import { flushSync, mount, unmount } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import NutDichAi from './NutDichAi.svelte';

let goi: { url: string; method: string; body?: unknown }[];
let phanHoi: { status: number; body: unknown };

beforeEach(() => {
  goi = [];
  phanHoi = { status: 200, body: { ketQua: { tieuDe: 'Translated', slug: 'translated', noiDung: 'Hello' }, canhBao: ['Bản dịch làm MẤT ảnh (anh1)'] } };
  vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
    if (url.endsWith('/toi')) return new Response(JSON.stringify({ csrf: 'csrf-x' }), { status: 200 });
    goi.push({ url, method: init.method ?? 'GET', body: init.body ? JSON.parse(String(init.body)) : undefined });
    return new Response(JSON.stringify(phanHoi.body), { status: phanHoi.status });
  });
});
afterEach(() => vi.unstubAllGlobals());

function dung(props: Record<string, unknown> = {}) {
  const target = document.createElement('div');
  document.body.append(target);
  const khiCoKetQua = vi.fn();
  const c = mount(NutDichAi, { target, props: { baiId: 7, ngonNgu: 'en', khiCoKetQua, ...props } });
  const nut = () => target.querySelector('button') as HTMLButtonElement;
  return { target, khiCoKetQua, nut, huy: () => (unmount(c), target.remove()) };
}

describe('<NutDichAi>', () => {
  it('bấm → gọi đúng API dịch (chỉ MỘT lần), đưa ketQua + canhBao cho form, KHÔNG gọi PUT/PATCH/POST lưu nào khác', async () => {
    const t = dung();
    t.nut().click();
    await vi.waitFor(() => expect(t.khiCoKetQua).toHaveBeenCalled());
    expect(t.khiCoKetQua).toHaveBeenCalledWith({ tieuDe: 'Translated', slug: 'translated', noiDung: 'Hello' }, ['Bản dịch làm MẤT ảnh (anh1)']);
    expect(goi).toEqual([{ url: '/api/admin/bai/7/ban-dich/en/dich-ai', method: 'POST', body: {} }]);
    expect(goi.some((g) => g.method === 'PUT' || g.method === 'PATCH' || /xem-truoc|\/dang$/.test(g.url))).toBe(false);
    t.huy();
  });

  it('chiTruong → gửi đúng chiTruong để dịch MỘT ô', async () => {
    const t = dung({ chiTruong: 'moTa', nhan: 'Dịch ô này' });
    expect(t.nut().textContent).toContain('Dịch ô này');
    t.nut().click();
    await vi.waitFor(() => expect(goi).toHaveLength(1));
    expect(goi[0]!.body).toEqual({ chiTruong: 'moTa' });
    t.huy();
  });

  it('lỗi 503 → hiện đúng thông báo tiếng Việt của máy chủ, không gọi khiCoKetQua, nút dùng lại được và gọi lại thành công', async () => {
    phanHoi = { status: 503, body: { loi: 'Hết hạn mức AI, thử lại sau', maLoi: 'het-han-muc' } };
    const t = dung();
    t.nut().click();
    await vi.waitFor(() => expect(t.target.textContent).toContain('Hết hạn mức AI, thử lại sau'));
    flushSync();
    expect(t.khiCoKetQua).not.toHaveBeenCalled();
    expect(t.nut().disabled).toBe(false);
    phanHoi = { status: 200, body: { ketQua: { tieuDe: 'OK' }, canhBao: [] } };
    t.nut().click();
    await vi.waitFor(() => expect(t.khiCoKetQua).toHaveBeenCalledWith({ tieuDe: 'OK' }, []));
    flushSync();
    expect(t.target.textContent).not.toContain('Hết hạn mức');
    t.huy();
  });

  it('thông báo lỗi chứa HTML từ máy chủ chỉ là chữ (không tạo phần tử)', async () => {
    phanHoi = { status: 503, body: { loi: '<img src=x onerror=alert(1)>', maLoi: 'khac' } };
    const t = dung();
    t.nut().click();
    await vi.waitFor(() => expect(t.target.textContent).toContain('<img'));
    expect(t.target.querySelector('img')).toBeNull();
    t.huy();
  });

  it('mất mạng → thông báo chung, không văng', async () => {
    vi.stubGlobal('fetch', async (url: string) => {
      if (url.endsWith('/toi')) return new Response(JSON.stringify({ csrf: 'c' }));
      throw new TypeError('network');
    });
    const t = dung();
    t.nut().click();
    await vi.waitFor(() => expect(t.target.textContent).toMatch(/kết nối|thử lại/));
    expect(t.khiCoKetQua).not.toHaveBeenCalled();
    t.huy();
  });
});
