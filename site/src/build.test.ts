// Test "đầu-cuối": build thật bằng Astro ra thư mục tạm rồi kiểm tra HTML.
// Ghim các hành vi mà test đơn vị không thấy được: khối rỗng không hiện, URL đúng, nháp không lọt production.
// Hai bài mẫu đang là nháp (draft: true): production KHÔNG có; bản preview CÓ. Các kiểm tra nội dung bài dùng bản preview.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const out = mkdtempSync(join(tmpdir(), 'vtt-build-'));
const outPrev = mkdtempSync(join(tmpdir(), 'vtt-build-prev-'));
const doc = (p: string) => readFileSync(join(out, p, 'index.html'), 'utf8');
const docPrev = (p: string) => readFileSync(join(outPrev, p, 'index.html'), 'utf8');

beforeAll(() => {
  execFileSync('npx', ['astro', 'build', '--outDir', out], {
    cwd: __dirname + '/..',
    env: { ...process.env, BUILD_TARGET: 'production' },
    stdio: 'pipe',
  });
  execFileSync('node', ['scripts/build-cms.mjs', out], {
    cwd: __dirname + '/..',
    env: { ...process.env, GITHUB_REPO: 'chu/blog', SITE_URL: 'https://vntraveltips.monai.click' },
    stdio: 'pipe',
  });
  execFileSync('npx', ['pagefind', '--site', out], { cwd: __dirname + '/..', stdio: 'pipe' });
  execFileSync('npx', ['astro', 'build', '--outDir', outPrev], {
    cwd: __dirname + '/..',
    env: { ...process.env, BUILD_TARGET: 'preview' },
    stdio: 'pipe',
  });
}, 240_000);

describe('build production có analytics', () => {
  it('đặt GOATCOUNTER_CODE → có script đếm lượt xem không cookie; bản preview thì không', () => {
    for (const [target, coScript] of [['production', true], ['preview', false]] as const) {
      const o = mkdtempSync(join(tmpdir(), 'vtt-gc-'));
      execFileSync('npx', ['astro', 'build', '--outDir', o], {
        cwd: __dirname + '/..',
        env: { ...process.env, BUILD_TARGET: target, GOATCOUNTER_CODE: 'vntraveltips' },
        stdio: 'pipe',
      });
      const html = readFileSync(join(o, 'index.html'), 'utf8');
      expect(html.includes('data-goatcounter="https://vntraveltips.goatcounter.com/count"'), target).toBe(coScript);
    }
  }, 120_000);
});

describe('build production', () => {
  it('bài nháp KHÔNG có trên production: không trang, không trong trang chủ, sitemap, RSS', () => {
    expect(existsSync(join(out, 'vung-tau/vung-tau-can-ho-banh-canh/index.html'))).toBe(false);
    expect(existsSync(join(out, 'kinh-nghiem/top-bai-bien-cho-be/index.html'))).toBe(false);
    expect(doc('')).not.toContain('/vung-tau/vung-tau-can-ho-banh-canh/');
    expect(readFileSync(join(out, 'sitemap-0.xml'), 'utf8')).not.toContain('vung-tau-can-ho-banh-canh');
    expect(readFileSync(join(out, 'rss.xml'), 'utf8')).not.toContain('vung-tau-can-ho-banh-canh');
  });

  it('chuyên mục chỉ có bài nháp không được tạo trên production; có trên preview', () => {
    expect(existsSync(join(out, 'chu-de/an-uong/index.html'))).toBe(false);
    expect(existsSync(join(outPrev, 'chu-de/an-uong/index.html'))).toBe(true);
  });

  it('bài có tỉnh nằm ở /tinh/slug/ và có khung Tra nhanh (bản preview)', () => {
    const html = docPrev('vung-tau/vung-tau-can-ho-banh-canh');
    expect(html).toContain('aria-label="Tra nhanh"');
    expect(html).toContain('Câu hỏi thường gặp');
  });

  it('top-list không tỉnh, không traNhanh: nằm ở /kinh-nghiem/ và không hiện khối rỗng (bản preview)', () => {
    const html = docPrev('kinh-nghiem/top-bai-bien-cho-be');
    expect(html).not.toContain('aria-label="Tra nhanh"');
    expect(html).not.toContain('Câu hỏi thường gặp');
    expect(html).not.toContain('Đồ nên mang cho bé');
    expect(html).not.toContain('Bài liên quan');
    expect(html).toContain('Kinh nghiệm');
  });

  it('mặc định chặn Google: meta noindex và robots.txt Disallow', () => {
    expect(doc('')).toContain('noindex, nofollow');
    expect(readFileSync(join(out, 'robots.txt'), 'utf8')).toContain('Disallow: /');
  });

  it('bài có canonical, OG, JSON-LD (bản preview); có sitemap của production', () => {
    const html = docPrev('vung-tau/vung-tau-can-ho-banh-canh');
    expect(html).toContain('<link rel="canonical" href="https://vntraveltips.monai.click/vung-tau/vung-tau-can-ho-banh-canh/"');
    expect(html).toContain('property="og:image" content="https://vntraveltips.monai.click/anh/demo-bien/1600.webp"');
    expect(html).toContain('"@type":"BlogPosting"');
    expect(html).toContain('"@type":"FAQPage"');
    expect(readFileSync(join(out, 'sitemap-index.xml'), 'utf8')).toContain('sitemap-0.xml');
    // RSS chỉ liệt kê bài không phải nháp, ở cả hai bản build.
    expect(readFileSync(join(outPrev, 'rss.xml'), 'utf8')).not.toContain('vung-tau-can-ho-banh-canh');
  });

  it('trang chủ liệt kê bài (bản preview); chuyên mục/loại chỉ tạo khi có bài; có 404', () => {
    const home = docPrev('');
    expect(home).toContain('/vung-tau/vung-tau-can-ho-banh-canh/');
    expect(home).toContain('/kinh-nghiem/top-bai-bien-cho-be/');
    expect(existsSync(join(outPrev, 'chu-de/an-uong/index.html'))).toBe(true);
    expect(existsSync(join(out, 'chu-de/di-chuyen/index.html'))).toBe(false);
    expect(existsSync(join(out, 'loai/review/index.html'))).toBe(false);
    expect(existsSync(join(out, '404.html'))).toBe(true);
  });

  it('có chỉ mục tìm kiếm Pagefind và file redirect nginx', () => {
    expect(existsSync(join(out, 'pagefind/pagefind.js'))).toBe(true);
    expect(readFileSync(join(out, 'redirects.json'), 'utf8')).toBe('[]\n');
  });

  it('ảnh trong thân bài (anh:MÃ) và ảnh địa điểm thành <picture> có width/height (bản preview)', () => {
    const html = docPrev('vung-tau/vung-tau-can-ho-banh-canh');
    expect(html).toContain('alt="Bé chơi cát trên bãi biển buổi sáng"');
    expect(html).not.toContain('anh:demo-bien');
    expect(html).toContain('alt="Phòng khách căn hộ nhìn ra biển"');
    expect(html).toMatch(/<img[^>]*alt="Bé chơi cát[^>]*width="1600" height="1067"/);
  });

  it('/admin: có script CMS tự host và config.yml đã điền repo/site, không còn placeholder', () => {
    expect(existsSync(join(out, 'admin/sveltia-cms.js'))).toBe(true);
    expect(readFileSync(join(out, 'admin/index.html'), 'utf8')).toContain('/admin/sveltia-cms.js');
    const cfg = readFileSync(join(out, 'admin/config.yml'), 'utf8');
    expect(cfg).toContain('repo: chu/blog');
    expect(cfg).toContain('base_url: https://vntraveltips.monai.click');
    expect(cfg).not.toContain('__');
  });

  it('bài có affiliate (bản preview): nút đặt có rel đúng và có dòng tiết lộ dẫn tới chính sách; bài không có thì không', () => {
    const co = docPrev('vung-tau/vung-tau-can-ho-banh-canh');
    expect(co).toMatch(/<a[^>]*rel="sponsored nofollow noopener"[^>]*>/);
    expect(co).toContain('href="/chinh-sach-lien-ket/"');
    const khong = docPrev('kinh-nghiem/top-bai-bien-cho-be');
    expect(khong).not.toContain('sponsored');
    expect(khong).not.toContain('/chinh-sach-lien-ket/');
  });

  it('mọi link ra ngoài của affiliate đều có rel sponsored (không link nào sót, bản preview)', () => {
    const html = docPrev('vung-tau/vung-tau-can-ho-banh-canh');
    for (const m of html.matchAll(/<a [^>]*href="https:\/\/(?:www\.)?(?:agoda|shopee)[^"]*"[^>]*>/g)) {
      expect(m[0]).toContain('rel="sponsored nofollow noopener"');
    }
  });

  it('quảng cáo tắt (bản preview): không có ô quảng cáo hay script AdSense; chưa cấu hình analytics: không có script bên thứ ba', () => {
    const html = docPrev('vung-tau/vung-tau-can-ho-banh-canh');
    expect(html).not.toContain('class="ad-slot');
    expect(html).not.toContain('adsbygoogle');
    expect(html).not.toContain('goatcounter');
    expect(html).not.toContain('googlesyndication');
  });

  it('ảnh bìa ưu tiên tải sớm và có width/height (bản preview)', () => {
    const html = docPrev('kinh-nghiem/top-bai-bien-cho-be');
    expect(html).toMatch(/<img[^>]*fetchpriority="high"/);
    expect(html).toMatch(/<img[^>]*width="1600"[^>]*height="1067"/);
  });
});
