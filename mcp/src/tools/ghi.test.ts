// Tool MCP ghi bài qua DB + phân quyền theo tài khoản OAuth (Review Focus: writer không đụng bài người khác).
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { readdirSync, readFileSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import sharp from 'sharp';
import { beforeEach, describe, expect, it } from 'vitest';
import type { BanDichChu } from '@vntraveltips/schema';
import { baiDayDu, dungAdmin, taoAnhGia, MK } from '../admin-api/thu-nghiem';
import { luuBiMat } from '../bi-mat';
import { taoMcpServer } from '../mcp/server';
import { timTheoId, type NguoiDung } from '../tai-khoan/nguoi-dung';
import type { ToolCtx } from './ctx';

type Moi = Awaited<ReturnType<typeof dungAdmin>>;
let m: Moi;
let lanCuoi: { ok: boolean } | null;
let dichAi: { dichBai: (g: BanDichChu, den: { ma: string; ten: string }) => Promise<unknown>; dichChuoi: () => Promise<unknown> };

beforeEach(async () => {
  lanCuoi = null;
  dichAi = {
    dichBai: async (g) => ({ ketQua: { ...g, tieuDe: 'Dịch thử', slug: 'dich-thu', moTa: 'b'.repeat(130) }, canhBao: ['Mất ảnh'], soToken: { vao: 1, ra: 2 } }),
    dichChuoi: async () => ({}),
  };
  m = await dungAdmin({ deps: { conDungLuong: async () => true } });
  taoAnhGia(m.anhDir, 'anh1');
});

const nguoi = (id: number): NguoiDung => timTheoId(m.db, id)!;
const ctxCua = (id: number, them: Partial<ToolCtx> = {}): ToolCtx => ({
  config: m.config, db: m.db, nguoiDung: nguoi(id), now: () => m.dongHo.v,
  hangDoi: { yeuCau: () => void m.yeuCau.so++, trangThai: () => ({ trangThai: 'roi', dangCho: false, lanCuoi: lanCuoi as never }), doiXong: async () => {} },
  ...them,
});
async function ketNoi(id: number, them: Partial<ToolCtx> = {}) {
  const server = taoMcpServer(ctxCua(id, them));
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '1' });
  await Promise.all([server.connect(a), client.connect(b)]);
  return client;
}
const goi = async (c: Client, name: string, args: Record<string, unknown>) => (await c.callTool({ name, arguments: args })) as { isError?: boolean; content: { type: string; text: string }[] };
const van = (r: { content: { text: string }[] }) => r.content[0]!.text;
const taoNguoi = (email: string, vaiTro: 'quan-ly' | 'writer') => m.dangNhap(email, email, vaiTro).then((p) => p.nguoi.id);
const buildPreview = (noiDungPhien: number) => {
  mkdirSync(m.config.previewDir, { recursive: true });
  writeFileSync(join(m.config.previewDir, 'build.json'), JSON.stringify({ noiDungPhien }));
};
const baiMoi = (slug: string, over: Record<string, unknown> = {}) => ({ ...baiDayDu(slug), ...over });

describe('tao_ban_nhap', () => {
  it('tạo bài nháp có tac_gia_id = người dùng của token, xuất hiện trong /api/admin/bai, có id + link xem trước + nhật ký', async () => {
    const wId = await taoNguoi('w@x.vn', 'writer');
    const c = await ketNoi(wId);
    const r = await goi(c, 'tao_ban_nhap', { bai: baiMoi('bai-claude'), noiDung: 'Xin chào ![biển](anh:anh1)' });
    expect(r.isError).toBeFalsy();
    const kq = JSON.parse(van(r)) as { id: number; slug: string; linkXemTruoc: string };
    expect(kq.linkXemTruoc).toBe('http://nhap.localhost:8090/kinh-nghiem/bai-claude/');
    expect(m.db.prepare('SELECT tac_gia_id FROM bai WHERE id = ?').get(kq.id)).toEqual({ tac_gia_id: wId });
    const ds = (await m.chinh.gui('get', '/bai')).body.bai as { id: number; slug: string; trangThai: string }[];
    expect(ds.find((x) => x.id === kq.id)).toMatchObject({ slug: 'bai-claude', trangThai: 'nhap' });
    expect(m.yeuCau.so).toBeGreaterThan(0);
    expect(m.db.prepare("SELECT chi_tiet FROM nhat_ky WHERE loai = 'tao-bai'").get()).toEqual({ chi_tiet: JSON.stringify({ qua: 'mcp', baiId: kq.id }) });
  });

  it('luôn là nháp dù đầu vào ghi draft:false; chưa đạt kiểm tra hoặc trùng slug → isError, chưa lưu gì', async () => {
    const c = await ketNoi(m.chinh.nguoi.id);
    const r = await goi(c, 'tao_ban_nhap', { bai: baiMoi('a', { draft: false }), noiDung: 'x' });
    const id = JSON.parse(van(r)).id as number;
    expect((await m.chinh.gui('get', `/bai/${id}`)).body.trangThai).toBe('nhap');
    const trung = await goi(c, 'tao_ban_nhap', { bai: baiMoi('a'), noiDung: 'x' });
    expect(trung.isError).toBe(true);
    expect(van(trung)).toMatch(/trùng/);
    const hong = await goi(c, 'tao_ban_nhap', { bai: { tieuDe: 'Thiếu' }, noiDung: 'x' });
    expect(hong.isError).toBe(true);
    expect(van(hong)).toMatch(/chưa đạt kiểm tra/);
    expect((m.db.prepare('SELECT count(*) AS n FROM bai').get() as { n: number }).n).toBe(1);
  });
});

describe('phân quyền (Review Focus)', () => {
  it('token writer: sua_bai / dang_bai / go_bai / dich_ai bài của NGƯỜI KHÁC → isError "không có quyền", bài không đổi', async () => {
    const qt = await ketNoi(m.chinh.nguoi.id);
    const id = JSON.parse(van(await goi(qt, 'tao_ban_nhap', { bai: baiMoi('cua-quan-tri'), noiDung: 'x' }))).id as number;
    const wId = await taoNguoi('w@x.vn', 'writer');
    luuBiMat(m.db, m.config.khoaBiMat, 'ai.apiKey', 'khoa-gia-lap-12345678');
    const w = await ketNoi(wId, { dichVuAi: dichAi as never });
    for (const [name, args] of [['sua_bai', { id, bai: { tieuDe: 'Sửa trộm' } }], ['dang_bai', { id }], ['go_bai', { id }], ['dich_ai_ban_dich', { id, ngonNgu: 'en' }]] as const) {
      const r = await goi(w, name, args);
      expect(r.isError, name).toBe(true);
      expect(van(r), name).toMatch(/không có quyền/);
    }
    expect((await m.chinh.gui('get', `/bai/${id}`)).body.bai.tieuDe).toBe('Bài cua-quan-tri');
    // nhưng sửa/đăng bài của CHÍNH MÌNH thì được
    const cua = JSON.parse(van(await goi(w, 'tao_ban_nhap', { bai: baiMoi('cua-writer'), noiDung: 'x' }))).id as number;
    expect((await goi(w, 'sua_bai', { id: cua, bai: { tieuDe: 'Tự sửa' } })).isError).toBeFalsy();
    expect((await m.chinh.gui('get', `/bai/${cua}`)).body.bai.tieuDe).toBe('Tự sửa');
  });

  it('quản lý làm được với mọi bài; đọc (liet_ke_bai/doc_bai) mọi vai trò', async () => {
    const qt = await ketNoi(m.chinh.nguoi.id);
    const id = JSON.parse(van(await goi(qt, 'tao_ban_nhap', { bai: baiMoi('b1'), noiDung: 'x' }))).id as number;
    const qlId = await taoNguoi('ql@x.vn', 'quan-ly');
    const ql = await ketNoi(qlId);
    expect((await goi(ql, 'sua_bai', { slug: 'b1', bai: { tieuDe: 'QL sửa' } })).isError).toBeFalsy();
    const wId = await taoNguoi('w@x.vn', 'writer');
    const w = await ketNoi(wId);
    expect(JSON.parse(van(await goi(w, 'liet_ke_bai', {}))).bai).toHaveLength(1);
    expect(JSON.parse(van(await goi(w, 'doc_bai', { id }))).bai.tieuDe).toBe('QL sửa');
  });
});

describe('sua_bai', () => {
  it('sửa qua id hoặc slug; không đổi slug/draft; bài đã đăng tự ghi ngày cập nhật; đổi tỉnh bài đã đăng → có redirect', async () => {
    await m.chinh.gui('post', '/tinh', { ten: 'Vũng Tàu', slug: 'vung-tau', gioiThieu: 'g', anhBia: { ma: 'anh1', alt: 'Biển' }, moTa: 'm' });
    await m.chinh.gui('post', '/tinh', { ten: 'Đà Lạt', slug: 'da-lat', gioiThieu: 'g', anhBia: { ma: 'anh1', alt: 'Biển' }, moTa: 'm' });
    const c = await ketNoi(m.chinh.nguoi.id);
    const id = JSON.parse(van(await goi(c, 'tao_ban_nhap', { bai: baiMoi('x', { tinh: 'vung-tau' }), noiDung: 'x' }))).id as number;
    expect((await goi(c, 'sua_bai', { slug: 'x', bai: { slug: 'khac' } })).isError).toBe(true);
    expect((await goi(c, 'sua_bai', { id, bai: { draft: false } })).isError).toBe(true);
    await m.chinh.gui('post', `/bai/${id}/dang`);
    const r = await goi(c, 'sua_bai', { id, bai: { tinh: 'da-lat' } });
    expect(r.isError).toBeFalsy();
    expect(JSON.parse(van(r)).ghiChu.join(' ')).toMatch(/redirect 301/);
    expect(m.db.prepare("SELECT den FROM redirect WHERE tu = '/vung-tau/x/'").get()).toEqual({ den: '/da-lat/x/' });
    expect((await m.chinh.gui('get', `/bai/${id}`)).body.bai.ngayCapNhat).toBeTruthy();
    expect((await goi(c, 'sua_bai', { id: 9999 })).isError).toBe(true);
  });

  it('nội dung sửa không đạt kiểm tra → isError, bài không đổi', async () => {
    const c = await ketNoi(m.chinh.nguoi.id);
    const id = JSON.parse(van(await goi(c, 'tao_ban_nhap', { bai: baiMoi('x'), noiDung: 'x' }))).id as number;
    const r = await goi(c, 'sua_bai', { id, noiDung: '![ảnh](https://x.vn/a.jpg)' });
    expect(r.isError).toBe(true);
    expect((await m.chinh.gui('get', `/bai/${id}`)).body.noiDung).toBe('x');
  });
});

describe('dang_bai / xem_trang_thai (cổng bản xem trước)', () => {
  async function bai() {
    const c = await ketNoi(m.chinh.nguoi.id);
    const id = JSON.parse(van(await goi(c, 'tao_ban_nhap', { bai: baiMoi('x'), noiDung: 'x' }))).id as number;
    return { c, id };
  }
  const phienLuu = (id: number) => (m.db.prepare("SELECT noi_dung_phien_luu AS p FROM ban_dich WHERE bai_id = ? AND ngon_ngu = 'vi'").get(id) as { p: number }).p;

  it('preview chưa build tới phiên nội dung lúc bài được lưu → isError nhắc xem_trang_thai; build xong → đăng được, bài lên da-dang', async () => {
    const { c, id } = await bai();
    const tt0 = JSON.parse(van(await goi(c, 'xem_trang_thai', { id })));
    expect(tt0.bai).toMatchObject({ id, trangThai: 'nhap', previewDaCoBanNay: false });
    const tu = await goi(c, 'dang_bai', { id });
    expect(tu.isError).toBe(true);
    expect(van(tu)).toMatch(/xem_trang_thai/);
    buildPreview(phienLuu(id) - 1);
    expect((await goi(c, 'dang_bai', { id })).isError).toBe(true);
    buildPreview(phienLuu(id));
    expect(JSON.parse(van(await goi(c, 'xem_trang_thai', { id }))).bai.previewDaCoBanNay).toBe(true);
    const r = await goi(c, 'dang_bai', { slug: 'x' });
    expect(r.isError).toBeFalsy();
    expect(JSON.parse(van(r)).linkBai).toBe('http://localhost:8090/kinh-nghiem/x/');
    expect((await m.chinh.gui('get', `/bai/${id}`)).body.trangThai).toBe('da-dang');
    expect((await goi(c, 'dang_bai', { id })).isError).toBe(true); // đã đăng rồi
  });

  it('sửa bài SAU khi preview build → phải build lại mới đăng được (cổng so phiên lưu cuối, không phải phiên cũ)', async () => {
    const { c, id } = await bai();
    buildPreview(phienLuu(id));
    await goi(c, 'sua_bai', { id, noiDung: 'sửa thêm' });
    expect((await goi(c, 'dang_bai', { id })).isError).toBe(true);
    buildPreview(phienLuu(id));
    expect((await goi(c, 'dang_bai', { id })).isError).toBeFalsy();
  });

  it('build lần cuối bị lỗi và preview chưa mới → thông báo nói rõ lỗi build', async () => {
    const { c, id } = await bai();
    lanCuoi = { ok: false };
    const r = await goi(await ketNoi(m.chinh.nguoi.id), 'dang_bai', { id });
    expect(van(r)).toMatch(/build gần nhất bị lỗi/);
    void c;
  });

  it('bài chưa đạt kiểm tra đầy đủ (ảnh bìa mất) → không đăng; bài trong thùng rác → không thấy', async () => {
    const { c, id } = await bai();
    buildPreview(phienLuu(id));
    m.db.prepare("UPDATE ban_dich SET du_lieu = json_set(du_lieu, '$.anhBia.ma', 'khong-co-that') WHERE bai_id = ?").run(id);
    const r = await goi(c, 'dang_bai', { id });
    expect(r.isError).toBe(true);
    expect(van(r)).toMatch(/chưa đạt kiểm tra/);
    m.db.prepare('UPDATE bai SET xoa_luc = 1 WHERE id = ?').run(id);
    expect(van(await goi(c, 'doc_bai', { id }))).toMatch(/Không có bài/);
  });
});

describe('go_bai', () => {
  it('gỡ bài đã đăng về nháp (kèm cảnh báo bản xem trước/ảnh còn nội dung); bài đã là nháp → báo; writer bài người khác → từ chối', async () => {
    const c = await ketNoi(m.chinh.nguoi.id);
    const id = JSON.parse(van(await goi(c, 'tao_ban_nhap', { bai: baiMoi('x'), noiDung: 'x' }))).id as number;
    expect(JSON.parse(van(await goi(c, 'go_bai', { id }))).ghiChu).toMatch(/đã là nháp/);
    await m.chinh.gui('post', `/bai/${id}/dang`);
    const r = await goi(c, 'go_bai', { slug: 'x' });
    expect(r.isError).toBeFalsy();
    expect(van(r)).toMatch(/xem trước/);
    expect((await m.chinh.gui('get', `/bai/${id}`)).body.trangThai).toBe('nhap');
  });
});

describe('ảnh', () => {
  it('ảnh tải qua link một lần xuất hiện trong thư viện ảnh admin với đúng người tải', async () => {
    const wId = await taoNguoi('w@x.vn', 'writer');
    const c = await ketNoi(wId, { conDungLuong: async () => true });
    const link = JSON.parse(van(await goi(c, 'tao_link_tai_anh', {}))).url as string;
    const token = link.split('/tai-anh/')[1]!;
    const jpeg = await sharp({ create: { width: 64, height: 48, channels: 3, background: { r: 200, g: 90, b: 40 } } }).jpeg().toBuffer();
    const up = await request(m.app).post(`/tai-anh/${token}`).attach('anh', jpeg, 'anh-thu.jpg');
    expect(up.status).toBe(200);
    const ma = up.body.ketQua[0].ma as string;
    const thuVien = (await m.chinh.gui('get', '/anh')).body.anh as { ma: string }[];
    expect(thuVien.map((x) => x.ma)).toContain(ma);
    expect(m.db.prepare('SELECT nguoi_dung_id FROM anh WHERE ma = ?').get(ma)).toEqual({ nguoi_dung_id: wId });
    expect(JSON.parse(van(await goi(c, 'liet_ke_anh', { gioiHan: 5 }))).map?.((x: { ma: string }) => x.ma) ?? []).toContain(ma);
  });
});

describe('dich_ai_ban_dich', () => {
  it('trả bản dịch + cảnh báo nhưng KHÔNG lưu gì (không bản dịch mới, không phiên bản mới)', async () => {
    luuBiMat(m.db, m.config.khoaBiMat, 'ai.apiKey', 'khoa-gia-lap-12345678');
    await m.chinh.gui('post', '/ngon-ngu', { ma: 'en', ten: 'English' });
    const c = await ketNoi(m.chinh.nguoi.id, { dichVuAi: dichAi as never });
    const id = JSON.parse(van(await goi(c, 'tao_ban_nhap', { bai: baiMoi('x'), noiDung: 'x' }))).id as number;
    const truoc = m.db.prepare('SELECT (SELECT count(*) FROM ban_dich) AS bd, (SELECT count(*) FROM phien_ban) AS pb').get();
    const r = await goi(c, 'dich_ai_ban_dich', { id, ngonNgu: 'en' });
    expect(r.isError).toBeFalsy();
    const kq = JSON.parse(van(r));
    expect(kq.ketQua).toMatchObject({ tieuDe: 'Dịch thử' });
    expect(kq.canhBao).toEqual(['Mất ảnh']);
    expect(kq.ghiChu).toMatch(/CHƯA LƯU/);
    expect(m.db.prepare('SELECT (SELECT count(*) FROM ban_dich) AS bd, (SELECT count(*) FROM phien_ban) AS pb').get()).toEqual(truoc);
    expect((await goi(c, 'dich_ai_ban_dich', { id, ngonNgu: 'fr' })).isError).toBe(true);
  });
});

describe('gỡ hẳn code ghi GitHub', () => {
  it('không file nào dưới mcp/src còn import github/client, fake-github hay @octokit (kể cả test)', () => {
    const duyet = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? duyet(join(d, f)) : [join(d, f)]));
    const goc = join(import.meta.dirname, '..');
    const vi = duyet(goc)
      .filter((f) => f.endsWith('.ts') && !f.endsWith('ghi.test.ts'))
      .filter((f) => /github\/client|fake-github|@octokit|GithubClient/.test(readFileSync(f, 'utf8')));
    expect(vi).toEqual([]);
    expect(JSON.parse(readFileSync(join(goc, '..', 'package.json'), 'utf8')).dependencies['@octokit/rest']).toBeUndefined();
  });
});
void MK;
