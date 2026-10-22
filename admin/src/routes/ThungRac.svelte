<!-- Thùng rác: khôi phục bài hoặc xoá hẳn (xoá hẳn không hoàn tác được). -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { goiApi } from '../lib/api';
  import { thongBaoLoi } from '../lib/phien.svelte';

  interface Tom { id: number; tieuDe: string; slug: string; suaLuc: number }
  let ds = $state<Tom[]>([]);
  let tong = $state(0);
  let trang = $state(1);
  let loi = $state('');
  let ok = $state('');
  const gioVN = (ms: number) => new Date(ms + 7 * 3600_000).toISOString().slice(0, 16).replace('T', ' ');

  async function tai() {
    const r = await goiApi<{ bai: Tom[]; tong: number }>('GET', `/bai?trangThai=thung-rac&trang=${trang}`);
    // Xoá hẳn/khôi phục hết trang cuối thì lùi về trang trước.
    if (r.bai.length === 0 && trang > 1) {
      trang -= 1;
      return tai();
    }
    ds = r.bai;
    tong = r.tong;
  }
  async function lam(viec: () => Promise<unknown>, thanhCong: string) {
    loi = '';
    ok = '';
    try {
      await viec();
      ok = thanhCong;
      await tai();
    } catch (e) {
      loi = thongBaoLoi(e);
    }
  }
  const khoiPhuc = (b: Tom) => lam(() => goiApi('POST', `/bai/${b.id}/khoi-phuc`), `Đã khôi phục "${b.tieuDe}".`);
  const xoaHan = (b: Tom) => confirm(`Xoá hẳn "${b.tieuDe}"? Không hoàn tác được (ảnh vẫn còn trong thư viện).`) && lam(() => goiApi('DELETE', `/bai/${b.id}`), 'Đã xoá hẳn.');
  onMount(() => void tai().catch((e) => (loi = thongBaoLoi(e))));
</script>

<h1>Thùng rác</h1>
{#if loi}<p class="thong-bao-loi" role="alert">{loi}</p>{/if}
{#if ok}<p class="thong-bao-ok" role="status">{ok}</p>{/if}
<div class="the">
  {#if ds.length === 0}<p class="nhat">Thùng rác trống.</p>{/if}
  <ul class="danh-sach">
    {#each ds as b (b.id)}
      <li>
        <strong>{b.tieuDe || '(chưa có tiêu đề)'}</strong><br /><span class="nhat">/{b.slug}/ · sửa lần cuối {gioVN(b.suaLuc)}</span>
        <div class="hang-nut"><button onclick={() => khoiPhuc(b)}>Khôi phục</button><button class="nguy" onclick={() => xoaHan(b)}>Xoá hẳn</button></div>
      </li>
    {/each}
  </ul>
  <div class="hang-nut">
    <button class="phu" disabled={trang <= 1} onclick={() => { trang -= 1; void tai(); }}>Trang trước</button>
    <span class="nhat">Trang {trang} · {tong} bài</span>
    <button class="phu" disabled={trang * 20 >= tong} onclick={() => { trang += 1; void tai(); }}>Trang sau</button>
  </div>
</div>
