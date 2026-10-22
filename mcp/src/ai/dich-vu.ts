// Dịch bằng AI (Claude): CHỈ trả bản dịch để điền vào form — không lưu, không đăng. Khoá API nằm trong bảng `bi_mat` (khoá `ai.apiKey`), không bao giờ vào kết quả/log.
// Gọi `client.beta.messages.parse` với `output_config.format = zodOutputFormat(...)` (kết quả đã được SDK kiểm theo schema) và
// `fallbacks: 'default'` (bản dịch bị bộ lọc an toàn từ chối thì máy chủ tự thử model dự phòng; thêm beta server-side-fallback-2026-07-01).
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { caiDatAiSchema, MODEL_AI_MAC_DINH, taoSlug, type BanDichChu } from '@vntraveltips/schema';
import { z } from 'zod';
import { docBiMat } from '../bi-mat';
import type { Db } from '../db/ket-noi';
import { kiemTraBanDich } from './kiem-tra-ban-dich';

export type MaLoiAi = 'chua-cau-hinh' | 'sai-key' | 'het-han-muc' | 'ket-noi' | 'tu-choi' | 'khac';
const THONG_BAO: Record<MaLoiAi, string> = {
  'chua-cau-hinh': 'Chưa có API key AI trong Cài đặt',
  'sai-key': 'API key AI không đúng hoặc đã bị thu hồi — kiểm tra lại trong Cài đặt',
  'het-han-muc': 'Hết hạn mức AI, thử lại sau',
  'ket-noi': 'Không kết nối được tới dịch vụ AI, hãy thử lại',
  'tu-choi': 'AI từ chối dịch nội dung này — hãy dịch tay hoặc sửa nội dung rồi thử lại',
  khac: 'Dịch vụ AI gặp lỗi, hãy thử lại sau',
};

export class LoiAi extends Error {
  constructor(
    public maLoi: MaLoiAi,
    thongBao: string = THONG_BAO[maLoi],
  ) {
    super(thongBao);
  }
}

/** Phần của SDK mà dịch vụ dùng — test truyền bản giả cùng hình dạng. */
export interface ClientAi {
  beta: { messages: { parse(params: any): Promise<{ parsed_output: unknown; stop_reason: string | null; usage?: { input_tokens?: number; output_tokens?: number } }> } };
}

export interface KetQuaDich { ketQua: BanDichChu; canhBao: string[]; soToken: { vao: number; ra: number } }
export interface DichVuAi {
  dichBai(goc: BanDichChu, den: { ma: string; ten: string }): Promise<KetQuaDich>;
  dichChuoi(nguon: Record<string, string>, den: { ma: string; ten: string }): Promise<{ ketQua: Record<string, string>; soToken: { vao: number; ra: number } }>;
}

// Schema gửi cho AI: bỏ slug (slug do taoSlug sinh) và bỏ giới hạn độ dài (chỉ cảnh báo sau, không làm cả lần gọi thất bại).
const baiSchema = z.object({
  tieuDe: z.string(),
  moTa: z.string(),
  noiDung: z.string(),
  anhBiaAlt: z.string(),
  traNhanh: z.object({ hopVoi: z.string(), thoiGian: z.string(), choO: z.string().optional(), diChuyen: z.string(), thoiDiemNenDi: z.string(), luuYVoiBe: z.array(z.string()) }).optional(),
  diaDiem: z.array(
    z.object({ ten: z.string(), diaChi: z.string().optional(), khoangGia: z.string().optional(), gioMoCua: z.string().optional(), thanThienVoiBe: z.string().optional(), uuDiem: z.array(z.string()), nhuocDiem: z.array(z.string()), anhAlt: z.array(z.string()) }),
  ),
  doMangChoBe: z.array(z.object({ ten: z.string(), ghiChu: z.string().optional() })),
  faq: z.array(z.object({ hoi: z.string(), dap: z.string() })),
});
const chuoiSchema = z.object({ muc: z.array(z.object({ khoa: z.string(), giaTri: z.string() })) });

// Cố định (tiếng Anh, không chứa dữ liệu thay đổi) để prompt caching có tác dụng.
const HE_THONG = `You are a professional translator for a Vietnamese family-travel blog. Translate the user's JSON from Vietnamese into the target language given in the request.
Rules:
- Keep proper nouns (restaurants, hotels, places, brand names) as they are; keep Vietnamese place names unless a well-known exonym exists.
- Keep Markdown structure exactly: headings, lists, emphasis, tables.
- Image syntax ![alt](anh:CODE): translate only the alt text; never change, drop or add the anh:CODE part, and never change any URL in a link.
- Do not add, remove, merge or reorder ideas, list items or array elements: every array must keep exactly the same number of items in the same order.
- Keep numbers, currency amounts, opening hours and placeholders such as {n} or {ten} unchanged (translate the surrounding words only).
- For the field moTa (meta description) aim for 120-160 characters.
- Return only the translation in the requested JSON structure.`;

const MAX_TOKENS = 16000;

export function taoDichVuAi(db: Db, opt: { khoaBiMat: string; taoClient?: (apiKey: string) => ClientAi }): DichVuAi {
  const taoClient = opt.taoClient ?? ((apiKey: string): ClientAi => new Anthropic({ apiKey, maxRetries: 1, timeout: 120_000 }) as unknown as ClientAi);

  const caiDat = () => {
    const r = db.prepare("SELECT gia_tri FROM cai_dat WHERE khoa = 'ai'").get() as { gia_tri: string } | undefined;
    const kq = caiDatAiSchema.safeParse(r ? JSON.parse(r.gia_tri) : {});
    return kq.success ? kq.data : { nhaCungCap: 'anthropic' as const, model: MODEL_AI_MAC_DINH };
  };

  async function goi<T>(schema: z.ZodType<T>, den: { ma: string; ten: string }, noiDung: unknown): Promise<{ du: T; soToken: { vao: number; ra: number } }> {
    const apiKey = docBiMat(db, opt.khoaBiMat, 'ai.apiKey');
    if (!apiKey) throw new LoiAi('chua-cau-hinh');
    let r;
    try {
      r = await taoClient(apiKey).beta.messages.parse({
        model: caiDat().model,
        max_tokens: MAX_TOKENS,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: HE_THONG,
        output_config: { format: zodOutputFormat(schema), effort: 'medium' },
        messages: [{ role: 'user', content: `Target language: ${den.ten} (${den.ma}).\n\n${JSON.stringify(noiDung)}` }],
      });
    } catch (e) {
      throw anhXaLoi(e);
    }
    if (r.stop_reason === 'refusal') throw new LoiAi('tu-choi');
    if (r.stop_reason === 'max_tokens' || r.parsed_output == null) throw new LoiAi('khac', 'AI trả về bản dịch không đọc được (có thể bài quá dài), hãy dịch từng phần hoặc thử lại');
    return { du: r.parsed_output as T, soToken: { vao: r.usage?.input_tokens ?? 0, ra: r.usage?.output_tokens ?? 0 } };
  }

  return {
    async dichBai(goc, den) {
      const { slug: _s, ...nguon } = goc;
      const { du, soToken } = await goi(baiSchema, den, nguon);
      const ketQua = { ...du, slug: taoSlug(du.tieuDe) } as BanDichChu; // slug do taoSlug quyết định (tầng API còn slugKhongTrung), AI không đụng tới
      return { ketQua, canhBao: kiemTraBanDich(goc, ketQua), soToken };
    },

    async dichChuoi(nguon, den) {
      const { du, soToken } = await goi(chuoiSchema, den, { muc: Object.entries(nguon).map(([khoa, giaTri]) => ({ khoa, giaTri })) });
      const ketQua: Record<string, string> = {};
      for (const m of du.muc) if (Object.hasOwn(nguon, m.khoa)) ketQua[m.khoa] = m.giaTri;
      return { ketQua, soToken };
    },
  };
}

/** Đổi lỗi SDK thành LoiAi với thông báo tiếng Việt cố định (không đưa nguyên văn lỗi của SDK ra ngoài). */
function anhXaLoi(e: unknown): LoiAi {
  if (e instanceof LoiAi) return e;
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return new LoiAi('sai-key');
  if (e instanceof Anthropic.RateLimitError) return new LoiAi('het-han-muc');
  if (e instanceof Anthropic.APIConnectionError) return new LoiAi('ket-noi');
  if (e instanceof Anthropic.APIError) return new LoiAi('khac', `${THONG_BAO.khac} (mã ${e.status ?? '?'})`);
  return new LoiAi('khac');
}
