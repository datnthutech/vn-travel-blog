// Router phía trình duyệt rất nhỏ dựa trên location.pathname dưới /quan-tri (không dùng thư viện router).
export const GOC = '/quan-tri';

const chuanHoa = (p: string) => (p.replace(/\/+$/, '') || GOC);

export const dieuHuong = $state({ duong: chuanHoa(location.pathname), tim: location.search });

/** Chuyển trang (không tải lại). `thay` = thay lịch sử thay vì thêm mới. */
export function di(duong: string, thay = false): void {
  const [p, tim = ''] = duong.split('?');
  if (thay) history.replaceState(null, '', duong);
  else history.pushState(null, '', duong);
  dieuHuong.duong = chuanHoa(p!);
  dieuHuong.tim = tim ? `?${tim}` : '';
}

/** Gắn vào onclick của thẻ <a> nội bộ để chuyển trang không tải lại (giữ nguyên Ctrl/Cmd+click). */
export function bamLienKet(e: MouseEvent): void {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = (e.currentTarget as HTMLAnchorElement);
  e.preventDefault();
  di(a.getAttribute('href')!);
}

window.addEventListener('popstate', () => {
  dieuHuong.duong = chuanHoa(location.pathname);
  dieuHuong.tim = location.search;
});
