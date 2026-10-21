// Hàng đợi build: mỗi lúc chỉ một build chạy. Yêu cầu đến khi đang build được gộp thành đúng một build bù,
// nên build cuối luôn dùng commit mới nhất. Build lỗi hoặc ném exception không làm hàng đợi kẹt.
export type KetQuaBuild = { ok: true; sha: string } | { ok: false; sha?: string; log: string };

export interface TrangThaiBuild {
  trangThai: 'roi' | 'dang-build';
  dangCho: boolean;
  lanCuoi: null | { ok: boolean; sha?: string; luc: string; log?: string };
}

export interface HangDoiBuild {
  yeuCau(): void;
  trangThai(): TrangThaiBuild;
  doiXong(): Promise<void>;
}

export function taoHangDoiBuild(chay: () => Promise<KetQuaBuild>, now: () => number = Date.now): HangDoiBuild {
  let dangChay = false;
  let dangCho = false;
  let vong: Promise<void> | null = null;
  let lanCuoi: TrangThaiBuild['lanCuoi'] = null;

  async function chayMotLan(): Promise<void> {
    dangChay = true;
    const luc = new Date(now()).toISOString();
    try {
      const kq = await chay();
      lanCuoi = kq.ok ? { ok: true, sha: kq.sha, luc } : { ok: false, sha: kq.sha, luc, log: kq.log };
    } catch (e) {
      lanCuoi = { ok: false, luc, log: e instanceof Error ? e.message : String(e) };
    } finally {
      dangChay = false;
    }
  }

  async function chayHet(): Promise<void> {
    while (dangCho) {
      dangCho = false;
      await chayMotLan();
    }
  }

  return {
    yeuCau() {
      dangCho = true;
      if (!vong) vong = chayHet().finally(() => (vong = null));
    },
    trangThai() {
      return { trangThai: dangChay ? 'dang-build' : 'roi', dangCho, lanCuoi };
    },
    async doiXong() {
      await vong;
    },
  };
}
