<!-- Ảnh bìa: chọn từ thư viện / tải mới, kèm alt (bắt buộc khi đăng). -->
<script lang="ts">
  import type { AnhRef } from '../kieu';
  import ChonAnh from './ChonAnh.svelte';

  let { anh = $bindable(), anhBaseUrl, loi = [], nhan = 'Ảnh bìa' }: { anh: AnhRef; anhBaseUrl: string; loi?: string[]; nhan?: string } = $props();
  let mo = $state(false);
</script>

<div class="anh-bia">
  <span class="nhan">{nhan}</span>
  {#if anh.ma}<img src="{anhBaseUrl}/anh/{anh.ma}/480.webp" alt={anh.alt || 'Ảnh đã chọn'} />{/if}
  <div class="hang-nut"><button type="button" class="phu" onclick={() => (mo = true)}>{anh.ma ? 'Đổi ảnh' : 'Chọn ảnh'}</button>
    {#if anh.ma}<button type="button" class="nguy" onclick={() => (anh = { ma: '', alt: '' })}>Bỏ ảnh</button>{/if}</div>
  <label for="alt-{nhan}">Mô tả ảnh (alt) — bắt buộc</label>
  <input id="alt-{nhan}" type="text" bind:value={anh.alt} />
  {#each loi as l}<p class="thong-bao-loi">{l}</p>{/each}
  {#if mo}<ChonAnh onDong={() => (mo = false)} onChon={(a) => { anh = { ma: a.ma, alt: anh.alt || a.alt }; mo = false; }} />{/if}
</div>

<style>
  .nhan { font-weight: 600; display: block; margin-top: 12px; }
  img { max-width: 240px; width: 100%; border-radius: 8px; display: block; margin: 8px 0; }
</style>
