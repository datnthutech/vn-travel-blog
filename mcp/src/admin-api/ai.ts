// API "Dịch bằng AI" + cài đặt AI. AI chỉ TRẢ bản dịch để điền form: không route nào ở đây ghi bài/bản dịch.
// Lỗi AI → 503 { loi, maLoi } (tiếng Việt); mọi việc khác của trang quản trị chạy bình thường.
import { caiDatAiSchema, MODEL_AI_MAC_DINH } from '@vntraveltips/schema';
import { Router, type Request, type Response } from 'express';
import { coBiMat, luuBiMat, xoaBiMat } from '../bi-mat';
import type { Config } from '../config';
import type { Db } from '../db/ket-noi';
import { LoiAi, type DichVuAi } from '../ai/dich-vu';
import { slugKhongTrung } from '../noi-dung/bai';
import { truongChuBanGoc } from '../noi-dung/ban-dich';
import { lietKeNgonNgu } from '../noi-dung/ngon-ngu';
import { ghiNhatKy } from '../tai-khoan/nhat-ky';
import { yeuCauQuyen } from '../tai-khoan/quyen';
import { idTuUrl } from './bai';

const TRUONG_CHU = ['tieuDe', 'moTa', 'noiDung', 'anhBiaAlt'] as const;

export function aiRouter(d: { config: Config; db: Db; dichVu: DichVuAi; now: () => number }): Router {
  const r = Router();
  const chuBai = (req: Request) => {
    const x = d.db.prepare('SELECT tac_gia_id FROM bai WHERE id = ?').get(idTuUrl(String(req.params.id))) as { tac_gia_id: number | null } | undefined;
    return x ? { tacGiaId: x.tac_gia_id } : ('khong-ton-tai' as const);
  };
  const nhatKy = (req: Request, loai: string, chiTiet: object) => ghiNhatKy(d.db, { nguoiDungId: req.nguoiDung!.id, loai, ip: req.ip, chiTiet }, d.now);
  const traLoi = (req: Request, res: Response, e: unknown, ngonNgu: string) => {
    const l = e instanceof LoiAi ? e : new LoiAi('khac');
    nhatKy(req, 'dich-ai-loi', { ngonNgu, maLoi: l.maLoi }); // không ghi nội dung, không ghi thông báo gốc của SDK
    res.status(503).json({ loi: l.message, maLoi: l.maLoi });
  };
  const ngonNguDich = (ma: string) => lietKeNgonNgu(d.db).find((n) => n.ma === ma && n.ma !== 'vi');

  r.post('/bai/:id/ban-dich/:ngonNgu/dich-ai', yeuCauQuyen('bai.sua', chuBai), async (req, res) => {
    const baiId = idTuUrl(String(req.params.id));
    const den = ngonNguDich(String(req.params.ngonNgu));
    const goc = Number.isNaN(baiId) ? null : truongChuBanGoc(d.db, baiId);
    if (Number.isNaN(baiId) || !d.db.prepare('SELECT 1 FROM bai WHERE id = ?').get(baiId)) return void res.status(404).json({ loi: 'Không tìm thấy bài viết' });
    if (!den) return void res.status(404).json({ loi: 'Không có ngôn ngữ này' });
    if (!goc) return void res.status(409).json({ loi: 'Hoàn thiện bản tiếng Việt (đủ trường theo luật bài viết) trước khi dịch' });
    const chiTruong = (req.body as { chiTruong?: unknown } | undefined)?.chiTruong;
    try {
      if (chiTruong !== undefined) {
        // Dịch MỘT ô chữ: chỉ điền lại ô đó trên form.
        if (typeof chiTruong !== 'string' || !(TRUONG_CHU as readonly string[]).includes(chiTruong)) return void res.status(400).json({ loi: `chiTruong phải là một trong: ${TRUONG_CHU.join(', ')}` });
        const k = chiTruong as (typeof TRUONG_CHU)[number];
        const { ketQua, soToken } = await d.dichVu.dichChuoi({ [k]: goc[k] }, den);
        nhatKy(req, 'dich-ai', { baiId, ngonNgu: den.ma, truong: k, tokenVao: soToken.vao, tokenRa: soToken.ra });
        return void res.json({ ketQua: { [k]: ketQua[k] ?? '' }, canhBao: [] });
      }
      const kq = await d.dichVu.dichBai(goc, den);
      // Tiêu đề ngôn ngữ không dùng chữ Latin (ja, zh, ru…) → taoSlug trả slug mặc định vô nghĩa ('bai-viet'): dùng '<mã>-<id bài>' thay thế.
      const ketQua = { ...kq.ketQua, slug: slugKhongTrung(d.db, den.ma, /[a-z0-9]/i.test(kq.ketQua.tieuDe.normalize('NFD').replace(/[\u0300-\u036f]/g, '')) ? kq.ketQua.slug : `${den.ma}-${baiId}`, baiId) };
      nhatKy(req, 'dich-ai', { baiId, ngonNgu: den.ma, tokenVao: kq.soToken.vao, tokenRa: kq.soToken.ra });
      res.json({ ketQua, canhBao: kq.canhBao });
    } catch (e) {
      traLoi(req, res, e, den.ma);
    }
  });

  // Dịch chuỗi ngắn (tên chuyên mục, menu, chuỗi giao diện…): { nguon: {khoa: chuỗi}, ngonNgu } → { ketQua: {khoa: chuỗi} } (không lưu).
  r.post('/dich-ai/chuoi', yeuCauQuyen('cau-truc.sua'), async (req, res) => {
    const b = (req.body ?? {}) as { nguon?: unknown; ngonNgu?: unknown };
    const den = ngonNguDich(String(b.ngonNgu ?? ''));
    if (!den) return void res.status(404).json({ loi: 'Không có ngôn ngữ này' });
    const nguon = b.nguon as Record<string, unknown> | undefined;
    const muc = nguon && typeof nguon === 'object' && !Array.isArray(nguon) ? Object.entries(nguon) : [];
    if (muc.length === 0 || muc.length > 400 || muc.some(([k, v]) => typeof v !== 'string' || v.length > 5000 || k.length > 100)) {
      return void res.status(400).json({ loi: 'nguon cần là đối tượng gồm 1–400 chuỗi (mỗi chuỗi ≤ 5000 ký tự)' });
    }
    try {
      const { ketQua, soToken } = await d.dichVu.dichChuoi(Object.fromEntries(muc) as Record<string, string>, den);
      nhatKy(req, 'dich-ai', { ngonNgu: den.ma, soChuoi: muc.length, tokenVao: soToken.vao, tokenRa: soToken.ra });
      res.json({ ketQua });
    } catch (e) {
      traLoi(req, res, e, den.ma);
    }
  });

  // ---- Cài đặt AI: model + API key (key chỉ GHI, đọc ra chỉ có `daDatKey`) ----
  const docModel = () => {
    const x = d.db.prepare("SELECT gia_tri FROM cai_dat WHERE khoa = 'ai'").get() as { gia_tri: string } | undefined;
    const k = caiDatAiSchema.safeParse(x ? JSON.parse(x.gia_tri) : {});
    return k.success ? k.data : { nhaCungCap: 'anthropic' as const, model: MODEL_AI_MAC_DINH };
  };
  r.get('/cai-dat/ai', yeuCauQuyen('cai-dat.sua'), (_req, res) => void res.json({ ...docModel(), daDatKey: coBiMat(d.db, 'ai.apiKey') }));
  r.put('/cai-dat/ai', yeuCauQuyen('cai-dat.sua'), (req, res) => {
    const b = (req.body ?? {}) as { model?: unknown; apiKey?: unknown; xoaKey?: unknown };
    if (b.apiKey !== undefined && (typeof b.apiKey !== 'string' || b.apiKey.trim().length < 10 || b.apiKey.length > 300 || /\s/.test(b.apiKey.trim()))) return void res.status(400).json({ loi: 'API key không hợp lệ' });
    const moi = caiDatAiSchema.safeParse({ ...docModel(), ...(b.model === undefined ? {} : { model: b.model }) });
    if (!moi.success) return void res.status(400).json({ loi: 'Cài đặt AI không hợp lệ', chiTiet: moi.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) });
    d.db.transaction(() => {
      d.db.prepare("INSERT OR REPLACE INTO cai_dat (khoa, gia_tri) VALUES ('ai', ?)").run(JSON.stringify(moi.data));
      if (typeof b.apiKey === 'string') luuBiMat(d.db, d.config.khoaBiMat, 'ai.apiKey', b.apiKey.trim());
      else if (b.xoaKey === true) xoaBiMat(d.db, 'ai.apiKey');
    })();
    nhatKy(req, 'sua-cai-dat-ai', { model: moi.data.model, doiKey: typeof b.apiKey === 'string', xoaKey: b.xoaKey === true }); // KHÔNG ghi key
    res.json({ ...moi.data, daDatKey: coBiMat(d.db, 'ai.apiKey') });
  });
  r.post('/cai-dat/ai/thu', yeuCauQuyen('cai-dat.sua'), async (req, res) => {
    try {
      const { ketQua } = await d.dichVu.dichChuoi({ thu: 'Xin chào' }, { ma: 'en', ten: 'English' });
      res.json({ ok: true, ketQua: ketQua.thu ?? '' });
    } catch (e) {
      traLoi(req, res, e, 'thu');
    }
  });
  return r;
}
