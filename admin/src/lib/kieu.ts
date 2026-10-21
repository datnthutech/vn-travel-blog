// Kiểu dữ liệu dùng chung của giao diện soạn bài (khớp `baiVietSchema`, nhưng lỏng hơn vì nháp được thiếu trường).
export interface AnhRef { ma: string; alt: string }
export interface TraNhanh {
  hopVoi: string; thoiGian: string; choO?: string; tongChiPhi: number; soNguoi: number;
  diemThanThienVoiBe: number; diChuyen: string; thoiDiemNenDi: string; luuYVoiBe: string[];
}
export interface DiaDiem {
  ten: string; kieu: 'cho-o' | 'quan-an' | 'cho' | 'khu-sinh-thai' | 'diem-choi';
  diaChi?: string; khoangGia?: string; gioMoCua?: string; thanThienVoiBe?: string; diem?: number;
  uuDiem: string[]; nhuocDiem: string[]; anh: AnhRef[];
  linkDat?: { nhaCungCap: 'agoda' | 'klook' | 'traveloka' | 'booking' | 'khac'; url: string };
}
export interface DoChoBe { ten: string; ghiChu?: string; link?: string }
export interface Faq { hoi: string; dap: string }

export interface BaiForm {
  tieuDe: string; slug: string; moTa: string;
  loai: 'nhat-ky' | 'review' | 'top-list' | 'cam-nang';
  tinh?: string; chuyenMuc: string[]; tags: string[];
  anhBia: AnhRef; ngayDi?: string; ngayDang?: string;
  traNhanh?: TraNhanh; diaDiem: DiaDiem[]; doMangChoBe: DoChoBe[]; faq: Faq[]; hopTac: boolean;
}

export const CHUYEN_MUC = [
  { ma: 'sinh-thai', ten: 'Sinh thái' }, { ma: 'an-uong', ten: 'Ăn uống' }, { ma: 'vui-choi', ten: 'Vui chơi' },
  { ma: 'luu-tru', ten: 'Lưu trú' }, { ma: 'di-chuyen', ten: 'Di chuyển' },
];
export const LOAI_BAI = [
  { ma: 'nhat-ky', ten: 'Nhật ký chuyến đi' }, { ma: 'review', ten: 'Review' }, { ma: 'top-list', ten: 'Top danh sách' }, { ma: 'cam-nang', ten: 'Cẩm nang' },
];
export const KIEU_DIA_DIEM = [
  { ma: 'cho-o', ten: 'Chỗ ở' }, { ma: 'quan-an', ten: 'Quán ăn' }, { ma: 'cho', ten: 'Chợ' }, { ma: 'khu-sinh-thai', ten: 'Khu sinh thái' }, { ma: 'diem-choi', ten: 'Điểm chơi' },
];

export const baiTrong = (): BaiForm => ({
  tieuDe: '', slug: '', moTa: '', loai: 'nhat-ky', chuyenMuc: [], tags: [], anhBia: { ma: '', alt: '' },
  diaDiem: [], doMangChoBe: [], faq: [], hopTac: false,
});

export const traNhanhTrong = (): TraNhanh => ({
  hopVoi: '', thoiGian: '', tongChiPhi: 0, soNguoi: 2, diemThanThienVoiBe: 3, diChuyen: '', thoiDiemNenDi: '', luuYVoiBe: [],
});

/** Lỗi theo đường dẫn trường: "diaDiem.0.anh.1.alt: …" → { 'diaDiem.0.anh.1.alt': ['…'] }. */
export function gomLoi(chiTiet: string[] | undefined): Record<string, string[]> {
  const kq: Record<string, string[]> = {};
  for (const dong of chiTiet ?? []) {
    const m = /^([A-Za-z0-9_.()À-ỹ ]+?):\s(.*)$/.exec(dong);
    const khoa = m ? m[1]!.trim() : '_chung';
    (kq[khoa] ??= []).push(m ? m[2]! : dong);
  }
  return kq;
}
/** Các lỗi bắt đầu bằng `tienTo` (vd cho cả khối "traNhanh"). */
export const loiCua = (loi: Record<string, string[]>, tienTo: string): string[] =>
  Object.entries(loi).filter(([k]) => k === tienTo || k.startsWith(`${tienTo}.`)).flatMap(([, v]) => v);
