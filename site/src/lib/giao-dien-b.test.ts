import type { BaiViet } from '@vntraveltips/schema';
import { describe, expect, it } from 'vitest';
import type { ChuyenMuc } from './chuyen-muc';
import { baiMoiNhat, chuDeNoiBat, dinhDangTien, nhanDauBai, nhanTheBai } from './giao-dien-b';

const traNhanhMau = {
  hopVoi: 'Bé từ 2 tuổi',
  thoiGian: '2 ngày 1 đêm',
  tongChiPhi: 6800000,
  soNguoi: 3,
  diemThanThienVoiBe: 4,
  diChuyen: 'Xe máy',
  thoiDiemNenDi: 'Tháng 4',
  luuYVoiBe: [],
};

function taoBai(ghiDe: Partial<BaiViet> = {}): BaiViet {
  return {
    tieuDe: 'Bài thử',
    slug: 'bai-thu',
    moTa: 'Mô tả bài thử',
    loai: 'nhat-ky',
    chuyenMuc: [],
    tags: [],
    anhBia: { ma: 'anh-thu', alt: 'Ảnh thử' },
    ngayDang: new Date('2026-10-01'),
    diaDiem: [],
    doMangChoBe: [],
    faq: [],
    hopTac: false,
    draft: false,
    ...ghiDe,
  } as BaiViet;
}

describe('baiMoiNhat', () => {
  it('ngày đăng giảm dần, cùng ngày thì slug tăng dần; không đổi mảng gốc', () => {
    const p1 = taoBai({ slug: 'c', ngayDang: new Date('2026-10-01') });
    const p2 = taoBai({ slug: 'b', ngayDang: new Date('2026-10-05') });
    const p3 = taoBai({ slug: 'a', ngayDang: new Date('2026-10-05') });
    const mang = [p1, p2, p3];

    expect(baiMoiNhat(mang).map((b) => b.slug)).toEqual(['a', 'b', 'c']);
    expect(mang.map((b) => b.slug)).toEqual(['c', 'b', 'a']);
  });

  it('toiDa giới hạn số bài trả về', () => {
    const mang = [taoBai({ slug: 'a' }), taoBai({ slug: 'b' }), taoBai({ slug: 'c' })];
    expect(baiMoiNhat(mang, 2)).toHaveLength(2);
  });
});

describe('nhanTheBai', () => {
  it('có tên tỉnh và traNhanh: tỉnh, điểm với bé, tổng chi phí', () => {
    const bai = taoBai({ traNhanh: traNhanhMau });
    expect(nhanTheBai(bai, 'vi', 'Vũng Tàu')).toEqual([
      { chu: 'Vũng Tàu' },
      { bieuTuong: '👶', chu: '4/5 với bé' },
      { bieuTuong: '💰', chu: '6.800.000đ' },
    ]);
  });

  it('bài top-list không tỉnh, không traNhanh: rỗng, không có "undefined"', () => {
    const nhan = nhanTheBai(taoBai({ loai: 'top-list' }), 'vi');
    expect(nhan).toEqual([]);
    expect(JSON.stringify(nhan)).not.toContain('undefined');
  });
});

describe('nhanDauBai', () => {
  it('nhật ký có tỉnh và traNhanh: tỉnh, loại bài, điểm với bé', () => {
    const bai = taoBai({ loai: 'nhat-ky', traNhanh: traNhanhMau });
    expect(nhanDauBai(bai, 'vi', 'Vũng Tàu')).toEqual([
      { chu: 'Vũng Tàu' },
      { chu: 'Nhật ký chuyến đi' },
      { bieuTuong: '👶', chu: '4/5 với bé' },
    ]);
  });

  it('cẩm nang không tỉnh: chỉ có loại bài', () => {
    expect(nhanDauBai(taoBai({ loai: 'cam-nang' }), 'vi')).toEqual([{ chu: 'Cẩm nang' }]);
  });
});

describe('chuDeNoiBat', () => {
  const cmA: ChuyenMuc = { slug: 'a', ten: 'A', moTa: '', thuTu: 0 };
  const cmB: ChuyenMuc = { slug: 'b', ten: 'B', moTa: '', thuTu: 1, anhBia: { ma: 'b-bia', alt: 'Bìa B' } };
  const cmC: ChuyenMuc = { slug: 'c', ten: 'C', moTa: '', thuTu: 2 };

  const baiA = taoBai({ slug: 'bai-a', chuyenMuc: ['a'], anhBia: { ma: 'a-bia', alt: 'Bìa A' } });
  const baiB1 = taoBai({ slug: 'bai-b1', chuyenMuc: ['b'], ngayDang: new Date('2026-10-01') });
  const baiB2 = taoBai({ slug: 'bai-b2', chuyenMuc: ['b'], ngayDang: new Date('2026-10-09'), anhBia: { ma: 'b2-bia', alt: 'Bìa B2' } });

  it('chỉ chuyên mục có bài, nhiều bài đứng trước; chuyên mục không bài bị bỏ', () => {
    const ds = chuDeNoiBat([cmA, cmB, cmC], [baiA, baiB1, baiB2]);
    expect(ds.map((d) => d.slug)).toEqual(['b', 'a']);
    expect(ds[0].soBai).toBe(2);
  });

  it('chuyên mục có anhBia dùng anhBia; không có thì lấy ảnh bìa bài mới nhất', () => {
    const [chuB, chuA] = chuDeNoiBat([cmA, cmB, cmC], [baiA, baiB1, baiB2]);
    expect(chuB.anh).toEqual({ ma: 'b-bia', alt: 'Bìa B' });
    expect(chuA.anh).toEqual({ ma: 'a-bia', alt: 'Bìa A' });
  });

  it('tối đa 8 chuyên mục', () => {
    const cacCm: ChuyenMuc[] = Array.from({ length: 10 }, (_, i) => ({ slug: `c${i}`, ten: `C${i}`, moTa: '', thuTu: i }));
    const cacBai = cacCm.map((cm) => taoBai({ slug: `bai-${cm.slug}`, chuyenMuc: [cm.slug] }));
    expect(chuDeNoiBat(cacCm, cacBai)).toHaveLength(8);
  });
});

describe('dinhDangTien', () => {
  it('tiếng Việt: dấu chấm ngăn nghìn và hậu tố đ', () => {
    expect(dinhDangTien(6800000, 'vi')).toBe('6.800.000đ');
  });
});
