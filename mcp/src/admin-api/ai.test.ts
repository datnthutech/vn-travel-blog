// Dịch bằng AI qua API: chỉ điền (không lưu), lỗi → 503 tiếng Việt đúng maLoi, key không lộ ra response/log/nhật ký, client giả đúng hình dạng SDK.
import Anthropic from '@anthropic-ai/sdk';
import type { BanDichChu } from '@vntraveltips/schema';
import { beforeEach, describe, expect, it } from 'vitest';
import { taoDichVuAi, type ClientAi } from '../ai/dich-vu';
import { baiDayDu, dungAdmin, taoAnhGia } from './thu-nghiem';

type Moi = Awaited<ReturnType<typeof dungAdmin>>;
let m: Moi;
let goi: any[];
let traVe: (params: any) => unknown | Promise<unknown>;
const KEY = 'sk-ant-api03-KHOA-BI-MAT-KHONG-DUOC-LO-ra-ngoai';
const HDR = new Headers();

/** Bản dịch "tốt" dựng từ phần chữ của bản gốc (đổi tiêu đề). */
const dichTot = (goc: Record<string, unknown>) => {
  const { slug: _s, ...con } = goc as BanDichChu;
  return { ...con, tieuDe: 'Translated title', moTa: 'b'.repeat(130) };
};

beforeEach(async () => {
  goi = [];
  traVe = (p) => ({ parsed_output: dichTot(JSON.parse(String(p.messages[0].content.split('\n\n').slice(1).join('\n\n')))), stop_reason: 'end_turn', usage: { input_tokens: 120, output_tokens: 80 } });
  const client: ClientAi = { beta: { messages: { parse: async (p: any) => (goi.push(p), (await traVe(p)) as never) } } };
  m = await dungAdmin({ taoDeps: (db) => ({ dichVuAi: taoDichVuAi(db, { khoaBiMat: 'a'.repeat(64), taoClient: (k) => ((client as any).dungKey = k, client) }) }) });
  taoAnhGia(m.anhDir, 'anh1');
  await m.chinh.gui('post', '/ngon-ngu', { ma: 'en', ten: 'English' });
});
const datKey = () => m.chinh.gui('put', '/cai-dat/ai', { apiKey: KEY });
const taoBai = async (slug = 'bai-a') => {
  const id = (await m.chinh.gui('post', '/bai', { bai: baiDayDu(slug), noiDung: 'Xin chào ![biển](anh:anh1) [liên kết](https://x.vn)' })).body.id as number;
  await m.chinh.gui('post', `/bai/${id}/dang`);
  return id;
};
const dich = (id: number, body: object = {}) => m.chinh.gui('post', `/bai/${id}/ban-dich/en/dich-ai`, body);

describe('cài đặt AI', () => {
  it('mặc định model claude-opus-5-5, chưa có key; lưu key → chỉ trả daDatKey, key KHÔNG xuất hiện ở bất kỳ response/nhật ký/DB nào ở dạng rõ', async () => {
    expect((await m.chinh.gui('get', '/cai-dat/ai')).body).toEqual({ nhaCungCap: 'anthropic', model: 'claude-opus-5-5', daDatKey: false });
    const r = await datKey();
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ nhaCungCap: 'anthropic', model: 'claude-opus-5-5', daDatKey: true });
    expect(JSON.stringify((await m.chinh.gui('get', '/cai-dat/ai')).body)).not.toContain(KEY);
    expect(JSON.stringify(m.db.prepare('SELECT * FROM nhat_ky').all())).not.toContain(KEY);
    expect(JSON.stringify(m.db.prepare('SELECT * FROM bi_mat').all())).not.toContain(KEY); // mã hoá AES
    expect(JSON.stringify(m.db.prepare('SELECT * FROM cai_dat').all())).not.toContain(KEY);
  });

  it('đổi model; model sai → 400; key sai dạng → 400; xoaKey → daDatKey=false; quản lý/người viết → 403', async () => {
    await datKey();
    expect((await m.chinh.gui('put', '/cai-dat/ai', { model: 'claude-sonnet-5-5' })).body).toMatchObject({ model: 'claude-sonnet-5-5', daDatKey: true });
    expect((await m.chinh.gui('put', '/cai-dat/ai', { model: 'gpt-5; drop' })).status).toBe(400);
    expect((await m.chinh.gui('put', '/cai-dat/ai', { apiKey: 'ngan' })).status).toBe(400);
    expect((await m.chinh.gui('put', '/cai-dat/ai', { apiKey: 'co khoang trang trong key ne' })).status).toBe(400);
    expect((await m.chinh.gui('put', '/cai-dat/ai', { xoaKey: true })).body.daDatKey).toBe(false);
    for (const vt of ['quan-ly', 'writer'] as const) {
      const p = await m.dangNhap(`${vt}@x.vn`, vt, vt);
      expect((await p.gui('put', '/cai-dat/ai', { apiKey: KEY })).status).toBe(403);
      expect((await p.gui('get', '/cai-dat/ai')).status).toBe(403);
    }
  });
});

describe('dịch bài bằng AI', () => {
  it('kết quả hợp lệ → ketQua + canhBao rỗng, slug do taoSlug(tiêu đề) sinh; dùng model từ cài đặt, effort medium, fallbacks default; KHÔNG lưu gì (noi_dung_phien, phien_ban, ban_dich không đổi)', async () => {
    await datKey();
    const id = await taoBai();
    const truoc = {
      phien: m.db.prepare("SELECT gia_tri FROM he_thong WHERE khoa = 'noi_dung_phien'").get(),
      pb: m.db.prepare('SELECT count(*) AS n FROM phien_ban').get(),
      bd: m.db.prepare('SELECT count(*) AS n FROM ban_dich').get(),
    };
    const r = await dich(id);
    expect(r.status).toBe(200);
    expect(r.body.canhBao).toEqual([]);
    expect(r.body.ketQua).toMatchObject({ tieuDe: 'Translated title', slug: 'translated-title' });
    expect(goi).toHaveLength(1);
    expect(goi[0]).toMatchObject({ model: 'claude-opus-5-5', fallbacks: 'default', betas: ['server-side-fallback-2026-07-01'] });
    expect(goi[0].output_config).toMatchObject({ effort: 'medium' });
    expect(goi[0].output_config.format).toBeTruthy();
    expect(goi[0].messages[0].content).toContain('Target language: English (en)');
    expect(goi[0].max_tokens).toBe(16000);
    expect(JSON.stringify(goi[0])).not.toContain(KEY); // key chỉ đi qua tham số khởi tạo client
    expect({
      phien: m.db.prepare("SELECT gia_tri FROM he_thong WHERE khoa = 'noi_dung_phien'").get(),
      pb: m.db.prepare('SELECT count(*) AS n FROM phien_ban').get(),
      bd: m.db.prepare('SELECT count(*) AS n FROM ban_dich').get(),
    }).toEqual(truoc);
    expect((await m.chinh.gui('get', `/bai/${id}/ban-dich/en`)).body.trangThai).toBe('chua-dich');
  });

  it('slug AI sinh trùng bản dịch khác cùng ngôn ngữ → thêm -2 (slugKhongTrung)', async () => {
    await datKey();
    const a = await taoBai('bai-a');
    const b = await taoBai('bai-b');
    const goc = (await m.chinh.gui('get', `/bai/${a}/ban-dich/en`)).body.banGoc as BanDichChu;
    await m.chinh.gui('put', `/bai/${a}/ban-dich/en`, { dich: { ...goc, slug: 'translated-title' } });
    expect((await dich(b)).body.ketQua.slug).toBe('translated-title-2');
  });

  it('bản dịch làm MẤT ảnh anh:MÃ → canhBao nêu mã ảnh (Review Focus), vẫn trả ketQua để người dùng xem', async () => {
    await datKey();
    const id = await taoBai();
    traVe = (p) => ({ parsed_output: { ...dichTot(JSON.parse(String(p.messages[0].content.split('\n\n').slice(1).join('\n\n')))), noiDung: 'Hello a picture [link](https://x.vn)' }, stop_reason: 'end_turn' });
    const r = await dich(id);
    expect(r.status).toBe(200);
    expect(r.body.canhBao.join(' ')).toMatch(/MẤT ảnh.*anh1/);
    expect(r.body.ketQua.noiDung).toBe('Hello a picture [link](https://x.vn)');
  });

  it('chiTruong: dịch MỘT ô (tieuDe) → chỉ trả ô đó; ô không hợp lệ → 400', async () => {
    await datKey();
    const id = await taoBai();
    traVe = () => ({ parsed_output: { muc: [{ khoa: 'tieuDe', giaTri: 'Only title' }, { khoa: 'khac', giaTri: 'bỏ' }] }, stop_reason: 'end_turn' });
    expect((await dich(id, { chiTruong: 'tieuDe' })).body).toEqual({ ketQua: { tieuDe: 'Only title' }, canhBao: [] });
    expect((await dich(id, { chiTruong: 'slug' })).status).toBe(400);
    expect((await dich(id, { chiTruong: 'diaDiem' })).status).toBe(400);
  });

  it('chưa có API key → 503 chua-cau-hinh và KHÔNG gọi client', async () => {
    const id = await taoBai();
    const r = await dich(id);
    expect(r.status).toBe(503);
    expect(r.body).toEqual({ loi: 'Chưa có API key AI trong Cài đặt', maLoi: 'chua-cau-hinh' });
    expect(goi).toHaveLength(0);
  });

  it.each([
    ['sai-key', () => Anthropic.APIError.generate(401, { type: 'error', error: { type: 'authentication_error', message: `invalid x-api-key ${KEY}` } }, 'auth', HDR), /API key AI không đúng/],
    ['het-han-muc', () => Anthropic.APIError.generate(429, { type: 'error', error: { type: 'rate_limit_error', message: 'slow down' } }, 'rl', HDR), /Hết hạn mức AI, thử lại sau/],
    ['ket-noi', () => new Anthropic.APIConnectionError({ message: 'ECONNRESET' }), /Không kết nối được/],
    ['khac', () => Anthropic.APIError.generate(500, { type: 'error', error: { type: 'api_error', message: 'boom' } }, 'boom', HDR), /gặp lỗi.*mã 500/],
  ])('lỗi SDK %s → 503 đúng maLoi, thông báo tiếng Việt, không lộ nguyên văn lỗi/key', async (maLoi, tao, mau) => {
    await datKey();
    const id = await taoBai();
    traVe = () => {
      throw tao();
    };
    const r = await dich(id);
    expect(r.status).toBe(503);
    expect(r.body.maLoi).toBe(maLoi);
    expect(r.body.loi).toMatch(mau);
    expect(JSON.stringify(r.body)).not.toMatch(/ECONNRESET|boom|slow down|sk-ant/);
    expect(JSON.stringify(m.db.prepare('SELECT * FROM nhat_ky').all())).not.toContain(KEY);
    expect(m.db.prepare("SELECT chi_tiet FROM nhat_ky WHERE loai = 'dich-ai-loi'").get()).toEqual({ chi_tiet: JSON.stringify({ ngonNgu: 'en', maLoi }) });
  });

  it('AI từ chối (stop_reason refusal) → tu-choi; bản dịch bị cắt (max_tokens) hoặc không đọc được → khac; các việc khác vẫn chạy', async () => {
    await datKey();
    const id = await taoBai();
    traVe = () => ({ parsed_output: null, stop_reason: 'refusal' });
    expect((await dich(id)).body.maLoi).toBe('tu-choi');
    traVe = () => ({ parsed_output: null, stop_reason: 'max_tokens' });
    expect((await dich(id)).body).toMatchObject({ maLoi: 'khac' });
    expect((await m.chinh.gui('get', `/bai/${id}/ban-dich/en`)).status).toBe(200); // trang quản trị không bị ảnh hưởng
  });

  it('nhật ký dich-ai ghi số token vào/ra, KHÔNG ghi nội dung bài; bài/ngôn ngữ lạ → 404; bản vi nháp thiếu trường → 409; writer dịch bài người khác → 403', async () => {
    await datKey();
    const id = await taoBai();
    await dich(id);
    const nk = m.db.prepare("SELECT chi_tiet FROM nhat_ky WHERE loai = 'dich-ai'").get() as { chi_tiet: string };
    expect(JSON.parse(nk.chi_tiet)).toEqual({ baiId: id, ngonNgu: 'en', tokenVao: 120, tokenRa: 80 });
    expect(nk.chi_tiet).not.toMatch(/Xin chào|Translated/);
    expect((await m.chinh.gui('post', '/bai/9999/ban-dich/en/dich-ai', {})).status).toBe(404);
    expect((await m.chinh.gui('post', `/bai/${id}/ban-dich/fr/dich-ai`, {})).status).toBe(404);
    const nhap = (await m.chinh.gui('post', '/bai', { bai: { tieuDe: 'Thiếu', slug: 'thieu' }, noiDung: 'x' })).body.id;
    expect((await dich(nhap)).status).toBe(409);
    const w = await m.dangNhap('w@x.vn', 'W', 'writer');
    expect((await w.gui('post', `/bai/${id}/ban-dich/en/dich-ai`, {})).status).toBe(403);
  });
});

describe('dịch chuỗi + thử kết nối', () => {
  it('dịch chuỗi: trả đúng khoá, bỏ khoá lạ do AI bịa; kiểm tra đầu vào; cần quyền cau-truc.sua', async () => {
    await datKey();
    traVe = () => ({ parsed_output: { muc: [{ khoa: 'a', giaTri: 'Food' }, { khoa: 'lạ', giaTri: 'x' }] }, stop_reason: 'end_turn', usage: { input_tokens: 5, output_tokens: 3 } });
    const r = await m.chinh.gui('post', '/dich-ai/chuoi', { nguon: { a: 'Ăn uống', b: 'Vui chơi' }, ngonNgu: 'en' });
    expect(r.body).toEqual({ ketQua: { a: 'Food' } });
    expect((await m.chinh.gui('post', '/dich-ai/chuoi', { nguon: {}, ngonNgu: 'en' })).status).toBe(400);
    expect((await m.chinh.gui('post', '/dich-ai/chuoi', { nguon: { a: 1 }, ngonNgu: 'en' })).status).toBe(400);
    expect((await m.chinh.gui('post', '/dich-ai/chuoi', { nguon: { a: 'x' }, ngonNgu: 'zz' })).status).toBe(404);
    const w = await m.dangNhap('w@x.vn', 'W', 'writer');
    expect((await w.gui('post', '/dich-ai/chuoi', { nguon: { a: 'x' }, ngonNgu: 'en' })).status).toBe(403);
  });

  it('thử kết nối: thành công → ok; lỗi key → 503 sai-key', async () => {
    await datKey();
    traVe = () => ({ parsed_output: { muc: [{ khoa: 'thu', giaTri: 'Hello' }] }, stop_reason: 'end_turn' });
    expect((await m.chinh.gui('post', '/cai-dat/ai/thu', {})).body).toEqual({ ok: true, ketQua: 'Hello' });
    traVe = () => {
      throw Anthropic.APIError.generate(401, { type: 'error', error: { type: 'authentication_error', message: 'x' } }, 'x', HDR);
    };
    expect((await m.chinh.gui('post', '/cai-dat/ai/thu', {})).body.maLoi).toBe('sai-key');
  });
});
