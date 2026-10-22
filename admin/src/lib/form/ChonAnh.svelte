<!-- Chọn ảnh từ thư viện (hoặc tải ảnh mới lên) rồi trả về { ma, alt }. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { goiApi } from '../api';
  import { thongBaoLoi } from '../phien.svelte';
  import TaiAnhLen from '../TaiAnhLen.svelte';

  interface Anh { ma: string; url: string; altMacDinh: string; tenGoc: string }
  let { onChon, onDong }: { onChon: (a: { ma: string; alt: string }) => void; onDong: () => void } = $props();

  let ds = $state<Anh[]>([]);
  let q = $state('');
  let loi = $state('');
  async function tai() {
    try {
      ds = (await goiApi<{ anh: Anh[] }>('GET', `/anh?q=${encodeURIComponent(q)}`)).anh;
    } catch (e) {
      loi = thongBaoLoi(e);
    }
  }
  onMount(() => void tai());
</script>

<div class="hop" role="dialog" aria-modal="true" aria-label="Chọn ảnh">
  <div class="the">
    <div class="hang-nut"><button type="button" class="phu" onclick={onDong}>Đóng</button></div>
    <label for="tim-anh">Tìm ảnh</label>
    <input id="tim-anh" type="text" bind:value={q} oninput={tai} placeholder="tên file hoặc mô tả" />
    {#if loi}<p class="thong-bao-loi">{loi}</p>{/if}
    <TaiAnhLen khiXong={(kq) => { void tai(); if (kq.ok.length === 1) onChon({ ma: kq.ok[0]!.ma, alt: '' }); }} />
    <ul class="luoi">
      {#each ds as a (a.ma)}
        <li><button type="button" class="phu anh" onclick={() => onChon({ ma: a.ma, alt: a.altMacDinh })}><img src={a.url} alt={a.altMacDinh || a.tenGoc} loading="lazy" /></button></li>
      {/each}
    </ul>
    {#if ds.length === 0}<p class="nhat">Chưa có ảnh nào.</p>{/if}
  </div>
</div>

<style>
  .hop { position: fixed; inset: 0; background: rgba(0, 0, 0, .55); z-index: 20; overflow: auto; padding: 16px; }
  .hop .the { max-width: 720px; margin: 0 auto; }
  .luoi { list-style: none; margin: 12px 0 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: 8px; }
  .anh { padding: 0; width: 100%; aspect-ratio: 1; overflow: hidden; }
  .anh img { width: 100%; height: 100%; object-fit: cover; display: block; }
</style>
