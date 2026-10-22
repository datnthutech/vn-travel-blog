// Kiểm tra bản dịch do AI trả về TRƯỚC khi người dùng lưu: chỉ cảnh báo (không chặn, không sửa). Hàm thuần.
import type { BanDichChu } from '@vntraveltips/schema';

const MA_ANH = /\(\s*anh:([A-Za-z0-9]+)\s*\)/g;
const LINK = /\]\(\s*([^)\s]+)[^)]*\)/g;

const tap = (re: RegExp, s: string): string[] => [...s.matchAll(re)].map((m) => m[1]!);
const dem = (ds: string[]): Map<string, number> => ds.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map<string, number>());

function lech(a: string[], b: string[]): { mat: string[]; them: string[] } {
  const da = dem(a);
  const db = dem(b);
  return {
    mat: [...da].filter(([k, n]) => (db.get(k) ?? 0) < n).map(([k]) => k),
    them: [...db].filter(([k, n]) => (da.get(k) ?? 0) < n).map(([k]) => k),
  };
}

export function kiemTraBanDich(goc: BanDichChu, dich: Pick<BanDichChu, 'noiDung' | 'moTa'> & Partial<BanDichChu>): string[] {
  const canhBao: string[] = [];
  const anh = lech(tap(MA_ANH, goc.noiDung), tap(MA_ANH, dich.noiDung));
  if (anh.mat.length) canhBao.push(`Bản dịch làm MẤT ảnh trong thân bài (mã: ${anh.mat.join(', ')}) — cú pháp ![mô tả](anh:MÃ) phải giữ nguyên.`);
  if (anh.them.length) canhBao.push(`Bản dịch có ảnh LẠ không có ở bản gốc (mã: ${anh.them.join(', ')}).`);
  const link = lech(tap(LINK, goc.noiDung).filter((u) => !u.startsWith('anh:')), tap(LINK, dich.noiDung).filter((u) => !u.startsWith('anh:')));
  if (link.mat.length) canhBao.push(`Bản dịch làm MẤT hoặc đổi link (${link.mat.join(', ')}).`);
  if (link.them.length) canhBao.push(`Bản dịch có link LẠ không có ở bản gốc (${link.them.join(', ')}).`);

  const soLuong = (ten: string, a: number | undefined, b: number | undefined) => {
    if ((a ?? 0) !== (b ?? 0)) canhBao.push(`Số phần tử "${ten}" khác bản gốc: gốc ${a ?? 0}, bản dịch ${b ?? 0}.`);
  };
  soLuong('diaDiem', goc.diaDiem.length, dich.diaDiem?.length);
  soLuong('doMangChoBe', goc.doMangChoBe.length, dich.doMangChoBe?.length);
  soLuong('faq', goc.faq.length, dich.faq?.length);
  soLuong('traNhanh.luuYVoiBe', goc.traNhanh?.luuYVoiBe.length, dich.traNhanh?.luuYVoiBe.length);
  if (dich.diaDiem && dich.diaDiem.length === goc.diaDiem.length) {
    goc.diaDiem.forEach((g, i) => {
      const d = dich.diaDiem![i]!;
      soLuong(`diaDiem[${i}].anhAlt`, g.anhAlt.length, d.anhAlt?.length);
      soLuong(`diaDiem[${i}].uuDiem`, g.uuDiem.length, d.uuDiem?.length);
      soLuong(`diaDiem[${i}].nhuocDiem`, g.nhuocDiem.length, d.nhuocDiem?.length);
    });
  }
  if (goc.traNhanh && !dich.traNhanh) canhBao.push('Bản dịch thiếu khối "Tra nhanh" (traNhanh).');
  const n = [...dich.moTa].length;
  if (n < 120 || n > 160) canhBao.push(`Mô tả (moTa) dài ${n} ký tự; cần từ 120 đến 160 để lưu/đăng được.`);
  return canhBao;
}
