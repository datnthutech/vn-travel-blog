// Form đăng ký bản tin: có JS thì gửi bằng fetch (không tải lại trang), không JS thì form tự gửi POST bình thường.
// Thông báo (kể cả từ máy chủ) chỉ gán bằng textContent.
export interface PhuThuoc { fetch?: typeof fetch }

export function khoiTaoBanTin(khung: HTMLElement, p: PhuThuoc = {}): void {
  const goi = p.fetch ?? fetch.bind(window);
  const form = khung.querySelector<HTMLFormElement>('form');
  const tb = khung.querySelector<HTMLElement>('.bt-trang-thai');
  if (!form || !tb) return;
  const nut = form.querySelector<HTMLButtonElement>('button[type=submit]');
  const thongBao = (chu: string) => {
    tb.textContent = chu;
    tb.hidden = !chu;
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = form.elements as unknown as Record<string, HTMLInputElement>;
    if (nut) nut.disabled = true;
    try {
      const r = await goi(form.action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: f.email!.value.trim(), ngonNgu: f.ngonNgu?.value || 'vi', website: f.website?.value ?? '' }),
      });
      const d = (await r.json().catch(() => ({}))) as { loi?: unknown };
      if (r.ok) {
        thongBao(khung.dataset.daGui || 'Kiểm tra hộp thư để xác nhận.'); // bản dịch theo ngôn ngữ của trang (data-da-gui)
        f.email!.value = '';
      } else thongBao(typeof d.loi === 'string' ? d.loi : 'Không đăng ký được, hãy thử lại.');
    } catch {
      thongBao('Mất kết nối, hãy thử lại.');
    }
    if (nut) nut.disabled = false;
  });
}
