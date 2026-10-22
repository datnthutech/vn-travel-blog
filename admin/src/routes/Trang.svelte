<!-- Danh sách trang tĩnh (giới thiệu, chính sách, liên hệ + trang tự tạo) và tạo trang mới. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { goiApi } from '../lib/api';
  import { bamLienKet, di, GOC } from '../lib/dieu-huong.svelte';
  import { thongBaoLoi } from '../lib/phien.svelte';

  interface T { slug: string; tieuDe: string; trangThai: 'nhap' | 'da-dang'; coDinh: boolean }
  let ds = $state<T[]>([]);
  let tieuDe = $state('');
  let loi = $state('');
  onMount(() => void goiApi<{ trang: T[] }>('GET', '/trang').then((r) => (ds = r.trang)).catch((e) => (loi = thongBaoLoi(e))));
  async function tao(e: SubmitEvent) {
    e.preventDefault();
    loi = '';
    try {
      const t = await goiApi<{ slug: string }>('POST', '/trang', { tieuDe });
      di(`${GOC}/trang/${t.slug}`);
    } catch (e) {
      loi = thongBaoLoi(e);
    }
  }
</script>

<h1>Trang tĩnh</h1>
{#if loi}<p class="thong-bao-loi" role="alert">{loi}</p>{/if}
<section class="the">
  <ul class="danh-sach">
    {#each ds as t (t.slug)}
      <li><a href="{GOC}/trang/{t.slug}" onclick={bamLienKet}><strong>{t.tieuDe}</strong></a>
        <span class="nhat"> · {t.coDinh ? 'cố định' : `/trang/${t.slug}/`} · {t.trangThai === 'da-dang' ? 'đã đăng' : 'nháp'}</span></li>
    {/each}
  </ul>
</section>
<form class="the" onsubmit={tao}>
  <h2>Tạo trang mới</h2>
  <label for="tr-tieu-de">Tiêu đề</label><input id="tr-tieu-de" type="text" required bind:value={tieuDe} />
  <div class="hang-nut"><button type="submit">Tạo và soạn nội dung</button></div>
</form>
