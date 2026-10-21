// Đếm lượt xem nhẹ, KHÔNG cookie: GoatCounter (miễn phí). Chỉ bật cho bản production và khi đã đặt GOATCOUNTER_CODE
// (tên site trên goatcounter.com, tạo ở bước cuối trong README). Chưa đặt → không có script bên thứ ba nào được tải.
export function goatcounterScript(
  env: Record<string, string | undefined> = process.env,
): { endpoint: string; src: string } | null {
  const ma = env.GOATCOUNTER_CODE;
  if (env.BUILD_TARGET !== 'production' || !ma || !/^[a-z0-9-]{1,40}$/.test(ma)) return null;
  return { endpoint: `https://${ma}.goatcounter.com/count`, src: 'https://gc.zgo.at/count.js' };
}
