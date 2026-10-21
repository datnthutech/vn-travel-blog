// Kiểm tra các file cấu hình triển khai bằng cách đọc text — bắt lỗi trước khi đụng tới VPS.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const goc = join(__dirname, '..');
const doc = (p: string) => readFileSync(join(goc, p), 'utf8');

describe('docker-compose', () => {
  const compose = parse(doc('deploy/docker-compose.yml'));

  const mcp = compose.services['vntraveltips-mcp'];
  const web = compose.services['vntraveltips-web'];

  it('hai service vntraveltips-mcp và vntraveltips-web, project vntraveltips', () => {
    expect(compose.name).toBe('vntraveltips');
    expect(Object.keys(compose.services).sort()).toEqual(['vntraveltips-mcp', 'vntraveltips-web']);
  });

  it('cổng đúng: mcp 127.0.0.1:8091, web 127.0.0.1:8090 (không mở ra internet)', () => {
    expect(mcp.ports).toEqual(['127.0.0.1:8091:8091']);
    expect(web.ports).toEqual(['127.0.0.1:8090:80']);
  });

  it('giới hạn bộ nhớ: mcp 768m, web 64m', () => {
    expect(mcp.mem_limit).toBe('768m');
    expect(web.mem_limit).toBe('64m');
  });

  it('một volume dùng chung vntraveltips_data mount cùng /data: mcp ghi được, web chỉ đọc', () => {
    expect(mcp.volumes).toContain('vntraveltips_data:/data');
    expect(web.volumes).toContain('vntraveltips_data:/data:ro');
    expect(Object.keys(compose.volumes)).toEqual(['vntraveltips_data']);
  });

  it('mcp đường dẫn cố định trong environment (ghi đè .env): DATA_DIR, ANH_DIR (site luôn là /data/site)', () => {
    expect(mcp.environment).toEqual({ DATA_DIR: '/data', ANH_DIR: '/data/anh' });
    expect(mcp.env_file).toBe('.env'); // compose nhận dạng chuỗi
  });

  it('mcp build tại chỗ (không kéo image từ registry), web build từ deploy/web', () => {
    expect(mcp.image).toBeUndefined();
    expect(mcp.build).toEqual({ context: '..', dockerfile: 'mcp/Dockerfile' });
    expect(web.build).toMatchObject({ context: './web' });
  });

  it('một mạng riêng vntraveltips cho cả hai service; không còn đường dẫn /srv/vntraveltips', () => {
    expect(mcp.networks).toEqual(['vntraveltips']);
    expect(web.networks).toEqual(['vntraveltips']);
    expect(Object.keys(compose.networks)).toEqual(['vntraveltips']);
    expect(doc('deploy/docker-compose.yml')).not.toContain('/srv/vntraveltips');
  });

  it('giới hạn log của cả hai container (json-file, 10m × 3) để log không làm đầy ổ VPS', () => {
    for (const sv of [mcp, web]) {
      expect(sv.logging).toEqual({ driver: 'json-file', options: { 'max-size': '10m', 'max-file': '3' } });
    }
  });

  it('có healthcheck cho cả hai service', () => {
    expect(mcp.healthcheck).toBeDefined();
    expect(web.healthcheck).toBeDefined();
  });
});

describe('không đụng dịch vụ khác trên VPS', () => {
  const file = (d: string): string[] =>
    readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? file(join(d, n)) : [join(d, n)]));

  // Không liệt kê cổng của dịch vụ khác (repo public); thay vào đó: mọi cổng host trong deploy/ chỉ được là 8090/8091.
  it('mọi địa chỉ 127.0.0.1:<cổng> / 0.0.0.0:<cổng> / localhost:<cổng> trong deploy/ chỉ là cổng của VNTravelTips (8090, 8091)', () => {
    const viPham = file(join(goc, 'deploy'))
      .filter((f) => !f.endsWith('.test.ts'))
      .flatMap((f) =>
        [...readFileSync(f, 'utf8').matchAll(/(?:127\.0\.0\.1|0\.0\.0\.0|localhost):(\d{2,5})/g)]
          .map((m) => m[1])
          .filter((c) => c !== '8090' && c !== '8091')
          .map((c) => `${f}: ${c}`),
      );
    expect(viPham).toEqual([]);
  });

  it('nginx chỉ khai báo hai server_name của VNTravelTips', () => {
    const ten = [...doc('deploy/nginx-host.conf.example').matchAll(/server_name\s+([^;]+);/g)].map((m) => m[1]);
    expect(ten.sort()).toEqual(['nhap-vntraveltips.monai.click', 'vntraveltips.monai.click']);
  });
});

describe('sao lưu ảnh', () => {
  const sh = doc('deploy/backup/backup-anh.sh');

  it('script bash hợp lệ về cú pháp', () => {
    execFileSync('bash', ['-n', join(goc, 'deploy/backup/backup-anh.sh')]);
  });

  it('chỉ SAO CHÉP thêm (rclone copy), không bao giờ xoá/đồng bộ ngược → thư mục ảnh trống cũng không xoá được bản sao lưu', () => {
    expect(sh).toContain('set -euo pipefail');
    expect(sh).toMatch(/rclone\/rclone\S* copy \/data\/anh/);
    const lenh = sh.split('\n').filter((l) => !l.trimStart().startsWith('#')).join('\n'); // chỉ dòng lệnh, không tính chú thích
    expect(lenh).not.toMatch(/rclone sync|--delete|rclone delete|rclone purge|rclone move|\bsync\b|\bpurge\b/);
  });

  it('rclone chạy trong Docker, KHÔNG cài trên host; mount volume vntraveltips_data CHỈ ĐỌC', () => {
    expect(sh).toMatch(/docker run --rm/);
    expect(sh).toContain('vntraveltips_data:/data:ro');
    expect(sh).not.toMatch(/^\s*rclone copy/m);
  });

  it('chống chạy chồng (flock) và loại file tạm/bí mật', () => {
    expect(sh).toContain('flock');
    for (const loai of ['.upload-tmp', '.tmp-', '.oauth-state.json']) expect(sh, loai).toContain(loai);
  });

  it('cũng sao chép bản sao lưu SQLite (db/sao-luu) theo cùng luật: chỉ đọc, chỉ thêm', () => {
    expect(sh).toMatch(/rclone\/rclone\S* copy \/data\/db\/sao-luu/);
    expect(sh.match(/vntraveltips_data:\/data:ro/g)).toHaveLength(2);
  });

  it('nguồn là thư mục anh/ trong volume vntraveltips_data; không còn đường dẫn /srv', () => {
    expect(sh).toContain('/data/anh');
    expect(sh).not.toContain('/srv/vntraveltips');
  });
});

describe('README', () => {
  const readme = doc('README.md');

  it('tiếng Việt, có các phần chính người bảo trì cần', () => {
    for (const muc of ['Chạy trên máy', '/admin', 'connector', 'Tải ảnh', 'NOINDEX_ALL', 'GOATCOUNTER_CODE', 'sao lưu', 'npm test']) {
      expect(readme.toLowerCase(), muc).toContain(muc.toLowerCase());
    }
  });

  it('cảnh báo rủi ro: token /admin cùng origin với script bên thứ ba (GoatCounter/AdSense)', () => {
    expect(readme).toMatch(/localStorage/);
    expect(readme).toMatch(/đăng xuất/i);
  });

  it('go_bai không xoá sạch: nói rõ bản xem trước/ảnh/GitHub vẫn còn', () => {
    expect(readme).toMatch(/go_bai[^\n]*(không xoá sạch|vẫn còn)/);
  });

  it('mọi link tới file trong repo đều tồn tại', () => {
    const khongCode = readme.replace(/```[\s\S]*?```/g, '').replace(/`[^`]*`/g, ''); // bỏ cú pháp mẫu nằm trong code
    const links = [...khongCode.matchAll(/\]\((?!https?:|#|mailto:)([^)\s#]+)\)/g)].map((m) => m[1]);
    expect(links.length).toBeGreaterThan(0);
    for (const l of links) expect(existsSync(join(goc, l)), l).toBe(true);
  });
});

describe('hướng dẫn VPS', () => {
  const guide = doc('deploy/VPS-HUONG-DAN.md');

  it('có đủ các bước: chạy ./deploy.sh, healthz, nginx host, connector /mcp; image build NGAY TRÊN VPS (không docker save/load)', () => {
    expect(guide).toContain('./deploy.sh');
    expect(guide).toContain('http://127.0.0.1:8091/healthz');
    expect(guide).toContain('deploy/nginx-host.conf.example');
    expect(guide).toContain('sudo nginx -t');
    expect(guide).toContain('https://vntraveltips.monai.click/mcp');
    expect(guide).toMatch(/build ngay trên VPS/);
    expect(guide).not.toContain('docker save');
    expect(guide).not.toContain('docker load');
  });

  it('callback URL của GitHub OAuth App phủ cả /oauth/github/callback (MCP) lẫn /oauth/cms/callback (admin)', () => {
    expect(guide).toContain('https://vntraveltips.monai.click/oauth/');
  });

  it('không chứa token/secret thật', () => {
    expect(guide).not.toMatch(/ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|gho_[A-Za-z0-9]{20,}/);
  });

  it('mọi biến trong .env.example được hướng dẫn điền', () => {
    const bien = [...doc('deploy/.env.example').matchAll(/^([A-Z_]+)=/gm)].map((m) => m[1]);
    for (const b of bien) expect(guide, b).toContain(b);
  });
});

describe('nginx trên host (chỉ proxy)', () => {
  const ex = doc('deploy/nginx-host.conf.example');
  const khoi = ex.split(/\n(?=server \{)/).filter((k) => k.startsWith('server {'));
  const chinh = khoi.find((k) => k.includes('server_name vntraveltips.monai.click;'))!;
  const preview = khoi.find((k) => k.includes('server_name nhap-vntraveltips.monai.click;'))!;
  // Lấy nội dung một khối location (không có dấu { lồng nhau).
  const loc = (k: string, duong: string) => {
    const i = k.indexOf(`location ${duong} {`);
    expect(i, `thiếu location ${duong}`).toBeGreaterThan(-1);
    return k.slice(i, k.indexOf('}', i));
  };

  it('chỉ có hai server block của VNTravelTips', () => {
    expect(khoi).toHaveLength(2);
    const ten = [...ex.matchAll(/server_name\s+([^;]+);/g)].map((m) => m[1].trim());
    expect(ten.sort()).toEqual(['nhap-vntraveltips.monai.click', 'vntraveltips.monai.click']);
  });

  it('mọi proxy_pass chỉ tới 127.0.0.1:8090 (web) hoặc 127.0.0.1:8091 (mcp)', () => {
    const pp = [...ex.matchAll(/proxy_pass\s+([^;]+);/g)].map((m) => m[1].trim());
    expect(pp.length).toBeGreaterThan(0);
    for (const p of pp) expect(['http://127.0.0.1:8090', 'http://127.0.0.1:8091']).toContain(p);
  });

  it('host chính: /mcp tắt buffer và timeout 300s; /tai-anh nhận 200m không buffer request', () => {
    expect(loc(chinh, '/mcp')).toMatch(/proxy_pass http:\/\/127\.0\.0\.1:8091;/);
    expect(loc(chinh, '/mcp')).toMatch(/proxy_buffering off;/);
    expect(loc(chinh, '/mcp')).toMatch(/proxy_read_timeout 300s;/);
    expect(loc(chinh, '/tai-anh/')).toMatch(/client_max_body_size 200m;/);
    expect(loc(chinh, '/tai-anh/')).toMatch(/proxy_request_buffering off;/);
  });

  it('host chính: /tai-anh, /oauth/, /.well-known/oauth-, /webhook/github đều tới 8091', () => {
    for (const duong of ['/tai-anh/', '/oauth/', '/.well-known/oauth-', '/webhook/github']) {
      expect(loc(chinh, duong)).toMatch(/proxy_pass http:\/\/127\.0\.0\.1:8091;/);
    }
  });

  it('host chính: /quan-tri/ và /api/ tới mcp 8091', () => {
    for (const duong of ['/quan-tri/', '/api/']) expect(loc(chinh, duong)).toMatch(/proxy_pass http:\/\/127\.0\.0\.1:8091;/);
  });

  it('phần còn lại (kể cả /admin) tới web 8090; host nhap-vntraveltips tới web 8090', () => {
    expect(loc(chinh, '/')).toMatch(/proxy_pass http:\/\/127\.0\.0\.1:8090;/);
    expect(loc(preview, '/')).toMatch(/proxy_pass http:\/\/127\.0\.0\.1:8090;/);
  });

  it('location / của cả hai host dùng HTTP/1.1 tới container web (để gzip và keep-alive hoạt động)', () => {
    expect(loc(chinh, '/')).toMatch(/proxy_http_version 1\.1;/);
    expect(loc(preview, '/')).toMatch(/proxy_http_version 1\.1;/);
  });

  it('không phục vụ file tĩnh (không root/alias): file tĩnh do container web làm', () => {
    expect(ex).not.toMatch(/^\s*(root|alias)\s/m);
  });
});

describe('GitHub Actions và rsync đã gỡ', () => {
  it('không còn thư mục .github/workflows (không chạy CI, không SSH vào VPS)', () => {
    expect(existsSync(join(goc, '.github', 'workflows'))).toBe(false);
  });
});

describe('mẫu biến môi trường deploy/.env.example', () => {
  const env = doc('deploy/.env.example');
  const bien = [...env.matchAll(/^([A-Z_]+)=/gm)].map((m) => m[1]);

  it('có đủ biến bắt buộc mà deploy.sh kiểm tra (gồm GITHUB_WEBHOOK_SECRET)', () => {
    for (const b of ['GITHUB_TOKEN', 'GITHUB_REPO', 'ALLOWED_GITHUB_USER', 'PUBLIC_BASE_URL', 'PREVIEW_BASE_URL', 'SESSION_SECRET', 'GITHUB_OAUTH_CLIENT_ID', 'GITHUB_OAUTH_CLIENT_SECRET', 'GITHUB_WEBHOOK_SECRET']) {
      expect(bien).toContain(b);
    }
  });

  it('không có ANH_DIR/SITE_DIR/DATA_DIR (compose cố định các đường dẫn này)', () => {
    for (const b of ['ANH_DIR', 'SITE_DIR', 'DATA_DIR']) expect(bien).not.toContain(b);
  });

  it('có NOINDEX_ALL=true và GOATCOUNTER_CODE=', () => {
    expect(env).toMatch(/^NOINDEX_ALL=true$/m);
    expect(env).toMatch(/^GOATCOUNTER_CODE=$/m);
  });

  it('chú thích token chỉ cần Contents (read/write), không nhắc quyền Actions', () => {
    expect(env).toMatch(/Contents/);
    expect(env).not.toMatch(/Actions/);
  });

  it('deploy/.env bị git bỏ qua (không commit secret thật)', () => {
    expect(() => execFileSync('git', ['check-ignore', '-q', 'deploy/.env'], { cwd: goc })).not.toThrow();
  });
});

describe('vntraveltips-web', () => {
  const conf = doc('deploy/web/nginx.conf');
  // Mỗi khối "server { ... }" tách riêng để kiểm tra từng server.
  const khoi = conf.split(/\n(?=server \{)/).filter((k) => k.startsWith('server {'));
  const preview = khoi.find((k) => k.includes('root /data/preview'))!;
  const site = khoi.find((k) => k.includes('root /data/site'))!;

  it('có đúng hai server: site (mặc định) và preview', () => {
    expect(khoi).toHaveLength(2);
    expect(preview).toBeDefined();
    expect(site).toBeDefined();
  });

  it('server preview nhận hai host, có X-Robots-Tag noindex', () => {
    expect(preview).toMatch(/server_name nhap-vntraveltips\.monai\.click nhap\.localhost;/);
    expect(preview).toMatch(/add_header X-Robots-Tag "noindex, nofollow" always;/);
  });

  it('server site là default_server', () => {
    expect(site).toMatch(/listen 80 default_server;/);
  });

  it('chặn file ẩn trong /anh/ và đặt TRƯỚC location /anh/ ở cả hai server', () => {
    for (const k of [preview, site]) {
      const chan = k.indexOf('location ~ ^/anh/\\.');
      const anh = k.indexOf('location /anh/');
      expect(chan).toBeGreaterThan(-1);
      expect(anh).toBeGreaterThan(chan);
      expect(k.slice(chan, anh)).toMatch(/return 404;/);
    }
  });

  it('/anh/ cache 1 năm và immutable', () => {
    expect(site).toMatch(/location \/anh\/ \{[\s\S]*?expires 1y;[\s\S]*?immutable/);
  });

  it('/admin/ trả 301 tới /quan-tri/ (Sveltia đã gỡ)', () => {
    expect(site).toMatch(/location ~ \^\/admin\(\/\|\$\) \{[^}]*return 301 \/quan-tri\/;/);
  });

  it('không còn file Sveltia/CMS trong repo', () => {
    for (const f of ['site/scripts/build-cms.mjs', 'site/admin/config.template.yml', 'site/public/admin/index.html', 'mcp/src/auth/cms-oauth.ts']) {
      expect(existsSync(join(goc, f)), f).toBe(false);
    }
    expect(doc('site/package.json')).not.toContain('sveltia');
  });

  it('sau proxy của host (HTTP/1.0): vẫn gzip; redirect tự thêm "/" dùng đường dẫn tương đối (giữ https và cổng)', () => {
    expect(conf).toMatch(/^gzip_http_version 1\.0;/m);
    expect(conf).toMatch(/^absolute_redirect off;/m);
  });

  it('@tra_cuu giữ giao thức gốc từ host (X-Forwarded-Proto), không ghi đè bằng http của container', () => {
    expect(site).not.toMatch(/X-Forwarded-Proto \$scheme/);
    expect(site).toMatch(/proxy_set_header X-Forwarded-Proto \$proto_goc;/);
  });

  it('fallback @tra_cuu proxy tới vntraveltips-mcp:8091 (qua biến $mcp + resolver) và đổi 502/504 thành trang 404', () => {
    expect(site).toMatch(/location @tra_cuu \{[\s\S]*?set \$mcp http:\/\/vntraveltips-mcp:8091;[\s\S]*?proxy_pass \$mcp;/);
    expect(site).toMatch(/error_page 502 504 =404 \/404\.html;/);
    expect(conf).toMatch(/resolver 127\.0\.0\.11/);
  });

  it('không proxy tới 127.0.0.1 (chú thích không tính)', () => {
    const code = conf.split('\n').filter((l) => !l.trimStart().startsWith('#')).join('\n');
    // 127.0.0.11 là DNS nội bộ của Docker (resolver), không phải địa chỉ host → loại trừ.
    expect(code).not.toMatch(/127\.0\.0\.1(?!1)/);
  });

  it('không chứa đường dẫn của nginx host (/mcp, /tai-anh, /oauth, /webhook) — host chuyển thẳng sang 8091', () => {
    for (const d of ['location /mcp', 'location /tai-anh', 'location /oauth', 'location /webhook']) {
      expect(conf).not.toContain(d);
    }
  });

  it('có endpoint sức khoẻ /healthz-web cho healthcheck', () => {
    expect(site).toMatch(/location = \/healthz-web \{/);
  });
});

// Repo code là PUBLIC: không file nào được commit có dạng token/khoá bí mật.
describe('repo public không chứa bí mật', () => {
  it('không file đang theo dõi nào chứa dạng token GitHub, API key, khoá riêng', async () => {
    const { execFileSync } = await import('node:child_process');
    const files = execFileSync('git', ['ls-files'], { cwd: goc, encoding: 'utf8' }).split('\n').filter(Boolean);
    const mau = /github_pat_[A-Za-z0-9_]{20,}|ghp_[A-Za-z0-9]{36}|gho_[A-Za-z0-9]{36}|sk-ant-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----/;
    const viPham = files.filter((f) => existsSync(join(goc, f)) && mau.test(readFileSync(join(goc, f), 'utf8')));
    expect(viPham).toEqual([]);
  });

  it('deploy/.env và docs/ không bị theo dõi', async () => {
    const { execFileSync } = await import('node:child_process');
    const files = execFileSync('git', ['ls-files'], { cwd: goc, encoding: 'utf8' }).split('\n');
    expect(files.filter((f) => f === 'deploy/.env' || f.startsWith('docs/'))).toEqual([]);
  });
});

