// Gọi API /api/admin: tự gắn X-CSRF-Token cho request ghi, 401 → về trang đăng nhập, lỗi → ném LoiApi (có thông báo tiếng Việt).

export class LoiApi extends Error {
  constructor(
    public status: number,
    public loi: string,
    /** Dữ liệu thêm máy chủ trả kèm (vd conLaiGiay khi bị chặn đăng nhập). */
    public du: Record<string, unknown> = {},
  ) {
    super(loi);
  }
}

interface MoiTruong {
  fetch: typeof fetch;
  chuyenTrang: (duong: string) => void;
}

const DUONG_DANG_NHAP = '/quan-tri/dang-nhap';
// Hàm chuyển trang mặc định: không chuyển nếu đang đứng ở một trang không cần đăng nhập (tránh vòng lặp).
const CONG_KHAI = ['/quan-tri/dang-nhap', '/quan-tri/quen-mat-khau', '/quan-tri/dat-lai', '/quan-tri/nhan-loi-moi'];
let moi: MoiTruong = {
  fetch: (...a) => fetch(...a),
  chuyenTrang: (duong) => {
    if (!CONG_KHAI.includes(location.pathname)) location.assign(duong);
  },
};

/** Thay môi trường (chỉ dùng trong test). */
export function datMoiTruong(m: Partial<MoiTruong>): void {
  moi = { ...moi, ...m };
}

let csrf: string | undefined;
export const xoaCsrf = (): void => {
  csrf = undefined;
};

// Các API chưa cần phiên → không cần CSRF.
const KHONG_CAN_CSRF = new Set(['/dang-nhap', '/quen-mat-khau', '/dat-lai-mat-khau']);
const khongCanCsrf = (duongDan: string) => KHONG_CAN_CSRF.has(duongDan) || duongDan.startsWith('/loi-moi/'); // nhận lời mời: chưa có phiên

async function layCsrf(): Promise<string> {
  if (csrf) return csrf;
  const r = await moi.fetch('/api/admin/toi', { credentials: 'same-origin' });
  const d = (await r.json().catch(() => ({}))) as { csrf?: string };
  if (!r.ok || !d.csrf) throw new LoiApi(r.status, 'Không lấy được mã bảo vệ. Hãy đăng nhập lại.');
  csrf = d.csrf;
  return csrf;
}

export interface TuyChon {
  /** Đừng chuyển sang trang đăng nhập khi 401 (dùng cho chính các form đăng nhập). */
  khongChuyenTrang?: boolean;
}

export async function goiApi<T = unknown>(
  phuongThuc: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  duongDan: string,
  body?: unknown,
  tuyChon: TuyChon = {},
  daThuLai = false,
): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (phuongThuc !== 'GET' && !khongCanCsrf(duongDan)) headers['X-CSRF-Token'] = await layCsrf();

  let r: Response;
  try {
    r = await moi.fetch(`/api/admin${duongDan}`, {
      method: phuongThuc,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
    });
  } catch {
    throw new LoiApi(0, 'Không kết nối được máy chủ. Hãy kiểm tra mạng rồi thử lại.');
  }
  const du = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (r.ok) return du as T;

  // CSRF hết hạn (vd phiên đổi): lấy token mới một lần rồi thử lại.
  if (r.status === 403 && !daThuLai && phuongThuc !== 'GET' && headers['X-CSRF-Token']) {
    xoaCsrf();
    return goiApi<T>(phuongThuc, duongDan, body, tuyChon, true);
  }
  if (r.status === 401 && !tuyChon.khongChuyenTrang) {
    xoaCsrf();
    moi.chuyenTrang(DUONG_DANG_NHAP);
  }
  throw new LoiApi(r.status, typeof du.loi === 'string' ? du.loi : `Có lỗi (mã ${r.status}). Hãy thử lại.`, du);
}
