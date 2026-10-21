<!-- Người đăng ký nhận tin (chỉ quản trị): lọc, tìm email, xoá, tải CSV. Email không bao giờ ra API công khai. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { goiApi } from '../lib/api';
  import { bamLienKet, GOC } from '../lib/dieu-huong.svelte';
  import { thongBaoLoi } from '../lib/phien.svelte';

  interface N { id: number; email: string; ngonNgu: string; trangThai: 'cho-xac-nhan' | 'da-xac-nhan' | 'da-huy'; taoLuc: number }
  const TEN = { 'cho-xac-nhan': 'Chờ xác nhận', 'da-xac-nhan': 'Đã xác nhận', 'da-huy': 'Đã huỷ' } as const;
  let ds = $state<N[]>([]);
  let tong = $state(0);
  let trang = $state(1);
  let tt = $state('');
  let q = $state('');
  let nn = $state('');
  let ngonDs = $state<{ ma: string; ten: string }[]>([]);
  let loi = $state('');
  let seq = 0;
  const gio = (ms: number) => new Date(ms).toLocaleDateString('vi-VN');

  async function tai() {
    const luot = ++seq;
    const qs = new URLSearchParams({ trang: String(trang) });
    if (tt) qs.set('trangThai', tt);
    if (q.trim()) qs.set('q', q.trim());
    if (nn) qs.set('ngonNgu', nn);
    try {
      const r = await goiApi<{ nguoi: N[]; tong: number }>('GET', `/nguoi-dang-ky?${qs}`);
      if (luot !== seq) return;
      ds = r.nguoi;
      tong = r.tong;
      loi = '';
    } catch (e) {
      loi = thongBaoLoi(e);
    }
  }
  const loc = () => {
    trang = 1;
    void tai();
  };
  async function xoa(n: N) {
    if (!confirm(`Xoá ${n.email} khỏi danh sách? Không hoàn tác được.`)) return;
    try {
      await goiApi('DELETE', `/nguoi-dang-ky/${n.id}`);
      await tai();
    } catch (e) {
      loi = thongBaoLoi(e);
    }
  }
  onMount(() => {
    void goiApi<{ ngonNgu: { ma: string; ten: string; bat: boolean }[] }>('GET', '/ngon-ngu').then((r) => (ngonDs = r.ngonNgu)).catch(() => {});
    void tai();
  });
</script>

<p><a href="{GOC}/ban-tin" onclick={bamLienKet}>← Bản tin</a></p>
<h1>Người đăng ký</h1>
{#if loi}<p class="thong-bao-loi" role="alert">{loi}</p>{/if}
<div class="the">
  <label for="dk-tt">Trạng thái</label>
  <select id="dk-tt" bind:value={tt} onchange={loc}>
    <option value="">Tất cả</option><option value="da-xac-nhan">Đã xác nhận</option><option value="cho-xac-nhan">Chờ xác nhận</option><option value="da-huy">Đã huỷ</option>
  </select>
  {#if ngonDs.length > 1}
    <label for="dk-nn">Ngôn ngữ</label>
    <select id="dk-nn" bind:value={nn} onchange={loc}><option value="">Tất cả</option>{#each ngonDs as n}<option value={n.ma}>{n.ten} ({n.ma})</option>{/each}</select>
  {/if}
  <label for="dk-q">Tìm email</label>
  <input id="dk-q" type="search" bind:value={q} onchange={loc} />
  <div class="hang-nut"><a class="nut phu" href="/api/admin/nguoi-dang-ky.csv" download>Tải CSV</a></div>
</div>
<section class="the">
  {#if ds.length === 0}<p class="nhat">Chưa có ai.</p>{/if}
  <ul class="danh-sach">
    {#each ds as n (n.id)}
      <li>
        <strong>{n.email}</strong> <span class="nhat">· {TEN[n.trangThai]} · {n.ngonNgu} · {gio(n.taoLuc)}</span>
        <div class="hang-nut"><button class="nguy" onclick={() => xoa(n)}>Xoá</button></div>
      </li>
    {/each}
  </ul>
  <div class="hang-nut">
    <button class="phu" disabled={trang <= 1} onclick={() => { trang -= 1; void tai(); }}>Trang trước</button>
    <span class="nhat">Trang {trang} · {tong} người</span>
    <button class="phu" disabled={trang * 50 >= tong} onclick={() => { trang += 1; void tai(); }}>Trang sau</button>
  </div>
</section>

<style>
  .nut { display: inline-flex; align-items: center; text-decoration: none; }
  input[type=search] { width: 100%; padding: 8px 12px; border: 1px solid var(--vien); border-radius: 8px; background: var(--nen); color: var(--chu); font: inherit; }
</style>
