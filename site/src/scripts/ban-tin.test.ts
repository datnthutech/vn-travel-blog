// @vitest-environment jsdom
// Script form đăng ký bản tin: gửi JSON đúng trường, hiện thông báo, không tải lại trang, thông báo lỗi chỉ là chữ.
import { describe, expect, it, vi } from 'vitest';
import { gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { khoiTaoBanTin } from './ban-tin';

function dung(phanHoi: { status: number; body: unknown } | 'loi-mang' = { status: 200, body: { ok: true } }) {
  document.body.innerHTML = `<section data-ban-tin><form method="post" action="/api/cong-khai/ban-tin/dang-ky">
    <input name="email"><input type="hidden" name="ngonNgu" value="vi"><input name="website"><button type="submit">Đăng ký</button></form><p class="bt-trang-thai" hidden></p></section>`;
  const khung = document.querySelector<HTMLElement>('[data-ban-tin]')!;
  const goi: { url: string; init: RequestInit }[] = [];
  const f = vi.fn(async (url: string, init: RequestInit) => {
    goi.push({ url, init });
    if (phanHoi === 'loi-mang') throw new TypeError('network');
    return new Response(JSON.stringify(phanHoi.body), { status: phanHoi.status });
  });
  khoiTaoBanTin(khung, { fetch: f as unknown as typeof fetch });
  const form = khung.querySelector('form')!;
  (form.elements.namedItem('email') as HTMLInputElement).value = ' lan@x.vn ';
  const gui = async () => {
    const ev = new Event('submit', { cancelable: true });
    form.dispatchEvent(ev);
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    return ev;
  };
  return { khung, goi, gui, tb: khung.querySelector<HTMLElement>('.bt-trang-thai')! };
}

describe('form bản tin', () => {
  it('gửi JSON đúng trường (email đã cắt khoảng trắng, ngonNgu, website rỗng), huỷ submit mặc định (không reload), hiện lời nhắn, xoá ô email', async () => {
    const t = dung();
    const ev = await t.gui();
    expect(ev.defaultPrevented).toBe(true);
    expect(t.goi).toHaveLength(1);
    expect(t.goi[0]!.url).toContain('/api/cong-khai/ban-tin/dang-ky');
    expect(JSON.parse(String(t.goi[0]!.init.body))).toEqual({ email: 'lan@x.vn', ngonNgu: 'vi', website: '' });
    expect(t.tb.textContent).toContain('Kiểm tra hộp thư');
    expect(t.tb.hidden).toBe(false);
    expect((t.khung.querySelector('input[name=email]') as HTMLInputElement).value).toBe('');
    expect(t.khung.querySelector('button')!.disabled).toBe(false);
  });

  it('lỗi từ máy chủ → hiện đúng thông báo, giữ email; HTML trong thông báo chỉ là chữ; mất mạng → thông báo chung', async () => {
    const a = dung({ status: 429, body: { loi: '<img src=x onerror=alert(1)>' } });
    await a.gui();
    expect(a.tb.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(a.tb.querySelector('img')).toBeNull();
    expect((a.khung.querySelector('input[name=email]') as HTMLInputElement).value).toBe(' lan@x.vn ');
    const b = dung('loi-mang');
    await b.gui();
    expect(b.tb.textContent).toMatch(/kết nối/);
    expect(b.khung.querySelector('button')!.disabled).toBe(false);
  });

  it('mã nguồn script ≤ 2 KB gzip', () => {
    const nguon = readFileSync(join(__dirname, 'ban-tin.ts'), 'utf8').replace(/^\s*\/\/.*$/gm, '');
    expect(gzipSync(nguon).length).toBeLessThanOrEqual(2 * 1024);
  });
});
