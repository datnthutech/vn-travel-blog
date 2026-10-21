<!-- Danh sách đồ nên mang cho bé (link bán hàng tự gắn rel="sponsored" trên site). -->
<script lang="ts">
  import type { DoChoBe } from '../kieu';

  let { ds = $bindable() }: { ds: DoChoBe[] } = $props();
</script>

<section class="the">
  <h2>Đồ nên mang cho bé</h2>
  {#each ds as d, i (i)}
    <fieldset>
      <legend>Món {i + 1}</legend>
      <label for="do-ten-{i}">Tên</label><input id="do-ten-{i}" type="text" bind:value={d.ten} />
      <label for="do-gc-{i}">Ghi chú</label><input id="do-gc-{i}" type="text" bind:value={d.ghiChu} />
      <label for="do-link-{i}">Link mua</label><input id="do-link-{i}" type="text" inputmode="url" bind:value={d.link} />
      <div class="hang-nut"><button type="button" class="nguy" onclick={() => ds.splice(i, 1)}>Xoá</button></div>
    </fieldset>
  {/each}
  <div class="hang-nut"><button type="button" class="phu" onclick={() => ds.push({ ten: '' })}>＋ Thêm món</button></div>
</section>
