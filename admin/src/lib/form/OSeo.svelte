<!-- Ô SEO: slug (tự gợi ý từ tiêu đề, sửa tay được), mô tả có đếm độ dài, xem trước Google. -->
<script lang="ts">
  import { taoSlug } from '@vntraveltips/schema';
  import { danhGiaMoTa, danhGiaTieuDe, xemTruocGoogle } from '../seo';

  let {
    tieuDe, slug = $bindable(), moTa = $bindable(), tinh, publicBaseUrl, slugDaDang = false, loi = {},
  }: { tieuDe: string; slug: string; moTa: string; tinh?: string; publicBaseUrl: string; slugDaDang?: boolean; loi?: Record<string, string[]> } = $props();

  let suaTay = $state(slug !== '');
  // Chưa sửa tay thì slug đi theo tiêu đề (bài đã đăng: không tự đổi, vì đổi slug làm đổi URL).
  $effect(() => {
    if (!suaTay && !slugDaDang && tieuDe.trim()) slug = taoSlug(tieuDe);
  });

  let dgTieuDe = $derived(danhGiaTieuDe(tieuDe));
  let dgMoTa = $derived(danhGiaMoTa(moTa));
  let url = $derived(`${publicBaseUrl}/${tinh ? `${tinh}/` : 'kinh-nghiem/'}${slug}/`);
  let xem = $derived(xemTruocGoogle({ tieuDe, url, moTa }));
  const TEN = { tot: 'tốt', ngan: 'hơi ngắn', dai: 'hơi dài' } as const;
</script>

<section class="the">
  <h2>SEO</h2>
  <label for="seo-slug">Đường dẫn (slug)</label>
  <input id="seo-slug" type="text" bind:value={slug} oninput={() => (suaTay = true)} />
  <p class="nhat">{url}</p>
  {#if slugDaDang}<p class="thong-bao-loi">Bài đã đăng: đổi slug sẽ đổi địa chỉ bài (hệ thống tự tạo chuyển hướng 301 từ địa chỉ cũ).</p>{/if}
  {#each loi.slug ?? [] as l}<p class="thong-bao-loi">{l}</p>{/each}

  <label for="seo-mota">Mô tả (hiện trên Google và khi chia sẻ)</label>
  <textarea id="seo-mota" rows="3" bind:value={moTa}></textarea>
  <p class={dgMoTa.trangThai === 'tot' ? 'nhat' : 'thong-bao-loi'}>{dgMoTa.doDai} ký tự — {TEN[dgMoTa.trangThai]} (nên 120–160)</p>
  {#each loi.moTa ?? [] as l}<p class="thong-bao-loi">{l}</p>{/each}
  <p class="nhat">Tiêu đề: {dgTieuDe.doDai} ký tự — {TEN[dgTieuDe.trangThai]} (nên 30–65)</p>

  <h3>Xem trước trên Google</h3>
  <div class="google">
    <div class="g-url">{xem.duongDan}</div>
    <div class="g-tieu">{xem.tieuDe}</div>
    <div class="g-mota">{xem.moTa}</div>
  </div>
  <h3>Xem trước khi chia sẻ</h3>
  <div class="chia-se"><strong>{xem.tieuDe}</strong><br /><span class="nhat">{xem.moTa}</span></div>
</section>

<style>
  textarea { width: 100%; padding: 8px 12px; border: 1px solid var(--vien); border-radius: 8px; background: var(--nen); color: var(--chu); font: inherit; }
  h3 { font-size: 1rem; margin: 16px 0 6px; }
  .google { background: #fff; color: #202124; border-radius: 8px; padding: 12px; font-family: Arial, sans-serif; }
  .g-url { color: #202124; font-size: .8rem; word-break: break-all; }
  .g-tieu { color: #1a0dab; font-size: 1.1rem; margin: 2px 0; }
  .g-mota { color: #4d5156; font-size: .85rem; }
  .chia-se { border: 1px solid var(--vien); border-radius: 8px; padding: 10px 12px; }
</style>
