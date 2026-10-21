// Đổi "code" GitHub trả về lấy tài khoản đăng nhập. Dùng chung cho OAuth của MCP và của /admin.
// Token trả về CHỈ để người gọi dùng ngay (hỏi "bạn là ai", hoặc giao cho CMS); tuyệt đối không log.
import type { Config } from '../config';

export async function dangNhapGithub(
  config: Config,
  code: string,
  redirectUri: string,
  fetchFn: typeof fetch,
): Promise<{ login: string; accessToken: string } | null> {
  try {
    const tk = await fetchFn('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: config.githubOauthClientId,
        client_secret: config.githubOauthClientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });
    const accessToken = ((await tk.json()) as { access_token?: string }).access_token;
    if (!accessToken) return null;
    const u = await fetchFn('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/vnd.github+json', 'User-Agent': 'vntraveltips-mcp' },
    });
    const login = ((await u.json()) as { login?: string }).login;
    return login ? { login, accessToken } : null;
  } catch {
    return null;
  }
}
