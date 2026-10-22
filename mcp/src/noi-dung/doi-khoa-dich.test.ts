// Review cuối #2: đổi slug tiếng Việt của chuyên mục/tỉnh/trang tĩnh → bản dịch phải đi theo (không thành mồ côi).
import { describe, expect, it } from 'vitest';
import { moDb } from '../db/ket-noi';
import { suaChuyenMuc, themChuyenMuc } from './chuyen-muc';
import { chuyenKhoaDichMenu } from './doi-khoa-dich';
import { suaTinh } from './tinh';
import { suaTrang, themTrang } from './trang';

const khoaDich = (db: ReturnType<typeof moDb>, loai: string) =>
  (db.prepare('SELECT khoa FROM dich_cau_truc WHERE loai = ? ORDER BY khoa').all(loai) as { khoa: string }[]).map((r) => r.khoa);
const themDich = (db: ReturnType<typeof moDb>, loai: string, khoa: string) =>
  db.prepare("INSERT INTO dich_cau_truc (loai, khoa, ngon_ngu, du_lieu, sua_luc) VALUES (?, ?, 'en', '{}', 0)").run(loai, khoa);

describe('đổi slug → khoá bản dịch cấu trúc đổi theo', () => {
  it('chuyên mục', () => {
    const db = moDb(':memory:');
    themChuyenMuc(db, { ten: 'Ẩm thực', slug: 'am-thuc' });
    themDich(db, 'chuyen-muc', 'am-thuc');
    suaChuyenMuc(db, 'am-thuc', { slug: 'an-ngon' });
    expect(khoaDich(db, 'chuyen-muc')).toEqual(['an-ngon']);
  });

  it('tỉnh', () => {
    const db = moDb(':memory:');
    db.prepare('INSERT INTO tinh (slug, du_lieu) VALUES (?, ?)').run('quang-nam', JSON.stringify({ ten: 'Quảng Nam', slug: 'quang-nam', gioiThieu: 'x', anhBia: { ma: 'a', alt: 'x' }, moTa: 'x' }));
    themDich(db, 'tinh', 'quang-nam');
    suaTinh(db, 'quang-nam', { slug: 'quang-nam-moi' });
    expect(khoaDich(db, 'tinh')).toEqual(['quang-nam-moi']);
  });

  it('trang tĩnh', () => {
    const db = moDb(':memory:');
    db.prepare("INSERT INTO nguoi_dung (id, email, ten, vai_tro, mat_khau_bam, bi_khoa, tao_luc) VALUES (1, 'a@b.c', 'A', 'quan-tri', 'x', 0, 0)").run();
    themTrang(db, { slug: 've-chung-toi', tieuDe: 'Về chúng tôi', noiDung: 'x' }, 1);
    themDich(db, 'trang', 've-chung-toi');
    suaTrang(db, 've-chung-toi', { slug: 'gioi-thieu-gia-dinh' }, 1);
    expect(khoaDich(db, 'trang')).toEqual(['gioi-thieu-gia-dinh']);
  });
});

describe('review cuối #6: bản dịch nhãn menu đi theo mục khi đổi thứ tự/chèn/xoá', () => {
  type Muc = { nhan: string; loai: string; giaTri: string; con?: Muc[] };
  const muc = (loai: string, giaTri: string, con?: Muc[]): Muc => ({ nhan: giaTri, loai, giaTri, ...(con ? { con } : {}) });
  const nhan = (db: ReturnType<typeof moDb>) =>
    Object.fromEntries((db.prepare("SELECT khoa, du_lieu FROM dich_cau_truc WHERE loai = 'menu' ORDER BY khoa").all() as { khoa: string; du_lieu: string }[])
      .map((r) => [r.khoa, JSON.parse(r.du_lieu).nhan]));
  const dich = (db: ReturnType<typeof moDb>, khoa: string, n: string) =>
    db.prepare("INSERT INTO dich_cau_truc (loai, khoa, ngon_ngu, du_lieu, sua_luc) VALUES ('menu', ?, 'en', ?, 0)").run(khoa, JSON.stringify({ nhan: n }));

  it('đổi thứ tự + chèn mục mới + xoá mục + mục con', () => {
    const db = moDb(':memory:');
    const cu = { dauTrang: [muc('chuyen-muc', 'am-thuc'), muc('trang', 'gioi-thieu', [muc('tinh', 'da-lat')]), muc('link', '/tim-kiem/')], chanTrang: [] };
    dich(db, 'dauTrang.0', 'Food');
    dich(db, 'dauTrang.1', 'About');
    dich(db, 'dauTrang.1.0', 'Da Lat');
    dich(db, 'dauTrang.2', 'Search');
    // Giới thiệu lên đầu, chèn một mục mới ở giữa, bỏ "Tìm kiếm"; mục con vẫn dưới Giới thiệu.
    const moi = { dauTrang: [muc('trang', 'gioi-thieu', [muc('tinh', 'da-lat')]), muc('tinh', 'vung-tau'), muc('chuyen-muc', 'am-thuc')], chanTrang: [] };
    chuyenKhoaDichMenu(db, cu, moi);
    expect(nhan(db)).toEqual({ 'dauTrang.0': 'About', 'dauTrang.0.0': 'Da Lat', 'dauTrang.2': 'Food' });
  });
});

