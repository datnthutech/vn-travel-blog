<!-- Danh sách sắp xếp được: kéo thả trên máy tính, nút ↑ ↓ (≥ 44 px) trên điện thoại. Mỗi lần đổi gọi onDoiThuTu với thứ tự mới. -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Muc { id: string; nhan: string }
  let { muc, onDoiThuTu, hanhDong }: { muc: Muc[]; onDoiThuTu: (ids: string[]) => void; hanhDong?: Snippet<[Muc]> } = $props();

  let keo = $state<number | null>(null);

  function chuyen(tu: number, den: number) {
    if (den < 0 || den >= muc.length || tu === den) return;
    const ids = muc.map((m) => m.id);
    const [x] = ids.splice(tu, 1);
    ids.splice(den, 0, x!);
    onDoiThuTu(ids);
  }
</script>

<ul class="keo-tha">
  {#each muc as m, i (m.id)}
    <li
      draggable="true"
      class:dang-keo={keo === i}
      ondragstart={(e) => { keo = i; e.dataTransfer?.setData('text/plain', String(i)); }}
      ondragover={(e) => e.preventDefault()}
      ondrop={(e) => { e.preventDefault(); if (keo !== null) chuyen(keo, i); keo = null; }}
      ondragend={() => (keo = null)}
    >
      <span class="tay-cam" aria-hidden="true">⋮⋮</span>
      <span class="ten">{m.nhan}</span>
      {#if hanhDong}<span class="hanh-dong">{@render hanhDong(m)}</span>{/if}
      <button type="button" class="phu len" aria-label="Chuyển {m.nhan} lên" disabled={i === 0} onclick={() => chuyen(i, i - 1)}>↑</button>
      <button type="button" class="phu xuong" aria-label="Chuyển {m.nhan} xuống" disabled={i === muc.length - 1} onclick={() => chuyen(i, i + 1)}>↓</button>
    </li>
  {/each}
</ul>

<style>
  .keo-tha { list-style: none; margin: 0; padding: 0; }
  li { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-top: 1px solid var(--vien); flex-wrap: wrap; }
  li:first-child { border-top: 0; }
  li.dang-keo { opacity: .5; }
  .tay-cam { cursor: grab; color: var(--chu-nhat); width: 20px; text-align: center; }
  .ten { flex: 1; min-width: 120px; }
  button { min-width: 44px; padding: 0; }
</style>
