// Test "đầu-cuối": build thật bằng Astro ra thư mục tạm rồi kiểm tra HTML.
// Ghim các hành vi mà test đơn vị không thấy được: khối rỗng không hiện, URL đúng, nháp không lọt production.
// Hai bài mẫu đang là nháp (draft: true): production KHÔNG có; bản preview CÓ. Các kiểm tra nội dung bài dùng bản preview.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
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

// Build từ nội dung "xuất từ DB" (NOI_DUNG_DIR): chuyên mục đổi tên/đổi slug phải dựng đúng trang, chuyên mục lạ phải làm build dừng.
describe('build với NOI_DUNG_DIR', () => {
  const GOC = join(__dirname, 'content');
  function taoThuMuc(sua: (f: string, nd: string) => string): string {
    const d = mkdtempSync(join(tmpdir(), 'vtt-nd-'));
    cpSync(GOC, d, { recursive: true });
    for (const f of ['chuyen-muc.json', 'bai-viet/top-bai-bien-cho-be.md', 'bai-viet/vung-tau-can-ho-banh-canh.md']) {
      writeFileSync(join(d, f), sua(f, readFileSync(join(d, f), 'utf8')));
    }
    return d;
  }
  const buildPreview = (noiDung: string, target: 'preview' | 'production' = 'preview') => {
    const o = mkdtempSync(join(tmpdir(), 'vtt-nd-out-'));
    execFileSync('npx', ['astro', 'build', '--outDir', o], {
      cwd: __dirname + '/..',
      env: { ...process.env, BUILD_TARGET: target, NOI_DUNG_DIR: noiDung },
      stdio: 'pipe',
    });
    return o;
  };

  it('đổi slug chuyên mục an-uong → am-thuc: có /chu-de/am-thuc/ (tên mới), không còn /chu-de/an-uong/', () => {
    const nd = taoThuMuc((f, t) => (f === 'chuyen-muc.json' ? t.replace('"an-uong", "ten": "Ăn uống"', '"am-thuc", "ten": "Ẩm thực"') : t.replace(/an-uong/g, 'am-thuc')));
    const o = buildPreview(nd);
    expect(existsSync(join(o, 'chu-de/am-thuc/index.html'))).toBe(true);
    expect(readFileSync(join(o, 'chu-de/am-thuc/index.html'), 'utf8')).toContain('Ẩm thực');
    expect(existsSync(join(o, 'chu-de/an-uong/index.html'))).toBe(false);
  }, 120_000);

  it('redirect trang chuyên mục cũ → mới được chấp nhận và ghi ra redirects.json', () => {
    const nd = taoThuMuc((f, t) => (f === 'chuyen-muc.json' ? t.replace('"an-uong", "ten": "Ăn uống"', '"am-thuc", "ten": "Ẩm thực"') : t.replace(/an-uong/g, 'am-thuc')));
    writeFileSync(join(nd, 'redirects.json'), JSON.stringify([{ tu: '/chu-de/an-uong/', den: '/chu-de/am-thuc/' }]));
    const o = buildPreview(nd);
    expect(JSON.parse(readFileSync(join(o, 'redirects.json'), 'utf8'))).toEqual([{ tu: '/chu-de/an-uong/', den: '/chu-de/am-thuc/' }]);
  }, 120_000);

  it('bài dùng chuyên mục không có trong chuyen-muc.json → build dừng, nêu rõ chuyên mục', () => {
    const nd = taoThuMuc((f, t) => (f === 'chuyen-muc.json' ? t.replace(/\{ "slug": "an-uong".*\},?\n/, '') : t));
    expect(() => buildPreview(nd)).toThrow();
    try {
      buildPreview(nd);
    } catch (e) {
      expect(String((e as { stderr?: Buffer }).stderr ?? e)).toMatch(/chuyên mục "an-uong" không tồn tại/);
    }
  }, 240_000);

  it('menu: mục trỏ bài nháp có ở preview nhưng KHÔNG có trong HTML production; mục hợp lệ luôn có', () => {
    const nd = taoThuMuc((_f, t) => t);
    writeFileSync(
      join(nd, 'menu.json'),
      JSON.stringify({
        dauTrang: [
          { nhan: 'Bãi biển êm', loai: 'bai', giaTri: 'top-bai-bien-cho-be' },
          { nhan: 'Facebook', loai: 'link', giaTri: 'https://facebook.com/vntraveltips', con: [{ nhan: 'Giới thiệu', loai: 'trang', giaTri: 'gioi-thieu' }] },
        ],
        chanTrang: [{ nhan: 'Chính sách', loai: 'trang', giaTri: 'chinh-sach-lien-ket' }],
      }),
    );
    const preview = readFileSync(join(buildPreview(nd), 'index.html'), 'utf8');
    const prod = readFileSync(join(buildPreview(nd, 'production'), 'index.html'), 'utf8');
    expect(preview).toContain('Bãi biển êm');
    expect(preview).toContain('href="/kinh-nghiem/top-bai-bien-cho-be/"');
    expect(prod).not.toContain('Bãi biển êm');
    expect(prod).not.toContain('top-bai-bien-cho-be');
    for (const html of [preview, prod]) {
      expect(html).toContain('href="https://facebook.com/vntraveltips"');
      expect(html).toContain('href="/gioi-thieu/"'); // mục con
      expect(html).toContain('href="/chinh-sach-lien-ket/"'); // chân trang
    }
  }, 240_000);
});
