// Ngày theo giờ Việt Nam (Asia/Ho_Chi_Minh), KHÔNG phụ thuộc múi giờ của máy chủ: dùng cho bộ đếm mail theo ngày
// và hẹn giờ đăng. Máy chủ chạy UTC thì 17:00 UTC vẫn là 0 giờ ngày hôm sau ở Việt Nam.
const dinhDang = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' });

/** `YYYY-MM-DD` theo giờ Việt Nam. */
export const ngayVN = (now: number): string => dinhDang.format(new Date(now));

const dinhDangGio = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hour12: false });
/** `HH:mm ngày DD/MM/YYYY` theo giờ Việt Nam, để đưa vào thông báo cho người dùng. */
export const gioVN = (now: number): string => {
  const [y, m, d] = ngayVN(now).split('-');
  return `${dinhDangGio.format(new Date(now))} ngày ${d}/${m}/${y}`;
};
