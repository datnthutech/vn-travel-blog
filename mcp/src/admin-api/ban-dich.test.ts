// API bản dịch bài + xuất đa ngôn ngữ: bài vi phải đăng trước, "cũ hơn bản gốc", đã kiểm tra, thùng rác (Review Focus), frontmatter banDich.
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { tachTruongChu, baiVietSchema, type BanDichChu } from '@vntraveltips/schema';
import { beforeEach, describe, expect, it } from 'vitest';
import { dangBaiDenHan } from '../noi-dung/hen-gio';
import { xuatNoiDung } from '../noi-dung/xuat';
import { baiDayDu, dungAdmin, taoAnhGia } from './thu-nghiem';

type Moi = Awaited<ReturnType<typeof dungAdmin>>;
let m: Moi;
beforeEach(async () => {
  m = await dungAdmin();
  taoAnhGia(m.anhDir, 'anh1');
  await m.chinh.gui('post', '/ngon-ngu', { ma: 'en', ten: 'English' });
});
const taoBai = async (slug: string, dang = true, phien = m.chinh) => {
  const id = (await phien.gui('post', '/bai', { bai: baiDayDu(slug), noiDung: 'Xin chào ![biển](anh:anh1)' })).body.id as number;
  if (dang) expect((await phien.gui('post', `/bai/${id}/dang`)).status).toBe(200);
  return id;
};
/** Bản dịch en hợp lệ dựng từ chính phần chữ của bản gốc (đổi tiêu đề/slug). */
const dichEn = async (id: number, over: Partial<BanDichChu> = {}) => {
  const goc = (await m.chinh.gui('get', `/bai/${id}/ban-dich/en`)).body.banGoc as BanDichChu;
  return { ...goc, tieuDe: 'English title', slug: `en-${goc.slug}`, moTa: 'b'.repeat(130), ...over };
};
const luuEn = async (id: number, dich: object, phienSo?: number) => m.chinh.gui('put', `/bai/${id}/ban-dich/en`, { dich, ...(phienSo === undefined ? {} : { phienSo }) });
const xuat = (target: 'production' | 'preview' = 'production') => {
  const d = mkdtempSync(join(tmpdir(), 'vtt-bd-'));
  xuatNoiDung(m.db, d, target, m.anhDir);
  return d;
};
const doc = (d: string, p: string) => readFileSync(join(d, p), 'utf8');

describe('GET / PUT bản dịch', () => {
  it('chưa dịch → trangThai chua-dich + banGoc là phần chữ của bản vi; ngôn ngữ lạ → 404; bài lạ → 404', async () => {
    const id = await taoBai('bai-a');
    const r = (await m.chinh.gui('get', `/bai/${id}/ban-dich/en`)).body;
    expect(r).toMatchObject({ ngonNgu: 'en', trangThai: 'chua-dich', dich: null, phienSo: 0, cuHonBanGoc: false });
    expect(r.banGoc.tieuDe).toBe('Bài bai-a');
    expect((await m.chinh.gui('get', `/bai/${id}/ban-dich/fr`)).status).toBe(404);
    expect((await m.chinh.gui('get', `/bai/${id}/ban-dich/vi`)).status).toBe(404);
    expect((await m.chinh.gui('get', '/bai/9999/ban-dich/en')).status).toBe(404);
  });

  it('lưu bản dịch (nháp): GET trả lại đúng, ghi lịch sử phiên bản theo (bài, ngôn ngữ), phienSo tăng; xung đột phienSo → 409', async () => {
    const id = await taoBai('bai-a');
    const soPhienVi = ((await m.chinh.gui('get', `/bai/${id}/phien-ban`)).body as unknown[]).length;
    const r1 = await luuEn(id, await dichEn(id));
    expect(r1.status).toBe(200);
    expect(r1.body.phienSo).toBe(1);
    expect((await m.chinh.gui('get', `/bai/${id}/ban-dich/en`)).body).toMatchObject({ trangThai: 'nhap', phienSo: 1, dich: { tieuDe: 'English title', slug: 'en-bai-a' } });
    expect((await luuEn(id, await dichEn(id, { tieuDe: 'Sửa' }), 1)).body.phienSo).toBe(2);
    expect((await luuEn(id, await dichEn(id), 1)).status).toBe(409);
    const ls = (await m.chinh.gui('get', `/bai/${id}/ban-dich/en/phien-ban`)).body as { id: number }[];
    expect(ls).toHaveLength(2);
    expect((await m.chinh.gui('get', `/bai/${id}/ban-dich/en/phien-ban/${ls[0]!.id}`)).body.dich.tieuDe).toBe('Sửa');
    expect((await m.chinh.gui('get', `/bai/${id}/phien-ban`)).body).toHaveLength(soPhienVi); // lịch sử bản vi KHÔNG lẫn bản dịch
  });

  it('thiếu noiDung / slug sai → 400; slug trùng bản dịch khác CÙNG ngôn ngữ → 409; slug trùng slug tiếng Việt thì được (đường dẫn khác nhau)', async () => {
    const a = await taoBai('bai-a');
    const b = await taoBai('bai-b');
    expect((await m.chinh.gui('put', `/bai/${a}/ban-dich/en`, { dich: { tieuDe: 'x' } })).status).toBe(400);
    expect((await luuEn(a, { ...(await dichEn(a)), slug: 'Sai Slug' })).status).toBe(400);
    expect((await luuEn(a, await dichEn(a, { slug: 'trung' }))).status).toBe(200);
    expect((await luuEn(b, await dichEn(b, { slug: 'trung' }))).status).toBe(409);
    expect((await luuEn(b, await dichEn(b, { slug: 'bai-a' }))).status).toBe(200);
  });

  it('bản vi còn nháp thiếu trường → không dịch được (400, nêu rõ)', async () => {
    const id = (await m.chinh.gui('post', '/bai', { bai: { tieuDe: 'Nháp thiếu', slug: 'nhap-thieu' }, noiDung: 'x' })).body.id;
    const r = await m.chinh.gui('put', `/bai/${id}/ban-dich/en`, { dich: { tieuDe: 'x', slug: 'x', noiDung: 'y' } });
    expect(r.status).toBe(400);
    expect(r.body.loi).toMatch(/tiếng Việt/);
  });
});

describe('đăng bản dịch', () => {
  it('đăng bản en khi bản vi còn nháp → 409; đăng bản vi rồi đăng en → 200 và có trong production', async () => {
    const id = await taoBai('bai-a', false);
    await luuEn(id, await dichEn(id));
    // bản vi còn nháp: không dịch được ở bước lưu? (vi nháp hợp lệ vẫn dịch được) → nhưng đăng en phải bị chặn
    const r = await m.chinh.gui('post', `/bai/${id}/ban-dich/en/dang`);
    expect(r.status).toBe(409);
    expect(r.body.loi).toMatch(/tiếng Việt/);
    await m.chinh.gui('post', `/bai/${id}/dang`);
    expect((await m.chinh.gui('post', `/bai/${id}/ban-dich/en/dang`)).status).toBe(200);
    expect(existsSync(join(xuat(), 'bai-viet/en/en-bai-a.md'))).toBe(true);
  });

  it('bản dịch lệch cấu trúc (mất ảnh trong thân) → đăng bị chặn 400 kèm chi tiết; chưa có bản dịch → 409', async () => {
    const id = await taoBai('bai-a');
    expect((await m.chinh.gui('post', `/bai/${id}/ban-dich/en/dang`)).status).toBe(409);
    await luuEn(id, await dichEn(id, { noiDung: 'Hello ![](anh:anh1)' })); // alt rỗng → kiểm tra bài chặn
    const r = await m.chinh.gui('post', `/bai/${id}/ban-dich/en/dang`);
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.body.chiTiet)).toMatch(/alt/);
  });

  it('gỡ bản dịch → về nháp, biến khỏi production; hẹn giờ + tới hạn → đăng (chỉ khi bài vi đã đăng)', async () => {
    const id = await taoBai('bai-a');
    await luuEn(id, await dichEn(id));
    await m.chinh.gui('post', `/bai/${id}/ban-dich/en/dang`);
    expect(existsSync(join(xuat(), 'bai-viet/en/en-bai-a.md'))).toBe(true);
    expect((await m.chinh.gui('post', `/bai/${id}/ban-dich/en/go`)).status).toBe(200);
    expect(existsSync(join(xuat(), 'bai-viet/en/en-bai-a.md'))).toBe(false);
    expect((await m.chinh.gui('post', `/bai/${id}/ban-dich/en/go`)).status).toBe(409);
    expect((await m.chinh.gui('post', `/bai/${id}/ban-dich/en/hen-gio`, { luc: '2020-01-01T00:00' })).status).toBe(400); // quá khứ
    const luc = '2026-10-21T15:00'; // giờ VN; hiện là 10:00 VN cùng ngày
    expect((await m.chinh.gui('post', `/bai/${id}/ban-dich/en/hen-gio`, { luc })).status).toBe(200);
    expect((await m.chinh.gui('get', `/bai/${id}/ban-dich/en`)).body.trangThai).toBe('hen-gio');
    m.dongHo.v = Date.UTC(2026, 9, 21, 9, 0, 0); // 16:00 giờ VN, sau giờ hẹn (vẫn trong hạn phiên đăng nhập)
    expect(dangBaiDenHan(m.db, m.dongHo.v)).toEqual([id]);
    expect((await m.chinh.gui('get', `/bai/${id}/ban-dich/en`)).body.trangThai).toBe('da-dang');
    expect(existsSync(join(xuat(), 'bai-viet/en/en-bai-a.md'))).toBe(true);
    expect((await m.chinh.gui('post', `/bai/${id}/ban-dich/en/huy-hen-gio`)).status).toBe(409);
  });

  it('đổi slug bản dịch ĐÃ ĐĂNG → redirect /en/… cũ → mới (và redirect xuất ra khi đích đã đăng)', async () => {
    const id = await taoBai('bai-a');
    await luuEn(id, await dichEn(id, { slug: 'old-slug' }));
    await m.chinh.gui('post', `/bai/${id}/ban-dich/en/dang`);
    expect((await luuEn(id, await dichEn(id, { slug: 'new-slug' }))).status).toBe(200);
    expect(m.db.prepare("SELECT den FROM redirect WHERE tu = '/en/kinh-nghiem/old-slug/'").get()).toEqual({ den: '/en/kinh-nghiem/new-slug/' });
    expect(JSON.parse(doc(xuat(), 'redirects.json'))).toContainEqual({ tu: '/en/kinh-nghiem/old-slug/', den: '/en/kinh-nghiem/new-slug/' });
  });
});

describe('review GĐ7', () => {
  it('đổi slug/tỉnh bài tiếng Việt đã đăng → URL bản dịch /en/… cũng có redirect (Review: mất SEO bản dịch)', async () => {
    const id = await taoBai('bai-a');
    await luuEn(id, await dichEn(id, { slug: 'en-a' }));
    await m.chinh.gui('post', `/bai/${id}/ban-dich/en/dang`);
    const vi = (await m.chinh.gui('get', `/bai/${id}`)).body;
    expect((await m.chinh.gui('put', `/bai/${id}`, { bai: { ...vi.bai, slug: 'bai-a-moi' }, noiDung: vi.noiDung, phienSo: vi.phienSo })).status).toBe(200);
    const rd = Object.fromEntries((m.db.prepare('SELECT tu, den FROM redirect').all() as { tu: string; den: string }[]).map((r) => [r.tu, r.den]));
    expect(rd['/kinh-nghiem/bai-a/']).toBe('/kinh-nghiem/bai-a-moi/');
    // Sửa ở review cuối (#1): bản dịch có slug RIÊNG (`en-a`) nên URL thật là /en/kinh-nghiem/en-a/ — đổi slug bản tiếng Việt KHÔNG làm
    // URL đó đổi. Trước đây test này kỳ vọng redirect /en/kinh-nghiem/bai-a/ → /en/kinh-nghiem/bai-a-moi/: cả hai URL đều chưa từng tồn tại.
    expect(rd['/en/kinh-nghiem/bai-a/']).toBeUndefined();
    expect(Object.keys(rd).some((k) => k === '/en/kinh-nghiem/en-a/')).toBe(false); // URL bản dịch vẫn đang dùng, không bị chuyển đi
    expect(Object.keys(rd).some((k) => k.startsWith('/en/en/'))).toBe(false);
  });

  it('lưu bản dịch KHÔNG đổi người sửa cuối / thời điểm sửa của bản tiếng Việt; người sửa bản dịch lấy từ lịch sử của chính ngôn ngữ đó', async () => {
    const id = await taoBai('bai-a');
    const truoc = m.db.prepare('SELECT nguoi_sua_cuoi_id, sua_luc FROM bai WHERE id = ?').get(id);
    const w = await m.dangNhap('w@x.vn', 'Dịch giả', 'quan-ly');
    m.dongHo.v += 60_000;
    expect((await w.gui('put', `/bai/${id}/ban-dich/en`, { dich: await dichEn(id) })).status).toBe(200);
    expect(m.db.prepare('SELECT nguoi_sua_cuoi_id, sua_luc FROM bai WHERE id = ?').get(id)).toEqual(truoc);
    const r = await m.chinh.gui('put', `/bai/${id}/ban-dich/en`, { dich: await dichEn(id), phienSo: 0 + 5 });
    expect(r.status).toBe(409);
    expect(r.body.nguoiSua).toBe('Dịch giả'); // xung đột trên bản dịch nêu đúng người sửa bản dịch
    expect((await m.chinh.gui('get', `/bai/${id}/ban-dich/en`)).body.nguoiSuaCuoi).toMatchObject({ ten: 'Dịch giả' });
  });

  it('bản dịch cấu trúc mồ côi (chuyên mục đã xoá, mục menu đã bớt) không được xuất', async () => {
    m.db.prepare("INSERT INTO dich_cau_truc (loai, khoa, ngon_ngu, du_lieu, sua_luc) VALUES ('chuyen-muc', 'da-xoa', 'en', '{\"ten\":\"Old\"}', 0), ('menu', 'dauTrang.9', 'en', '{\"nhan\":\"Old\"}', 0)").run();
    const { mkdtempSync, readFileSync } = await import('node:fs');
    const d = mkdtempSync(join((await import('node:os')).tmpdir(), 'vtt-mc-'));
    xuatNoiDung(m.db, d, 'production', m.anhDir);
    expect(JSON.parse(readFileSync(join(d, 'dich-cau-truc.json'), 'utf8'))).toEqual([]);
  });
});

describe('xem trước bản dịch (Review)', () => {
  it('lưu rồi trả URL xem trước /en/…, noiDungPhien và yêu cầu build; bản chưa đủ cấu trúc → hopLe=false, không có URL', async () => {
    const id = await taoBai('bai-a');
    const truoc = m.yeuCau.so;
    const r = await m.chinh.gui('post', `/bai/${id}/ban-dich/en/xem-truoc`, { dich: await dichEn(id, { slug: 'xem-thu' }) });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ url: 'http://nhap.localhost:8090/en/kinh-nghiem/xem-thu/', hopLe: true, phienSo: 1 });
    expect(typeof r.body.noiDungPhien).toBe('number');
    expect(m.yeuCau.so).toBeGreaterThan(truoc);
    expect((await m.chinh.gui('get', `/bai/${id}/ban-dich/en`)).body.dich.slug).toBe('xem-thu'); // đã lưu
    const lech = await m.chinh.gui('post', `/bai/${id}/ban-dich/en/xem-truoc`, { dich: { ...(await dichEn(id)), diaDiem: [{ ten: 'thừa', uuDiem: [], nhuocDiem: [], anhAlt: [] }] }, phienSo: 1 });
    expect(lech.body.hopLe).toBe(false);
    expect(lech.body.url).toBe('');
    expect(lech.body.loi.join(' ')).toMatch(/diaDiem/);
    expect((await m.chinh.gui('post', `/bai/${id}/ban-dich/en/xem-truoc`, { dich: await dichEn(id), phienSo: 1 })).status).toBe(409); // phienSo cũ
    const w = await m.dangNhap('w@x.vn', 'W', 'writer');
    expect((await w.gui('post', `/bai/${id}/ban-dich/en/xem-truoc`, { dich: await dichEn(id) })).status).toBe(403);
  });

  it('Tổng quan đếm bản dịch thiếu/cũ theo ngôn ngữ (banDichThieuHoacCu = chưa dịch + cũ)', async () => {
    const a = await taoBai('bai-a');
    await taoBai('bai-b');
    expect((await m.chinh.gui('get', '/tong-quan')).body).toMatchObject({ banDichThieuHoacCu: 2, banDich: { en: { chua: 2, cu: 0 } }, giaoDienThieu: {} });
    await luuEn(a, await dichEn(a));
    const vi = (await m.chinh.gui('get', `/bai/${a}`)).body;
    await m.chinh.gui('put', `/bai/${a}`, { bai: { ...vi.bai, tieuDe: 'Gốc đổi' }, noiDung: vi.noiDung, phienSo: vi.phienSo });
    expect((await m.chinh.gui('get', '/tong-quan')).body).toMatchObject({ banDichThieuHoacCu: 2, banDich: { en: { chua: 1, cu: 1 } } });
    await m.chinh.gui('put', '/ngon-ngu/en', { bat: false });
    expect((await m.chinh.gui('get', '/tong-quan')).body).toMatchObject({ banDichThieuHoacCu: 0, banDich: {} });
  });
});

describe('bản dịch cũ hơn bản gốc + đã kiểm tra', () => {
  it('sửa tieuDe bản vi → cuHonBanGoc=true; sửa trường KHÔNG phải chữ (tinh/ngày) thì không; lưu lại bản dịch xoá "đã kiểm tra" và hết cũ', async () => {
    const id = await taoBai('bai-a');
    await luuEn(id, await dichEn(id));
    expect((await m.chinh.gui('post', `/bai/${id}/ban-dich/en/kiem-tra`, { daKiemTra: true, ghiChu: 'Ổn' })).status).toBe(200);
    const g = (await m.chinh.gui('get', `/bai/${id}/ban-dich/en`)).body;
    expect(g).toMatchObject({ cuHonBanGoc: false, daKiemTra: true, ghiChuKiemTra: 'Ổn', nguoiKiemTra: { ten: 'Chủ blog' } });

    const vi = (await m.chinh.gui('get', `/bai/${id}`)).body;
    const putVi = (bai: object, phienSo: number) => m.chinh.gui('put', `/bai/${id}`, { bai, noiDung: vi.noiDung, phienSo });
    expect((await putVi({ ...vi.bai, ngayCapNhat: '2026-10-21' }, vi.phienSo)).status).toBe(200);
    expect((await m.chinh.gui('get', `/bai/${id}/ban-dich/en`)).body.cuHonBanGoc).toBe(false); // không phải chữ

    const vi2 = (await m.chinh.gui('get', `/bai/${id}`)).body;
    expect((await putVi({ ...vi2.bai, tieuDe: 'Tiêu đề mới' }, vi2.phienSo)).status).toBe(200);
    expect((await m.chinh.gui('get', `/bai/${id}/ban-dich/en`)).body.cuHonBanGoc).toBe(true);

    expect((await luuEn(id, await dichEn(id, { tieuDe: 'Updated' }))).status).toBe(200);
    expect((await m.chinh.gui('get', `/bai/${id}/ban-dich/en`)).body).toMatchObject({ cuHonBanGoc: false, daKiemTra: false, ghiChuKiemTra: null });
  });

  it('danh sách bài: thêm cột banDich; lọc thieuBanDich=en và banDichCu=en', async () => {
    const a = await taoBai('bai-a');
    const b = await taoBai('bai-b');
    await luuEn(a, await dichEn(a));
    const vi = (await m.chinh.gui('get', `/bai/${a}`)).body;
    await m.chinh.gui('put', `/bai/${a}`, { bai: { ...vi.bai, tieuDe: 'Đổi gốc' }, noiDung: vi.noiDung, phienSo: vi.phienSo });
    const ds = (await m.chinh.gui('get', '/bai')).body.bai as { id: number; banDich: Record<string, { trangThai: string; cu?: boolean }> }[];
    expect(ds.find((x) => x.id === a)!.banDich.en).toMatchObject({ trangThai: 'nhap', cu: true });
    expect(ds.find((x) => x.id === b)!.banDich.en).toEqual({ trangThai: 'chua-dich' });
    expect(((await m.chinh.gui('get', '/bai?thieuBanDich=en')).body.bai as { id: number }[]).map((x) => x.id)).toEqual([b]);
    expect(((await m.chinh.gui('get', '/bai?banDichCu=en')).body.bai as { id: number }[]).map((x) => x.id)).toEqual([a]);
    expect((await m.chinh.gui('get', '/bai?banDichCu=fr')).body.bai).toEqual([]);
  });

  it('writer đánh dấu "đã kiểm tra" bản dịch bài của NGƯỜI KHÁC → 200; nhưng không sửa/đăng bản dịch bài của người khác → 403', async () => {
    const id = await taoBai('bai-quan-tri');
    await luuEn(id, await dichEn(id));
    const w = await m.dangNhap('w@x.vn', 'Writer', 'writer');
    expect((await w.gui('post', `/bai/${id}/ban-dich/en/kiem-tra`, { daKiemTra: true })).status).toBe(200);
    expect((await w.gui('put', `/bai/${id}/ban-dich/en`, { dich: await dichEn(id) })).status).toBe(403);
    expect((await w.gui('post', `/bai/${id}/ban-dich/en/dang`)).status).toBe(403);
    expect((await w.gui('get', `/bai/${id}/ban-dich/en`)).status).toBe(200);
    expect((await w.gui('post', `/bai/${id}/ban-dich/en/kiem-tra`, { daKiemTra: 'có' })).status).toBe(400);
  });
});

describe('xuất đa ngôn ngữ', () => {
  it('production: bản dịch đã đăng có file bai-viet/en/<slug>.md (frontmatter ngonNgu, maBai, banDich), bản vi vẫn ở bai-viet/<slug>.md và có banDich.en; bản dịch NHÁP không xuất ở production nhưng có ở preview', async () => {
    const id = await taoBai('bai-a');
    await luuEn(id, await dichEn(id));
    const prod0 = xuat('production');
    expect(existsSync(join(prod0, 'bai-viet/en/en-bai-a.md'))).toBe(false);
    expect(doc(prod0, 'bai-viet/bai-a.md')).not.toContain('banDich');
    expect(existsSync(join(xuat('preview'), 'bai-viet/en/en-bai-a.md'))).toBe(true);

    await m.chinh.gui('post', `/bai/${id}/ban-dich/en/dang`);
    const prod = xuat('production');
    const en = doc(prod, 'bai-viet/en/en-bai-a.md');
    expect(en).toContain('ngonNgu: en');
    expect(en).toContain(`maBai: ${id}`);
    expect(en).toMatch(/banDich:\n {2}vi: \/kinh-nghiem\/bai-a\//);
    expect(en).toContain('tieuDe: English title');
    expect(doc(prod, 'bai-viet/bai-a.md')).toMatch(/banDich:\n {2}en: \/en\/kinh-nghiem\/en-bai-a\//);
    expect(doc(prod, 'bai-viet/bai-a.md')).not.toContain('ngonNgu');
    // file en ghép đúng: đọc lại được bằng schema (phần không phải chữ lấy từ bản vi)
    const fm = /^---\n([\s\S]*?)\n---/.exec(en)![1]!;
    const { parse } = await import('yaml');
    const obj = parse(fm);
    expect(baiVietSchema.safeParse(obj).success).toBe(true);
    expect(obj.anhBia.ma).toBe('anh1');
  });

  it('thùng rác / gỡ bài vi → mọi bản dịch của nó biến khỏi production (Review Focus), khôi phục thì trở lại', async () => {
    const id = await taoBai('bai-a');
    await luuEn(id, await dichEn(id));
    await m.chinh.gui('post', `/bai/${id}/ban-dich/en/dang`);
    expect(existsSync(join(xuat(), 'bai-viet/en/en-bai-a.md'))).toBe(true);
    await m.chinh.gui('post', `/bai/${id}/thung-rac`);
    expect(existsSync(join(xuat(), 'bai-viet/en/en-bai-a.md'))).toBe(false);
    expect(existsSync(join(xuat('preview'), 'bai-viet/en/en-bai-a.md'))).toBe(false);
    await m.chinh.gui('post', `/bai/${id}/khoi-phuc`);
    expect(existsSync(join(xuat(), 'bai-viet/en/en-bai-a.md'))).toBe(true);
    await m.chinh.gui('post', `/bai/${id}/go`); // gỡ bài vi
    expect(existsSync(join(xuat(), 'bai-viet/en/en-bai-a.md'))).toBe(false);
    expect(doc(xuat(), 'ngon-ngu.json')).toContain('"en"'); // ngôn ngữ vẫn bật, chỉ không có bài
  });

  it('tắt ngôn ngữ en → không còn file en nào (dù đã đăng); bật lại thì có lại', async () => {
    const id = await taoBai('bai-a');
    await luuEn(id, await dichEn(id));
    await m.chinh.gui('post', `/bai/${id}/ban-dich/en/dang`);
    await m.chinh.gui('put', '/ngon-ngu/en', { bat: false });
    const d = xuat();
    expect(existsSync(join(d, 'bai-viet/en'))).toBe(false);
    expect(doc(d, 'bai-viet/bai-a.md')).not.toContain('banDich');
    await m.chinh.gui('put', '/ngon-ngu/en', { bat: true });
    expect(existsSync(join(xuat(), 'bai-viet/en/en-bai-a.md'))).toBe(true);
  });

  it('xuất kèm dich-cau-truc.json + giao-dien/<ma>.json cho ngôn ngữ đang bật (không có thì rỗng)', async () => {
    m.db.prepare("INSERT INTO dich_cau_truc (loai, khoa, ngon_ngu, du_lieu, sua_luc) VALUES ('chuyen-muc', 'an-uong', 'en', '{\"ten\":\"Food\"}', 0), ('giao-dien', 'giao-dien', 'en', '{\"tra-nhanh\":\"Quick facts\"}', 0), ('chuyen-muc', 'an-uong', 'xx', '{}', 0)").run();
    const d = xuat();
    expect(JSON.parse(doc(d, 'dich-cau-truc.json'))).toEqual([{ loai: 'chuyen-muc', khoa: 'an-uong', ngonNgu: 'en', duLieu: { ten: 'Food' } }]);
    expect(JSON.parse(doc(d, 'giao-dien/en.json'))).toEqual({ 'tra-nhanh': 'Quick facts' });
    void tachTruongChu;
  });
});
