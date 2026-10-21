// Bài liên quan: cùng tỉnh trước, rồi cùng chuyên mục. Bài không có tỉnh chỉ khớp theo chuyên mục.
import type { BaiViet } from '@vntraveltips/schema';

export function related(bai: BaiViet, tatCa: BaiViet[], toiDa = 3): BaiViet[] {
  const khac = tatCa.filter((b) => b.slug !== bai.slug);
  const cungTinh = bai.tinh ? khac.filter((b) => b.tinh === bai.tinh) : [];
  const cungMuc = khac.filter(
    (b) => !cungTinh.includes(b) && b.chuyenMuc.some((m) => bai.chuyenMuc.includes(m)),
  );
  return [...cungTinh, ...cungMuc].slice(0, toiDa);
}
