// Test "đầu-cuối": build thật bằng Astro ra thư mục tạm rồi kiểm tra HTML.
// Ghim các hành vi mà test đơn vị không thấy được: khối rỗng không hiện, URL đúng, nháp không lọt production.
// Hai bài mẫu đang là nháp (draft: true): production KHÔNG có; bản preview CÓ. Các kiểm tra nội dung bài dùng bản preview.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
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

  it('Cài đặt site: choPhepLapChiMuc=false → mọi trang production có noindex; true → không có; GoatCounter chỉ ở production', async () => {
    const { caiDatSiteMacDinh } = await import('@vntraveltips/schema');
    const taoVoi = (cd: object) => {
      const nd = taoThuMuc((_f, t) => t);
      writeFileSync(join(nd, 'cai-dat.json'), JSON.stringify({ ...caiDatSiteMacDinh({}), ...cd }));
      return nd;
    };
    const chan = taoVoi({ choPhepLapChiMuc: false, goatcounterCode: 'vntraveltips', tenSite: 'Blog Thử' });
    const prodChan = buildPreview(chan, 'production');
    const prevChan = buildPreview(chan, 'preview');
    const mo = taoVoi({ choPhepLapChiMuc: true, goatcounterCode: 'vntraveltips' });
    const prodMo = buildPreview(mo, 'production');
    const trang = (o: string) => ['index.html', 'gioi-thieu/index.html'].map((f) => readFileSync(join(o, f), 'utf8'));
    for (const h of trang(prodChan)) expect(h).toContain('name="robots" content="noindex, nofollow"');
    for (const h of trang(prodMo)) expect(h).not.toContain('noindex');
    expect(trang(prodMo)[0]).toContain('data-goatcounter="https://vntraveltips.goatcounter.com/count"');
    expect(trang(prevChan)[0]).not.toContain('goatcounter'); // preview không đếm lượt xem
    expect(trang(prodChan)[0]).toContain('Blog Thử'); // tên site lấy từ Cài đặt
  }, 360_000);

  it('trang tĩnh: sửa gioi-thieu có nội dung mới; trang tự tạo ở /trang/<slug>/ (nháp chỉ ở preview); trang không có file thì dùng mẫu', () => {
    const nd = taoThuMuc((_f, t) => t);
    writeFileSync(join(nd, 'trang/gioi-thieu.md'), '---\ntieuDe: Về chúng tôi\nmoTa: Mô tả mới\n---\n\nNội dung giới thiệu **mới tinh**.\n');
    writeFileSync(join(nd, 'trang/hop-tac.md'), '---\ntieuDe: Hợp tác\nmoTa: ""\n---\n\nChúng tôi nhận hợp tác.\n');
    const prod = buildPreview(nd, 'production');
    const gt = readFileSync(join(prod, 'gioi-thieu/index.html'), 'utf8');
    expect(gt).toContain('Về chúng tôi');
    expect(gt).toContain('<strong>mới tinh</strong>');
    expect(readFileSync(join(prod, 'trang/hop-tac/index.html'), 'utf8')).toContain('Chúng tôi nhận hợp tác.');
    expect(existsSync(join(prod, 'lien-he/index.html'))).toBe(true);
    expect(existsSync(join(prod, 'chinh-sach-lien-ket/index.html'))).toBe(true);
  }, 240_000);

  it('bản tin: production có form ở chân MỌI trang (không cần JS: method=post) + form cuối bài; preview KHÔNG có; script ≤ 2 KB gzip', async () => {
    const { gzipSync } = await import('node:zlib');
    const { readdirSync } = await import('node:fs');
    const nd = taoThuMuc((f, t) => (f.endsWith('top-bai-bien-cho-be.md') ? t.replace('draft: true', 'draft: false\nmaBai: 77') : t));
    const prod = buildPreview(nd, 'production');
    for (const trang of ['index.html', 'gioi-thieu/index.html', 'kinh-nghiem/top-bai-bien-cho-be/index.html']) {
      const html = readFileSync(join(prod, trang), 'utf8');
      expect(html, trang).toContain('action="/api/cong-khai/ban-tin/dang-ky"');
      expect(html, trang).toContain('name="website"');
      expect(html, trang).toContain('id="ban-tin-da-gui"');
    }
    const bai = readFileSync(join(prod, 'kinh-nghiem/top-bai-bien-cho-be/index.html'), 'utf8');
    expect(bai.split('data-ban-tin').length - 1).toBeGreaterThanOrEqual(2); // chân trang + cuối bài (script cũng chứa chuỗi selector)
    const assets = join(prod, '_astro');
    const trongHtml = [...bai.matchAll(/<script[^>]*type="module"[^>]*>([\s\S]*?)<\/script>/g)].map((x) => x[1]!);
    const taiSan = existsSync(assets) ? readdirSync(assets).filter((f) => f.endsWith('.js')).map((f) => readFileSync(join(assets, f), 'utf8')) : [];
    const js = [...trongHtml, ...taiSan].find((c) => c.includes('ban-tin') && c.includes('Kiểm tra hộp thư'));
    expect(js).toBeDefined();
    expect(gzipSync(js!).length).toBeLessThanOrEqual(2 * 1024);
    const prev = buildPreview(nd, 'preview');
    expect(readFileSync(join(prev, 'index.html'), 'utf8')).not.toContain('/api/cong-khai/ban-tin/dang-ky');
    expect(readFileSync(join(prev, 'kinh-nghiem/top-bai-bien-cho-be/index.html'), 'utf8')).not.toContain('/api/cong-khai/ban-tin/dang-ky');
  }, 360_000);

  /** Thư mục nội dung có bài vi + bản dịch en của bài vung-tau (đã đăng), ngon-ngu.json và giao-dien/en.json (chỉ 2 khoá). */
  function taoNdEn(): string {
    const nd = taoThuMuc((f, t) => (f.endsWith('.md') ? t.replace('draft: true', 'draft: false') : t));
    const slugVi = 'vung-tau-can-ho-banh-canh';
    const vi = readFileSync(join(nd, `bai-viet/${slugVi}.md`), 'utf8');
    writeFileSync(join(nd, `bai-viet/${slugVi}.md`), vi.replace('hopTac: false', `hopTac: false\nbanDich:\n  en: /en/vung-tau/vung-tau-apartment/`));
    const en = vi
      .replace(/^tieuDe: .*$/m, 'tieuDe: Vung Tau 2 days in an apartment')
      .replace(`slug: ${slugVi}`, 'slug: vung-tau-apartment')
      .replace(/^moTa: .*$/m, `moTa: ${'An English description of the two day Vung Tau apartment trip with a small child, where we stayed, what we cooked and ate, and tips for parents.'}`)
      .replace('hopTac: false', 'hopTac: false\nmaBai: 77\nngonNgu: en\nbanDich:\n  vi: /vung-tau/vung-tau-can-ho-banh-canh/')
      .replace('draft: false', 'draft: false');
    mkdirSync(join(nd, 'bai-viet/en'), { recursive: true });
    writeFileSync(join(nd, 'bai-viet/en/vung-tau-apartment.md'), en);
    writeFileSync(join(nd, 'ngon-ngu.json'), JSON.stringify([{ ma: 'vi', ten: 'Tiếng Việt', thuTu: 0 }, { ma: 'en', ten: 'English', thuTu: 1 }]));
    mkdirSync(join(nd, 'giao-dien'), { recursive: true });
    writeFileSync(join(nd, 'giao-dien/en.json'), JSON.stringify({ 'tra-nhanh': 'Quick facts', 'trang-chu': 'Home', 'bt.dang-ky': 'Subscribe', 'bt.da-gui': 'Check your inbox to confirm.', 'bl.tieu-de': 'Comments' }));
    return nd;
  }

  it('đa ngôn ngữ: /en/… có lang, hreflang (vi/en/x-default), sitemap, RSS, chuỗi giao diện theo giao-dien/en.json (thiếu → chuỗi vi + build.json liệt kê); bài chỉ có vi không có hreflang thừa; URL tiếng Việt không đổi', () => {
    const nd = taoNdEn();
    const o = buildPreview(nd, 'production');
    const docO = (p: string) => readFileSync(join(o, p, 'index.html'), 'utf8');

    const bai = docO('en/vung-tau/vung-tau-apartment');
    expect(bai).toContain('<html lang="en"');
    expect(bai).toContain('<link rel="alternate" hreflang="vi" href="https://vntraveltips.monai.click/vung-tau/vung-tau-can-ho-banh-canh/"');
    expect(bai).toContain('hreflang="en" href="https://vntraveltips.monai.click/en/vung-tau/vung-tau-apartment/"');
    expect(bai).toContain('hreflang="x-default" href="https://vntraveltips.monai.click/vung-tau/vung-tau-can-ho-banh-canh/"');
    expect(bai).toContain('<link rel="canonical" href="https://vntraveltips.monai.click/en/vung-tau/vung-tau-apartment/"');
    expect(bai).toContain('Quick facts'); // chuỗi từ giao-dien/en.json
    expect(bai).toContain('Thời gian'); // khoá thiếu → chuỗi tiếng Việt
    expect(bai).toContain('class="chuyen-ngon-ngu"'); // nút chuyển ngôn ngữ, chỉ về bản dịch của chính trang này
    expect(bai).toContain('href="/vung-tau/vung-tau-can-ho-banh-canh/" hreflang="vi"');
    // newsletter + bình luận theo ngôn ngữ của trang: form gửi kèm mã ngôn ngữ, chữ lấy từ giao-dien/en.json
    expect(bai).toContain('<input type="hidden" name="ngonNgu" value="en"');
    expect(bai).toContain('>Subscribe</button>');
    expect(bai).toContain('data-da-gui="Check your inbox to confirm."');
    expect(bai).toContain('data-ngon-ngu="en"');
    expect(bai).toContain('<h2>Comments</h2>');
    expect(docO('vung-tau/vung-tau-can-ho-banh-canh')).toContain('<input type="hidden" name="ngonNgu" value="vi"');
    expect(docO('en')).toContain('<html lang="en"');
    expect(existsSync(join(o, 'en/vung-tau/index.html'))).toBe(true); // hub tỉnh có bản dịch
    expect(existsSync(join(o, 'en/rss.xml'))).toBe(true);
    expect(readFileSync(join(o, 'en/rss.xml'), 'utf8')).toContain('/en/vung-tau/vung-tau-apartment/');
    expect(readFileSync(join(o, 'rss.xml'), 'utf8')).not.toContain('/en/');

    const viHtml = docO('vung-tau/vung-tau-can-ho-banh-canh');
    expect(viHtml).toContain('<html lang="vi"');
    expect(viHtml).toContain('hreflang="en" href="https://vntraveltips.monai.click/en/vung-tau/vung-tau-apartment/"');
    expect(viHtml).toContain('hreflang="x-default"');
    expect(viHtml).toContain('Tra nhanh'); // tiếng Việt không đổi
    // bài chỉ có tiếng Việt: không có thẻ hreflang nào, không có nút chuyển ngôn ngữ
    const chiVi = docO('kinh-nghiem/top-bai-bien-cho-be');
    expect(chiVi).not.toContain('hreflang');
    expect(chiVi).not.toContain('class="chuyen-ngon-ngu"');

    const sitemap = readdirSync(o).filter((f) => /^sitemap-\d+\.xml$/.test(f)).map((f) => readFileSync(join(o, f), 'utf8')).join('');
    expect(sitemap).toContain('/en/vung-tau/vung-tau-apartment/');
    // build.json liệt kê khoá giao diện thiếu (viết bằng chính script sau build)
    const tm = mkdtempSync(join(tmpdir(), 'vtt-bj-'));
    mkdirSync(join(tm, 'dist'));
    execFileSync('node', [join(__dirname, '..', 'scripts', 'write-build-json.mjs')], { cwd: tm, env: { PATH: process.env.PATH, NOI_DUNG_DIR: nd }, stdio: 'pipe' });
    const thieu = JSON.parse(readFileSync(join(tm, 'dist/build.json'), 'utf8')).giaoDienThieu as Record<string, string[]>;
    expect(Object.keys(thieu)).toEqual(['en']);
    expect(thieu.en).toContain('thoi-gian');
    expect(thieu.en).not.toContain('tra-nhanh');
  }, 360_000);

  it('bản dịch cấu trúc: menu en chỉ giữ mục có bản dịch đã đăng (nhãn dịch, href /en/…), trang tĩnh dịch có URL /en/<slug>/, tên chuyên mục/tỉnh/site dịch hiện ở trang en', () => {
    const nd = taoNdEn();
    writeFileSync(
      join(nd, 'menu.json'),
      JSON.stringify({
        dauTrang: [
          { nhan: 'Giới thiệu', loai: 'trang', giaTri: 'gioi-thieu' },
          { nhan: 'Liên hệ', loai: 'trang', giaTri: 'lien-he' },
          { nhan: 'Bài Vũng Tàu', loai: 'bai', giaTri: 'vung-tau-can-ho-banh-canh' },
          { nhan: 'Tỉnh', loai: 'tinh', giaTri: 'vung-tau' },
        ],
        chanTrang: [],
      }),
    );
    mkdirSync(join(nd, 'trang-dich/en'), { recursive: true });
    writeFileSync(join(nd, 'trang-dich/en/about-us.md'), '---\ntieuDe: About us\nmoTa: ""\nslugGoc: gioi-thieu\n---\n\nWe are a small family.\n');
    writeFileSync(
      join(nd, 'dich-cau-truc.json'),
      JSON.stringify([
        { loai: 'menu', khoa: 'dauTrang.0', ngonNgu: 'en', duLieu: { nhan: 'About' } },
        { loai: 'menu', khoa: 'dauTrang.2', ngonNgu: 'en', duLieu: { nhan: 'Vung Tau post' } },
        { loai: 'tinh', khoa: 'vung-tau', ngonNgu: 'en', duLieu: { ten: 'Vung Tau city', gioiThieu: 'A seaside city.', moTa: '', anhBiaAlt: '' } },
        { loai: 'chuyen-muc', khoa: 'an-uong', ngonNgu: 'en', duLieu: { ten: 'Food', moTa: '' } },
        { loai: 'site', khoa: 'site', ngonNgu: 'en', duLieu: { tenSite: 'VNTravelTips EN', moTaMacDinh: 'Family travel diary' } },
      ]),
    );
    const o = buildPreview(nd, 'production');
    const docO = (p: string) => readFileSync(join(o, p, 'index.html'), 'utf8');
    const trang = docO('en/vung-tau/vung-tau-apartment');
    const menu = /<nav class="menu menu-dauTrang"[\s\S]*?<\/nav>/.exec(trang)![0];
    expect(menu).toContain('<a href="/en/about-us/">About</a>'); // trang đã dịch → URL slug dịch, nhãn dịch
    expect(menu).not.toContain('lien-he'); // trang chưa có bản dịch → ẩn
    expect(menu).toContain('<a href="/en/vung-tau/vung-tau-apartment/">Vung Tau post</a>'); // bài → URL bản dịch
    expect(menu).toContain('/en/vung-tau/">Tỉnh</a>'); // tỉnh có bài dịch → hiện, nhãn chưa dịch giữ tiếng Việt
    expect(docO('en/about-us')).toContain('We are a small family.');
    expect(docO('en/about-us')).toContain('<html lang="en"');
    expect(docO('en/vung-tau')).toContain('Vung Tau city');
    expect(docO('en/vung-tau')).toContain('A seaside city.');
    expect(docO('en/chu-de/an-uong')).toContain('Food');
    expect(docO('en')).toContain('VNTravelTips EN');
    // trang vi không bị ảnh hưởng: menu tiếng Việt vẫn đủ 4 mục với nhãn gốc
    const menuVi = /<nav class="menu menu-dauTrang"[\s\S]*?<\/nav>/.exec(docO('gioi-thieu'))![0];
    expect(menuVi).toContain('>Liên hệ</a>');
    expect(menuVi).toContain('>Giới thiệu</a>');
  }, 360_000);

  it('bình luận: production có khung (data-bai) và script nhỏ ≤ 5 KB gzip; preview KHÔNG có khung; bài không có maBai (mẫu local) không hiện', async () => {
    const { gzipSync } = await import('node:zlib');
    const { readdirSync } = await import('node:fs');
    const nd = taoThuMuc((f, t) => (f.endsWith('top-bai-bien-cho-be.md') ? t.replace('draft: true', 'draft: false\nmaBai: 77') : t));
    const prod = buildPreview(nd, 'production');
    const html = readFileSync(join(prod, 'kinh-nghiem/top-bai-bien-cho-be/index.html'), 'utf8');
    expect(html).toContain('class="binh-luan"'); // khung (không nhầm với chuỗi selector trong script)
    expect(html).toContain('data-bai="77"');
    expect(html).toContain('data-ngon-ngu="vi"');
    expect(html).toContain('class="bl-form" hidden'); // form ẩn tới khi script nạp xong
    // Astro nhúng script nhỏ thẳng vào HTML (hoặc tách ra _astro/*.js nếu lớn): gom cả hai nơi rồi đo phần có mã bình luận.
    const assets = join(prod, '_astro');
    const trongHtml = [...html.matchAll(/<script[^>]*type="module"[^>]*>([\s\S]*?)<\/script>/g)].map((x) => x[1]!);
    const taiSan = existsSync(assets) ? readdirSync(assets).filter((f) => f.endsWith('.js')).map((f) => readFileSync(join(assets, f), 'utf8')) : [];
    const js = [...trongHtml, ...taiSan].find((c) => c.includes('/api/cong-khai/binh-luan'));
    expect(js).toBeDefined();
    expect(gzipSync(js!).length).toBeLessThanOrEqual(5 * 1024);
    // preview: bản xem trước không có form bình luận
    const prev = readFileSync(join(buildPreview(nd, 'preview'), 'kinh-nghiem/top-bai-bien-cho-be/index.html'), 'utf8');
    expect(prev).not.toContain('class="binh-luan"');
    // bài không có maBai → không có khung dù ở production
    const nd2 = taoThuMuc((f, t) => (f.endsWith('top-bai-bien-cho-be.md') ? t.replace('draft: true', 'draft: false') : t));
    expect(readFileSync(join(buildPreview(nd2, 'production'), 'kinh-nghiem/top-bai-bien-cho-be/index.html'), 'utf8')).not.toContain('class="binh-luan"');
  }, 360_000);
});

// Repo có nhiều writer + bản dịch AI + Claude/MCP cùng ghi nội dung, và site chung tên miền với /quan-tri:
// script lọt vào trang công khai = chạy dưới quyền của quản trị khi họ mở bài (lấy CSRF, gọi API admin).
// Test build thật một bài cố tình chèn mã độc vào thân bài, link và tiêu đề (JSON-LD).
describe('nội dung do người viết nhập không thể chèn mã chạy trên site', () => {
  const goc = join(__dirname, '..');
  const noiDung = mkdtempSync(join(tmpdir(), 'vtt-xss-nd-'));
  const outXss = mkdtempSync(join(tmpdir(), 'vtt-xss-out-'));
  let html = '';

  // Build trong cùng file với các build khác (chạy tuần tự): hai `astro build` song song dùng chung site/.astro sẽ đụng nhau.
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
  execFileSync('npx', ['astro', 'build', '--outDir', outXss], {
    cwd: goc,
    env: { ...process.env, BUILD_TARGET: 'preview', NOI_DUNG_DIR: noiDung },
    stdio: 'pipe',
  });
  html = readFileSync(join(outXss, 'vung-tau/vung-tau-can-ho-banh-canh/index.html'), 'utf8');
}, 180_000);

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

describe('giao diện B — khung trang', () => {
  // Astro tách CSS của layout ra file `_astro/*.css`; gom các file đó lại để kiểm tra biến và luật CSS.
  const cssCua = (goc: string, html: string) =>
    [...html.matchAll(/href="(\/_astro\/[^"]+\.css)"/g)].map((m) => readFileSync(join(goc, m[1]), 'utf8')).join('\n');

  it('bảng màu của giao diện B khai báo trên :root', () => {
    const css = cssCua(outPrev, docPrev(''));
    expect(css).toMatch(/--nen:\s*#fffaf3/);
    expect(css).toMatch(/--nhan:\s*#d9622b/);
  });

  it('điện thoại có đúng một ☰ (details.menu-dt) với nhãn "Mở menu"', () => {
    const html = docPrev('');
    expect(html.match(/<details class="menu-dt"/g)).toHaveLength(1);
    expect(html).toMatch(/<summary[^>]*aria-label="Mở menu"/);
  });

  it('header có nút tìm kiếm tới /tim-kiem/ với nhãn "Tìm kiếm"', () => {
    const the = /<a [^>]*href="\/tim-kiem\/"[^>]*>/.exec(docPrev(''))?.[0] ?? '';
    expect(the).toContain('aria-label="Tìm kiếm"');
  });

  it('trang 404 production vẫn có header và footer', () => {
    const html = readFileSync(join(out, '404.html'), 'utf8');
    expect(html).toContain('class="site-header"');
    expect(html).toContain('class="site-footer"');
  });
});

describe('giao diện B — thẻ bài và trang danh sách', () => {
  const trongMain = (html: string) => /<main>([\s\S]*?)<\/main>/.exec(html)![1];
  // Mỗi thẻ là một <article class="the-bai …">; chọn thẻ có link tới bài có slug này.
  const theBai = (html: string, slug: string) =>
    [...html.matchAll(/<article class="the-bai[\s\S]*?<\/article>/g)].map((m) => m[0]).find((the) => the.includes(`/${slug}/`)) ?? '';
  // Astro thêm data-astro-cid-* vào mọi phần tử, nên bộ chọn phải chấp nhận thuộc tính thêm.
  const nhanCua = (the: string) => /<ul class="nhan-the"[^>]*>([\s\S]*?)<\/ul>/.exec(the)?.[1] ?? '';

  it('trang tỉnh: lưới thẻ bài; thẻ có nhãn "4/5 với bé" và tên tỉnh', () => {
    const html = docPrev('vung-tau');
    expect(html).toContain('class="luoi-bai"');
    const nhan = nhanCua(theBai(html, 'vung-tau-can-ho-banh-canh'));
    expect(nhan).toContain('4/5 với bé');
    expect(nhan).toContain('Vũng Tàu');
  });

  it('chuyên mục vui chơi: thẻ bài không có Tra nhanh không có nhãn "với bé" và không có "undefined"', () => {
    const the = theBai(docPrev('chu-de/vui-choi'), 'top-bai-bien-cho-be');
    expect(the).not.toBe('');
    expect(the).not.toContain('với bé');
    expect(the).not.toContain('undefined');
  });

  it('trang kinh nghiệm và loại top-list dùng lưới thẻ bài', () => {
    expect(trongMain(docPrev('kinh-nghiem'))).toContain('class="luoi-bai"');
    expect(trongMain(docPrev('loai/top-list'))).toContain('class="luoi-bai"');
  });

  it('bốn trang danh sách không còn danh sách link trần tới bài', () => {
    for (const p of ['vung-tau', 'chu-de/vui-choi', 'kinh-nghiem', 'loai/top-list']) {
      expect(trongMain(docPrev(p)), p).not.toMatch(/<ul><li><a href="\//);
    }
  });
});

describe('giao diện B — trang chủ', () => {
  it('bản xem trước: ảnh lớn có nút tới bài mới nhất (cùng ngày thì slug nhỏ hơn)', () => {
    const html = docPrev('');
    expect(html).toContain('class="anh-lon"');
    expect(html).toMatch(/href="\/kinh-nghiem\/top-bai-bien-cho-be\/"[^>]*>[^<]*Đọc chuyến mới nhất/);
  });

  it('bản xem trước: khối chủ đề chỉ có chuyên mục có bài; chuyên mục không bài bị bỏ', () => {
    const cuaVao = /<section class="cua-vao"[\s\S]*?<\/section>/.exec(docPrev(''))?.[0] ?? '';
    for (const slug of ['vui-choi', 'luu-tru', 'an-uong']) expect(cuaVao).toContain(`href="/chu-de/${slug}/"`);
    expect(cuaVao).not.toContain('href="/chu-de/sinh-thai/"');
  });

  it('production không có bài đã đăng: vẫn có câu chào; không nút, không khối chủ đề, không lưới bài, không điểm đến', () => {
    const html = doc('');
    expect(html).toMatch(/<h1[^>]*>Du lịch cùng con nhỏ/);
    expect(html).toContain('class="anh-lon khong-anh"');
    expect(html).not.toContain('<picture');
    expect(html).not.toContain('Đọc chuyến mới nhất');
    expect(html).not.toContain('class="cua-vao"');
    expect(html).not.toContain('class="luoi-bai"');
    expect(html).not.toContain('Điểm đến');
  });
});
