// Bình luận phía người đọc. Trang tĩnh hiện trước; script này chỉ nạp bình luận khi khung còn cách màn hình 600 px.
// AN TOÀN: mọi dữ liệu người dùng chỉ đi vào DOM bằng textContent/createTextNode (cấm innerHTML) nên <script>, <img onerror> chỉ là chữ.
interface BL { id: number; chaId: number | null; ten: string; noiDung: string; laTacGia: boolean; taoLuc: number }
interface TuyChon { fetch?: typeof fetch; IntersectionObserver?: typeof IntersectionObserver }

const API = '/api/cong-khai/binh-luan';

export function khoiTaoBinhLuan(khung: HTMLElement, opt: TuyChon = {}): void {
  const goi = opt.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const QuanSat = opt.IntersectionObserver ?? (typeof IntersectionObserver === 'undefined' ? undefined : IntersectionObserver);
  const bai = Number(khung.dataset.bai);
  const ngonNgu = khung.dataset.ngonNgu ?? 'vi';
  const ds = khung.querySelector<HTMLElement>('.bl-danh-sach')!;
  const tb = khung.querySelector<HTMLElement>('.bl-trang-thai')!;
  const form = khung.querySelector<HTMLFormElement>('.bl-form')!;
  let veGui = '';
  let chaId: number | null = null;
  let daNap = false;

  const el = (tag: string, cls?: string, chu?: string) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (chu !== undefined) e.textContent = chu;
    return e;
  };
  const thongBao = (chu: string) => {
    tb.textContent = chu; // textContent: thông báo từ máy chủ cũng chỉ là chữ
    tb.hidden = !chu;
  };

  function ve(b: BL): void {
    const m = el('div', b.chaId ? 'bl-muc bl-con' : 'bl-muc');
    const dau = el('p', 'bl-dau');
    dau.append(el('strong', undefined, b.ten));
    if (b.laTacGia) dau.append(' ', el('span', 'bl-nhan', 'Tác giả'));
    const t = el('time', 'bl-gio', new Date(b.taoLuc).toLocaleDateString('vi-VN'));
    dau.append(' ', t);
    const nd = el('p', 'bl-noi-dung');
    b.noiDung.split('\n').forEach((dong, i) => {
      if (i > 0) nd.append(document.createElement('br'));
      nd.append(document.createTextNode(dong));
    });
    m.append(dau, nd);
    if (!b.chaId) {
      const tl = el('button', 'bl-tra-loi', 'Trả lời');
      tl.setAttribute('type', 'button');
      tl.addEventListener('click', () => {
        chaId = b.id;
        thongBao(`Đang trả lời ${b.ten}.`);
        form.querySelector<HTMLElement>('textarea')?.focus();
      });
      m.append(tl);
    }
    ds.append(m);
  }

  async function nap(): Promise<void> {
    if (daNap) return;
    daNap = true;
    try {
      const r = await goi(`${API}?bai=${bai}&ngonNgu=${encodeURIComponent(ngonNgu)}`);
      const d = (await r.json()) as { tat?: boolean; binhLuan?: BL[]; veGui?: string };
      if (!r.ok || d.tat) return void (khung.hidden = true);
      veGui = d.veGui ?? '';
      (d.binhLuan ?? []).forEach(ve);
      form.hidden = false;
    } catch {
      khung.hidden = true; // mất mạng / lỗi: ẩn khung, không làm hỏng trang
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const g = (ten: string) => (form.elements.namedItem(ten) as HTMLInputElement | null)?.value ?? '';
    const nut = form.querySelector<HTMLButtonElement>('button[type=submit]');
    if (nut) nut.disabled = true;
    try {
      const r = await goi(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bai, ngonNgu, chaId, ten: g('ten'), email: g('email'), noiDung: g('noiDung'), website: g('website'), veGui }),
      });
      const d = (await r.json().catch(() => ({}))) as { id?: number; trangThai?: string; loi?: string };
      if (!r.ok) return void thongBao(typeof d.loi === 'string' ? d.loi : 'Chưa gửi được bình luận, hãy thử lại.');
      if (d.trangThai === 'cho-xem') thongBao('Cảm ơn bạn! Bình luận đang chờ được xem.');
      else {
        thongBao('');
        ve({ id: d.id ?? 0, chaId, ten: g('ten'), noiDung: g('noiDung'), laTacGia: false, taoLuc: Date.now() });
      }
      (form.elements.namedItem('noiDung') as HTMLTextAreaElement).value = '';
      chaId = null;
    } catch {
      thongBao('Mất kết nối, hãy thử lại.');
    } finally {
      if (nut) nut.disabled = false;
    }
  });

  if (!QuanSat) return void nap();
  const qs = new QuanSat(
    (muc) => {
      if (muc.some((x) => x.isIntersecting)) {
        qs.disconnect();
        void nap();
      }
    },
    { rootMargin: '600px 0px' },
  );
  qs.observe(khung);
}
