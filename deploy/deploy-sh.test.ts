// Kiểm tra deploy.sh bằng cách chạy thật, với docker GIẢ đặt đầu PATH (ghi mọi lệnh vào file log).
// Không đụng Docker thật, không đụng cổng thật của VPS (cổng kiểm tra được đổi qua CONG_WEB/CONG_MCP).
import { execFile, execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { beforeAll, describe, expect, it } from 'vitest';

const execAsync = promisify(execFile);
const goc = join(__dirname, '..');
const deploySh = join(goc, 'deploy.sh');

const BIEN_BAT_BUOC = [
  'GITHUB_TOKEN', 'GITHUB_REPO', 'ALLOWED_GITHUB_USER', 'PUBLIC_BASE_URL', 'PREVIEW_BASE_URL',
  'SESSION_SECRET', 'GITHUB_OAUTH_CLIENT_ID', 'GITHUB_OAUTH_CLIENT_SECRET', 'GITHUB_WEBHOOK_SECRET', 'KHOA_BI_MAT',
];
const GIA_TRI_BI_MAT = 'gia-tri-bi-mat-khong-duoc-in-ra-123';

// Docker giả: ghi lại mọi lệnh; trả kết quả theo lệnh (compose up, inspect health, ps cổng).
const DOCKER_GIA = `#!/usr/bin/env bash
echo "$*" >> "$FAKE_DOCKER_LOG"
case "$*" in
  "compose version"*) exit 0 ;;
  *"inspect"*) echo "healthy"; exit 0 ;;
  *"ps"*) if [ -n "$FAKE_PS_OUT" ]; then echo "$FAKE_PS_OUT"; fi; exit 0 ;;
esac
exit 0
`;

let bang: string; // thư mục chứa docker giả
let logFile: string;

beforeAll(() => {
  bang = mkdtempSync(join(tmpdir(), 'vtt-bin-'));
  writeFileSync(join(bang, 'docker'), DOCKER_GIA);
  chmodSync(join(bang, 'docker'), 0o755);
});

function thuMucDeploy(bien: Record<string, string> | null) {
  const dir = mkdtempSync(join(tmpdir(), 'vtt-deploy-'));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'docker-compose.yml'), 'name: vntraveltips\n');
  if (bien) {
    writeFileSync(join(dir, '.env'), Object.entries(bien).map(([k, v]) => `${k}=${v}`).join('\n') + '\n');
  }
  logFile = join(dir, 'docker.log');
  return dir;
}

const DU_BIEN = Object.fromEntries(BIEN_BAT_BUOC.map((k) => [k, k === 'GITHUB_TOKEN' ? GIA_TRI_BI_MAT : 'gia-tri']));
// SESSION_SECRET phải ≥ 32 ký tự ở mcp; deploy.sh chỉ kiểm tra có mặt, nhưng dùng giá trị đúng cho thực tế.
DU_BIEN.SESSION_SECRET = 'x'.repeat(40);

async function chayDeploy(opt: {
  deployDir: string | null;
  env?: Record<string, string>;
  pathBin?: string;
}) {
  const env: Record<string, string> = {
    PATH: `${opt.pathBin ?? bang}:/usr/bin:/bin`,
    HOME: process.env.HOME ?? '',
    FAKE_DOCKER_LOG: logFile,
    CONG_WEB: '0',
    CONG_MCP: '0',
    ...(opt.deployDir ? { DEPLOY_DIR: opt.deployDir } : {}),
    ...(opt.env ?? {}),
  };
  try {
    const { stdout, stderr } = await execAsync('bash', [deploySh], { env, timeout: 60_000 });
    return { code: 0, out: stdout + stderr };
  } catch (e) {
    const err = e as { code?: number; stdout?: string; stderr?: string };
    return { code: err.code ?? 1, out: (err.stdout ?? '') + (err.stderr ?? '') };
  }
}

const docLog = () => (existsSync(logFile) ? readFileSync(logFile, 'utf8') : '');

describe('deploy.sh: cú pháp và ràng buộc', () => {
  const noiDung = readFileSync(deploySh, 'utf8');
  const code = noiDung.split('\n').filter((l) => !l.trimStart().startsWith('#')).join('\n');

  it('bash -n hợp lệ', () => {
    execFileSync('bash', ['-n', deploySh]);
  });

  it('không gọi ssh, rsync, certbot, nginx, curl, git, gh (chỉ docker)', () => {
    expect(code).not.toMatch(/(^|[\s;&|(`])(ssh|rsync|certbot|nginx|curl|git|gh)\s/m);
  });

  it('không có lệnh phá huỷ: system prune, volume rm, down -v', () => {
    expect(code).not.toMatch(/system prune|volume rm|down\s+-v|down\s+--volumes/);
  });

  it('chạy với set -euo pipefail', () => {
    expect(noiDung).toMatch(/set -euo pipefail/);
  });
});

describe('deploy.sh: kiểm tra trước khi chạy', () => {
  it('thiếu docker → thoát khác 0, thông báo nêu "Docker"', async () => {
    const dir = thuMucDeploy(DU_BIEN);
    const bangRong = mkdtempSync(join(tmpdir(), 'vtt-khong-docker-'));
    const kq = await chayDeploy({ deployDir: dir, pathBin: bangRong });
    expect(kq.code).not.toBe(0);
    expect(kq.out).toMatch(/Docker/);
  });

  it('thiếu .env → thoát khác 0 và không gọi compose up', async () => {
    const dir = thuMucDeploy(null);
    const kq = await chayDeploy({ deployDir: dir });
    expect(kq.code).not.toBe(0);
    expect(docLog()).not.toMatch(/up -d/);
  });

  it('thiếu biến bắt buộc → nêu TÊN biến thiếu, không in giá trị, không gọi compose up', async () => {
    const bien: Record<string, string> = { ...DU_BIEN };
    delete bien.GITHUB_WEBHOOK_SECRET;
    const dir = thuMucDeploy(bien);
    const kq = await chayDeploy({ deployDir: dir });
    expect(kq.code).not.toBe(0);
    expect(kq.out).toContain('GITHUB_WEBHOOK_SECRET');
    expect(kq.out).not.toContain(GIA_TRI_BI_MAT);
    expect(docLog()).not.toMatch(/up -d/);
  });

  it('cổng 8090 bị chương trình khác chiếm → thoát khác 0, nêu cổng', async () => {
    const server: Server = createServer();
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    const cong = (server.address() as { port: number }).port;
    try {
      const dir = thuMucDeploy(DU_BIEN);
      const kq = await chayDeploy({ deployDir: dir, env: { CONG_WEB: String(cong) } });
      expect(kq.code).not.toBe(0);
      expect(kq.out).toContain(String(cong));
      expect(docLog()).not.toMatch(/up -d/);
    } finally {
      server.close();
    }
  });

  it('cổng bị chính project vntraveltips giữ → tiếp tục', async () => {
    const server: Server = createServer();
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    const cong = (server.address() as { port: number }).port;
    try {
      const dir = thuMucDeploy(DU_BIEN);
      const kq = await chayDeploy({
        deployDir: dir,
        env: { CONG_WEB: String(cong), FAKE_PS_OUT: `127.0.0.1:${cong}->80/tcp` },
      });
      expect(kq.code).toBe(0);
    } finally {
      server.close();
    }
  });
});

describe('deploy.sh: chạy thành công', () => {
  it('mọi lệnh docker đều có -p vntraveltips hoặc -f deploy/docker-compose.yml, gồm "compose … up -d --build"', async () => {
    const dir = thuMucDeploy(DU_BIEN);
    const kq = await chayDeploy({ deployDir: dir });
    expect(kq.code).toBe(0);
    const dong = docLog().split('\n').filter(Boolean);
    expect(dong.some((d) => /compose .*up -d --build/.test(d))).toBe(true);
    // 'compose version' chỉ kiểm tra plugin, không tác động container nào → không nằm trong bất biến này.
    for (const d of dong.filter((x) => x !== 'compose version')) expect(d).toContain('vntraveltips');
    const compose = dong.filter((d) => d.startsWith('compose') && d !== 'compose version');
    expect(compose.length).toBeGreaterThan(0);
    expect(compose.every((d) => d.includes('-p vntraveltips') && d.includes('-f '))).toBe(true);
  });

  it('chạy lần thứ hai cho kết quả giống lần đầu (idempotent)', async () => {
    const dir = thuMucDeploy(DU_BIEN);
    const a = await chayDeploy({ deployDir: dir });
    const b = await chayDeploy({ deployDir: dir });
    expect(a.code).toBe(0);
    expect(b.code).toBe(0);
  });

  it('in đủ 5 bước và các link', async () => {
    const dir = thuMucDeploy(DU_BIEN);
    const kq = await chayDeploy({ deployDir: dir });
    for (const b of ['[1/5]', '[2/5]', '[3/5]', '[4/5]', '[5/5]']) expect(kq.out).toContain(b);
    expect(kq.out).toContain('http://localhost:8090');
    expect(kq.out).toContain('http://nhap.localhost:8090');
    expect(kq.out).toContain('http://localhost:8091/healthz');
    expect(kq.out).toContain('docker logs -f vntraveltips-mcp');
  });
});
