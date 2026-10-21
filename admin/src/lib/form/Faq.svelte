<!-- Câu hỏi thường gặp: hiện cuối bài và sinh dữ liệu có cấu trúc cho Google. -->
<script lang="ts">
  import type { Faq } from '../kieu';

  let { ds = $bindable() }: { ds: Faq[] } = $props();
</script>

<section class="the">
  <h2>Câu hỏi thường gặp</h2>
  {#each ds as f, i (i)}
    <fieldset>
      <legend>Câu hỏi {i + 1}</legend>
      <label for="faq-h-{i}">Câu hỏi</label><input id="faq-h-{i}" type="text" bind:value={f.hoi} />
      <label for="faq-d-{i}">Trả lời</label><input id="faq-d-{i}" type="text" bind:value={f.dap} />
      <div class="hang-nut"><button type="button" class="nguy" onclick={() => ds.splice(i, 1)}>Xoá</button></div>
    </fieldset>
  {/each}
  <div class="hang-nut"><button type="button" class="phu" onclick={() => ds.push({ hoi: '', dap: '' })}>＋ Thêm câu hỏi</button></div>
</section>
