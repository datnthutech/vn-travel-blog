// Review cuối #7: bản tin "bài mới" từ BẢN DỊCH phải lấy ảnh bìa của bản gốc tiếng Việt (bản dịch chỉ lưu chữ),
// và chỉ tạo được khi bản tiếng Việt cũng đang đăng (không thì link bản dịch là 404 sau khi xuất).
import { describe, expect, it } from 'vitest';
import { moDb } from '../db/ket-noi';
import { nhapTuBai } from './gui';

function chuanBi(trangThaiVi: string) {
  const db = moDb(':memory:');
  db.prepare("INSERT OR IGNORE INTO ngon_ngu (ma, ten, bat, thu_tu) VALUES ('en', 'English', 1, 1)").run();
  db.prepare("INSERT INTO bai (id, tinh, loai, tao_luc, sua_luc) VALUES (1, 'quang-nam', 'nhat-ky', 0, 0)").run();
  const them = (nn: string, slug: string, trangThai: string, du: object) =>
    db.prepare('INSERT INTO ban_dich (bai_id, ngon_ngu, slug, trang_thai, du_lieu, noi_dung, sua_luc) VALUES (1, ?, ?, ?, ?, ?, 0)').run(nn, slug, trangThai, JSON.stringify(du), '');
  them('vi', 'pho-co-hoi-an', trangThaiVi, { tieuDe: 'Phố cổ', slug: 'pho-co-hoi-an', moTa: 'mô tả', anhBia: { ma: 'anh-bia', alt: 'x' }, tinh: 'quang-nam' });
  them('en', 'hoi-an-old-town', 'da-dang', { tieuDe: 'Old town', slug: 'hoi-an-old-town', moTa: 'desc', anhBiaAlt: 'x' });
  return db;
}

describe('nhapTuBai từ bản dịch', () => {
  it('ảnh bìa lấy từ bản tiếng Việt, link là URL bản dịch', () => {
    const b = nhapTuBai(chuanBi('da-dang'), 1, 'en', 'https://vtt.example', () => 0)!;
    expect(b.noiDung).toContain('https://vtt.example/anh/anh-bia/960.webp');
    expect(b.noiDung).toContain('https://vtt.example/en/quang-nam/hoi-an-old-town/');
    expect(b.tieuDe).toBe('Old town');
  });

  it('bản tiếng Việt chưa đăng → không tạo được (undefined → API trả 404)', () => {
    expect(nhapTuBai(chuanBi('nhap'), 1, 'en', 'https://vtt.example', () => 0)).toBeUndefined();
  });
});
