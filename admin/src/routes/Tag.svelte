<!-- Tag: xem số bài, đổi tên (gộp nếu tag đích đã có), danh sách tag chỉ còn ở bài trong thùng rác. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { goiApi } from '../lib/api';
  import { thongBaoLoi } from '../lib/phien.svelte';

  interface T { tag: string; soBai: number }
  let ds = $state<T[]>([]);
  let khongDung = $state<T[]>([]);
  let tu = $state('');
  let den = $state('');
  let loi = $state('');
  let ok = $state('');

  async function tai() {
    [ds, khongDung] = await Promise.all([goiApi<{ tag: T[] }>('GET', '/tag').then((r) => r.tag), goiApi<{ tag: T[] }>('GET', '/tag/khong-dung').then((r) => r.tag)]);
  }
  async function doiTen(e: SubmitEvent) {
    e.preventDefault();
    loi = '';
    ok = '';
    try {
      const r = await goiApi<{ daDoi: number }>('POST', '/tag/doi-ten', { tu, den });
      ok = r.daDoi > 0 ? `Đã đổi "${tu}" → "${den}" trong ${r.daDoi} bài.` : `Không bài nào dùng tag "${tu}".`;
      tu = '';
      den = '';
      await tai();
    } catch (e) {
      loi = thongBaoLoi(e);
    }
  }
  onMount(() => void tai().catch((e) => (loi = thongBaoLoi(e))));
</script>

<h1>Tag</h1>
{#if loi}<p class="thong-bao-loi" role="alert">{loi}</p>{/if}
{#if ok}<p class="thong-bao-ok" role="status">{ok}</p>{/if}

<form class="the" onsubmit={doiTen}>
  <h2>Đổi tên / gộp tag</h2>
  <label for="tag-tu">Tag cũ</label><input id="tag-tu" type="text" required bind:value={tu} list="ds-tag" />
  <datalist id="ds-tag">{#each ds as t}<option value={t.tag}></option>{/each}</datalist>
  <label for="tag-den">Đổi thành (đã có tag này thì hai tag gộp làm một)</label><input id="tag-den" type="text" required bind:value={den} />
  <div class="hang-nut"><button type="submit">Đổi tên</button></div>
</form>

<section class="the">
  <h2>Đang dùng</h2>
  {#if ds.length === 0}<p class="nhat">Chưa có tag nào.</p>{/if}
  <ul class="danh-sach">{#each ds as t}<li>{t.tag} <span class="nhat">· {t.soBai} bài</span> <button class="phu" onclick={() => { tu = t.tag; den = t.tag; }}>Đổi tên</button></li>{/each}</ul>
</section>
{#if khongDung.length}
  <section class="the">
    <h2>Chỉ còn ở bài trong thùng rác</h2>
    <p class="nhat">Các tag này sẽ biến mất khỏi site (xoá hẳn bài hoặc khôi phục bài để dùng lại).</p>
    <ul class="danh-sach">{#each khongDung as t}<li>{t.tag} <span class="nhat">· {t.soBai} bài</span></li>{/each}</ul>
  </section>
{/if}
