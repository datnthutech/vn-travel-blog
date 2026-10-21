// Đọc cấu hình từ biến môi trường (file .env trên VPS). Thiếu biến nào → báo rõ tên biến đó ngay khi khởi động,
// thay vì chạy được nửa chừng. Thông báo lỗi CHỈ nêu tên biến, không bao giờ in giá trị (có thể là bí mật).
export interface Config {
  port: number;
  /** Tuỳ chọn: chỉ cần khi repo code là PRIVATE (repo public fetch không cần token). Rỗng = fetch không xác thực. */
  githubToken: string;
  githubRepo: string; // "chu-so-huu/ten-repo"
  publicBaseUrl: string;
  previewBaseUrl: string;
  anhDir: string;
  /** Bản production đang phục vụ (<dataDir>/site, symlink do build đổi) — đọc redirects.json và 404.html. */
  siteDir: string;
  /** Thư mục dữ liệu chung của volume: code/, db/, xuat-build/, builds/, anh/ (mặc định /data). */
  dataDir: string;
  /** Bản xem trước đang phục vụ (symlink do build đổi). */
  previewDir: string;
  /** Bí mật kiểm tra chữ ký webhook GitHub. */
  webhookSecret: string;
  /** Biến build bổ sung (chỉ NOINDEX_ALL, GOATCOUNTER_CODE nếu có) — chỉ dùng cho bản production. */
  buildEnv: Record<string, string>;
  sessionSecret: string;
  /** Khoá AES-256-GCM (64 ký tự hex) mã hoá bí mật trong SQLite và ký token CSRF. KHÔNG bao giờ log hay trả ra API. */
  khoaBiMat: string;
}

const BAT_BUOC = [
  'GITHUB_REPO',
  'PUBLIC_BASE_URL',
  'PREVIEW_BASE_URL',
  'ANH_DIR',
  'SESSION_SECRET',
  'GITHUB_WEBHOOK_SECRET',
  'KHOA_BI_MAT',
] as const;

const BIEN_BUILD_TUY_CHON = ['NOINDEX_ALL', 'GOATCOUNTER_CODE'] as const;

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const thieu = BAT_BUOC.filter((k) => !env[k]);
  if (thieu.length) throw new Error(`Thiếu biến môi trường: ${thieu.join(', ')}`);
  if (env.SESSION_SECRET!.length < 32) throw new Error('SESSION_SECRET phải dài ít nhất 32 ký tự');
  if (!/^[0-9a-fA-F]{64}$/.test(env.KHOA_BI_MAT!)) throw new Error('KHOA_BI_MAT phải gồm đúng 64 ký tự hex (tạo bằng: openssl rand -hex 32)');
  const dataDir = env.DATA_DIR || '/data';
  const buildEnv: Record<string, string> = {};
  for (const k of BIEN_BUILD_TUY_CHON) if (env[k]) buildEnv[k] = env[k]!;
  return {
    port: Number(env.PORT ?? 8091),
    githubToken: env.GITHUB_TOKEN ?? '',
    githubRepo: env.GITHUB_REPO!,
    publicBaseUrl: env.PUBLIC_BASE_URL!.replace(/\/$/, ''),
    previewBaseUrl: env.PREVIEW_BASE_URL!.replace(/\/$/, ''),
    anhDir: env.ANH_DIR!,
    // Luôn suy ra từ dataDir: quy trình build đổi symlink <dataDir>/site, nên đọc redirects.json/404.html cũng phải ở đó.
    siteDir: `${dataDir}/site`,
    dataDir,
    previewDir: `${dataDir}/preview`,
    webhookSecret: env.GITHUB_WEBHOOK_SECRET!,
    buildEnv,
    sessionSecret: env.SESSION_SECRET!,
    khoaBiMat: env.KHOA_BI_MAT!.toLowerCase(),
  };
}
