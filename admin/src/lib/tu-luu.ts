// Tự lưu khi gõ: gộp nhiều thay đổi, gửi bản cuối sau `treMs` (mặc định 3 giây) không gõ. Đang gửi mà có thay đổi mới thì gửi
// tiếp SAU khi lần trước xong (không gửi chồng). Mất mạng → giữ bản trong localStorage (khoá `vtt-nhap-<id>`) và báo "loi".
export type TrangThaiTuLuu = 'dang-luu' | 'da-luu' | 'loi';

interface Kho {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

export interface TuyChonTuLuu<T> {
  luu: (duLieu: T) => Promise<void>;
  treMs?: number;
  /** Khoá localStorage giữ bản chưa lưu được, vd `vtt-nhap-12`. */
  khoa?: string;
  kho?: Kho;
  khiDoiTrangThai?: (s: TrangThaiTuLuu) => void;
}

export function taoTuLuu<T>(o: TuyChonTuLuu<T>): { doi(duLieu: T): void; dungNgay(): Promise<void> } {
  const treMs = o.treMs ?? 3000;
  let moiNhat: T | undefined;
  let coCho = false;
  let hen: ReturnType<typeof setTimeout> | undefined;
  let dangGui: Promise<void> | null = null;
  const kho = (): Kho | undefined => {
    try {
      return o.kho ?? (typeof localStorage === 'undefined' ? undefined : localStorage);
    } catch {
      return undefined;
    }
  };
  const thu = (f: (k: Kho) => void) => {
    try {
      const k = kho();
      if (k && o.khoa) f(k);
    } catch {
      /* localStorage không dùng được (chế độ riêng tư…): bỏ qua, tự lưu vẫn chạy */
    }
  };

  async function guiMotLan(): Promise<void> {
    while (coCho) {
      coCho = false;
      const bay = moiNhat as T;
      o.khiDoiTrangThai?.('dang-luu');
      try {
        await o.luu(bay);
        if (!coCho) thu((k) => k.removeItem(o.khoa!));
        o.khiDoiTrangThai?.('da-luu');
      } catch {
        // Giữ bản mới nhất để không mất chữ; lần doi kế tiếp sẽ gửi lại.
        thu((k) => k.setItem(o.khoa!, JSON.stringify(bay)));
        o.khiDoiTrangThai?.('loi');
        return;
      }
    }
  }

  function gui(): Promise<void> {
    if (!dangGui) dangGui = guiMotLan().finally(() => (dangGui = null));
    return dangGui;
  }

  return {
    doi(duLieu) {
      moiNhat = duLieu;
      coCho = true;
      clearTimeout(hen);
      hen = setTimeout(() => void gui(), treMs);
    },
    async dungNgay() {
      clearTimeout(hen);
      hen = undefined;
      if (coCho || dangGui) await gui();
    },
  };
}
