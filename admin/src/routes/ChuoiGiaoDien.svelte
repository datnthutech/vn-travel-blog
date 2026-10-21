<!-- Dịch chuỗi giao diện (quản trị): mỗi dòng "tiếng Việt → bản dịch"; để trống = dùng tiếng Việt. "Dịch bằng AI" chỉ điền, bấm Lưu mới lưu. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { goiApi, LoiApi } from '../lib/api';
  import { thongBaoLoi } from '../lib/phien.svelte';

  interface Ngon { ma: string; ten: string; bat: boolean }
  let ngon = $state<Ngon[]>([]);
  let ma = $state('');
  let goc = $state<Record<string, string>>({});
  let dich = $state<Record<string, string>>({});
  let loi = $state('');
  let ok = $state('');
  let ban = $state(false);
  const thieu = $derived(Object.keys(goc).filter((k) => !(dich[k] ?? '').trim()).length);

  async function taiNgon() {
    try {
      ngon = (await goiApi<{ ngonNgu: Ngon[] }>('GET', '/ngon-ngu')).ngonNgu.filter((n) => n.ma !== 'vi');
      if (!ma && ngon[0]) ma = ngon[0].ma;
    } catch (e) {
      loi = thongBaoLoi(e);
    }
  }
  async function taiDich() {
    if (!ma) return;
    loi = '';
    try {
      const r = await goiApi<{ banGoc: Record<string, string>; duLieu: Record<string, string> | null }>('GET', `/dich/giao-dien/giao-dien/${ma}`);
      goc = r.banGoc;
      dich = { ...(r.duLieu ?? {}) };
    } catch (e) {
      loi = thongBaoLoi(e);
    }
  }
  async function luu() {
    ban = true;
    loi = '';
    ok = '';
    try {
      await goiApi('PUT', `/dich/giao-dien/giao-dien/${ma}`, dich);
      ok = 'Đã lưu chuỗi giao diện.';
    } catch (e) {
      loi = thongBaoLoi(e);
    }
    ban = false;
  }
  async function dichAi() {
    ban = true;
    loi = '';
    ok = '';
    try {
      const nguon = Object.fromEntries(Object.entries(goc).filter(([k]) => !(dich[k] ?? '').trim()));
      if (Object.keys(nguon).length === 0) return void (ok = 'Mọi chuỗi đã có bản dịch.');
      const r = await goiApi<{ ketQua: Record<string, string> }>('POST', '/dich-ai/chuoi', { nguon, ngonNgu: ma });
      dich = { ...dich, ...r.ketQua };
      ok = 'AI đã điền các chuỗi còn thiếu — đọc lại rồi bấm Lưu (chưa lưu gì).';
    } catch (e) {
      loi = e instanceof LoiApi ? e.loi : 'Không dịch được bằng AI.';
    }
    ban = false;
  }
  onMount(() => void taiNgon().then(taiDich));
</script>

<h1>Chuỗi giao diện</h1>
{#if loi}<p class="thong-bao-loi" role="alert">{loi}</p>{/if}
{#if ok}<p class="thong-bao-ok" role="status">{ok}</p>{/if}
{#if ngon.length === 0}
  <p class="nhat">Chưa có ngôn ngữ nào ngoài tiếng Việt. Thêm ở mục Ngôn ngữ.</p>
{:else}
  <div class="the">
    <label for="gd-ma">Ngôn ngữ</label>
    <select id="gd-ma" bind:value={ma} onchange={taiDich}>{#each ngon as n}<option value={n.ma}>{n.ten} ({n.ma}){n.bat ? '' : ' — đang tắt'}</option>{/each}</select>
    <p class="nhat">Còn {thieu} chuỗi chưa dịch (dùng tiếng Việt). Giữ nguyên các chỗ như <code>{'{n}'}</code>.</p>
    <div class="hang-nut"><button type="button" onclick={luu} disabled={ban}>Lưu</button><button type="button" class="phu" onclick={dichAi} disabled={ban}>Dịch các chuỗi thiếu bằng AI</button></div>
  </div>
  <section class="the">
    {#each Object.keys(goc) as k (k)}
      <div class="dong-chuoi">
        <label for="gd-{k}"><span class="nhat">{k}</span><br />{goc[k]}</label>
        <input id="gd-{k}" type="text" bind:value={dich[k]} maxlength="1000" />
      </div>
    {/each}
  </section>
{/if}

<style>
  .dong-chuoi { margin: 12px 0; }
  input { width: 100%; padding: 8px 12px; border: 1px solid var(--vien); border-radius: 8px; background: var(--nen); color: var(--chu); font: inherit; }
</style>
