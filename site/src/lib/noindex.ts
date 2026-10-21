// Có chặn Google lập chỉ mục không? Mặc định CÓ (NOINDEX_ALL chưa đặt) cho tới khi chủ blog sẵn sàng (Task 17).
// Bản preview luôn chặn, bất kể NOINDEX_ALL.
export function coNoindex(env: Record<string, string | undefined> = process.env): boolean {
  if (env.BUILD_TARGET !== 'production') return true;
  return env.NOINDEX_ALL !== 'false';
}
