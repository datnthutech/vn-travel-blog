// Repo có nhiều writer + bản dịch AI + Claude/MCP cùng ghi nội dung, và site chung tên miền với /quan-tri:
// script lọt vào trang công khai = chạy dưới quyền của quản trị khi họ mở bài (lấy CSRF, gọi API admin).
// Test build thật một bài cố tình chèn mã độc vào thân bài, link và tiêu đề (JSON-LD).
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const goc = join(__dirname, '..');
const noiDung = mkdtempSync(join(tmpdir(), 'vtt-xss-nd-'));
const out = mkdtempSync(join(tmpdir(), 'vtt-xss-out-'));
let html = '';

beforeAll(() => {
  cpSync(join(goc, 'src/content'), noiDung, { recursive: true });
  cpSync(join(goc, 'redirects.json'), join(noiDung, 'redirects.json'));
  const f = join(noiDung, 'bai-viet/vung-tau-can-ho-banh-canh.md');
  let s = readFileSync(f, 'utf8');
  s = s.replace(/^tieuDe: .*$/m, `tieuDe: 'Thử </script><script>alert("JSONLD")</script>'`);
  s = s.replace(
    'Mua hải sản ở chợ về nấu cho cả nhà.',
    'Mua hải sản ở chợ về nấu cho cả nhà.\n\n<script>alert("MD")</script>\n\n<img src=x onerror="alert(1)">\n\nChữ có <b onmouseover="alert(2)">thẻ</b> giữa câu.\n\n[bấm vào](javascript:alert(3)) và [an toàn](https://example.com/) và [nội bộ](/kinh-nghiem/)\n\n![ảnh lạ](javascript:alert(4))',
  );
  writeFileSync(f, s);
  execFileSync('npx', ['astro', 'build', '--outDir', out], {
    cwd: goc,
    env: { ...process.env, BUILD_TARGET: 'preview', NOI_DUNG_DIR: noiDung },
    stdio: 'pipe',
  });
  html = readFileSync(join(out, 'vung-tau/vung-tau-can-ho-banh-canh/index.html'), 'utf8');
}, 180_000);

describe('nội dung do người viết nhập không thể chèn mã chạy trên site', () => {
  it('HTML thô trong thân bài hiện thành chữ, không thành thẻ', () => {
    expect(html).not.toContain('<script>alert("MD")');
    expect(html).not.toMatch(/<img[^>]*onerror/i);
    expect(html).not.toMatch(/<b[^>]*onmouseover/i);
    expect(html).toContain('&#x3C;script>alert("MD")'); // vẫn thấy nội dung, dạng chữ (Astro escape "<" thành &#x3C;)
  });

  it('link/ảnh javascript: bị vô hiệu; link http(s) và nội bộ giữ nguyên', () => {
    expect(html).not.toMatch(/(href|src)="\s*javascript:/i);
    expect(html).toContain('href="https://example.com/"');
    expect(html).toContain('href="/kinh-nghiem/"');
  });

  it('tiêu đề chứa </script> không thoát được khỏi khối JSON-LD', () => {
    expect(html).not.toContain('</script><script>alert("JSONLD")');
    const khoi = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    expect(khoi.length).toBeGreaterThan(0);
    for (const k of khoi) expect(() => JSON.parse(k)).not.toThrow();
    expect(khoi.some((k) => JSON.parse(k).headline?.includes('</script>'))).toBe(true); // dữ liệu vẫn đúng
  });
});
