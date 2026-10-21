<!-- Lịch sử phiên bản của một bài: xem, so sánh với bản hiện tại, khôi phục (tạo phiên bản mới, không xoá lịch sử). -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { goiApi } from '../lib/api';
  import { bamLienKet, GOC } from '../lib/dieu-huong.svelte';
  import { thongBaoLoi } from '../lib/phien.svelte';

  let { id }: { id: number } = $props();
  interface Pb { id: number; luc: number; nguoiSua: { ten: string } | null }
  interface SoSanh { thayDoi: { truong: string; truoc: unknown; sau: unknown }[]; noiDung: { them: boolean; xoa: boolean; giaTri: string }[] }
  let ds = $state<Pb[]>([]);
  let chon = $state<number | null>(null);
  let ss = $state<SoSanh | null>(null);
  let loi = $state('');
  let ok = $state('');
  const gioVN = (ms: number) => new Date(ms + 7 * 3600_000).toISOString().slice(0, 16).replace('T', ' ');
  const hien = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v));

  async function tai() {
    ds = await goiApi<Pb[]>('GET', `/bai/${id}/phien-ban`);
  }
  async function soSanh(pid: number) {
    loi = '';
    chon = pid;
    try {
      ss = await goiApi<SoSanh>('GET', `/bai/${id}/phien-ban/${pid}/so-sanh`);
    } catch (e) {
      loi = thongBaoLoi(e);
    }
  }
  async function khoiPhuc(pid: number) {
    if (!confirm('Khôi phục bản này? Hệ thống tạo một phiên bản MỚI từ nội dung cũ, lịch sử hiện tại vẫn được giữ.')) return;
    loi = '';
    ok = '';
    try {
      await goiApi('POST', `/bai/${id}/phien-ban/${pid}/khoi-phuc`);
      ok = 'Đã khôi phục. Mở lại bài để thấy nội dung.';
      await tai();
      await soSanh(pid);
    } catch (e) {
      loi = thongBaoLoi(e);
    }
  }
  onMount(() => void tai().catch((e) => (loi = thongBaoLoi(e))));
</script>

<h1>Lịch sử phiên bản</h1>
<p><a href="{GOC}/bai/{id}" onclick={bamLienKet}>← Quay lại bài</a></p>
{#if loi}<p class="thong-bao-loi" role="alert">{loi}</p>{/if}
{#if ok}<p class="thong-bao-ok" role="status">{ok}</p>{/if}
<div class="the">
  <ul class="danh-sach">
    {#each ds as p, i (p.id)}
      <li>
        <strong>{gioVN(p.luc)}</strong>{i === 0 ? ' · mới nhất' : ''}<br /><span class="nhat">{p.nguoiSua?.ten ?? 'không rõ người sửa'}</span>
        <div class="hang-nut"><button class="phu" onclick={() => soSanh(p.id)}>So với bản hiện tại</button><button class="phu" onclick={() => khoiPhuc(p.id)}>Khôi phục bản này</button></div>
      </li>
    {/each}
  </ul>
</div>
{#if ss && chon !== null}
  <div class="the">
    <h2>So sánh (bản cũ → hiện tại)</h2>
    {#if ss.thayDoi.length === 0 && !ss.noiDung.some((p) => p.them || p.xoa)}<p class="nhat">Không có khác biệt.</p>{/if}
    {#each ss.thayDoi as t}<p><strong>{t.truong}</strong>: <del>{hien(t.truoc)}</del> → <ins>{hien(t.sau)}</ins></p>{/each}
    <pre class="diff">{#each ss.noiDung as p}<span class:them={p.them} class:xoa={p.xoa}>{p.giaTri}</span>{/each}</pre>
  </div>
{/if}

<style>
  .diff { white-space: pre-wrap; word-break: break-word; font: .9rem/1.5 ui-monospace, Menlo, monospace; background: var(--nen); padding: 8px; border-radius: 8px; }
  .them { background: var(--ok-nen); color: var(--ok); }
  .xoa { background: var(--loi-nen); color: var(--loi); text-decoration: line-through; }
  ins { color: var(--ok); text-decoration: none; } del { color: var(--loi); }
</style>
