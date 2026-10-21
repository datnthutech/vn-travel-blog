// Mỗi lần build là một trong hai "bản": production (không có nháp) hoặc preview (có nháp, noindex).
// Tiến trình build trong container vntraveltips-mcp đặt biến môi trường BUILD_TARGET; chạy local không đặt thì mặc định là preview.
export type BuildTarget = 'production' | 'preview';

export function buildTarget(env: Record<string, string | undefined> = process.env): BuildTarget {
  return env.BUILD_TARGET === 'production' ? 'production' : 'preview';
}
