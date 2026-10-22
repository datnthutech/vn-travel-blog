<!-- Nhật ký thao tác quan trọng (chỉ quản trị): lọc theo loại, người, khoảng ngày (giờ Việt Nam). -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { goiApi } from '../lib/api';
  import { thongBaoLoi } from '../lib/phien.svelte';

  interface D { id: number; luc: number; nguoiDung: { id: number; ten: string | null } | null; loai: string; ip: string | null; chiTiet: unknown }
  let dong = $state<D[]>([]);
  let tong = $state(0);
  let trang = $state(1);
  let loai = $state('');
  let tu = $state('');
  let den = $state('');
  let nguoi = $state('');
  let nguoiDs = $state<{ id: number; ten: string }[]>([]);
  let loi = $state('');
  let seq = 0;
  const gio = (ms: number) => new Date(ms).toLocaleString('vi-VN');

  async function tai() {
    const luot = ++seq;
    const qs = new URLSearchParams({ trang: String(trang) });
    if (loai.trim()) qs.set('loai', loai.trim());
    if (tu) qs.set('tu', tu);
    if (den) qs.set('den', den);
    if (nguoi) qs.set('nguoiDungId', nguoi);
    try {
      const r = await goiApi<{ dong: D[]; tong: number }>('GET', `/nhat-ky?${qs}`);
      if (luot !== seq) return;
      dong = r.dong;
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
  onMount(() => {
    void goiApi<{ id: number; ten: string }[]>('GET', '/tai-khoan').then((r) => (nguoiDs = r)).catch(() => {});
    void tai();
  });
</script>

<h1>Nhật ký</h1>
{#if loi}<p class="thong-bao-loi" role="alert">{loi}</p>{/if}
<div class="the">
  <label for="nk-loai">Loại (vd dang-nhap, doi-vai-tro, khoa, dang-bai)</label><input id="nk-loai" type="text" bind:value={loai} onchange={loc} />
  <label for="nk-nguoi">Người thao tác</label>
  <select id="nk-nguoi" bind:value={nguoi} onchange={loc}><option value="">Tất cả</option>{#each nguoiDs as u}<option value={String(u.id)}>{u.ten}</option>{/each}</select>
  <label for="nk-tu">Từ ngày</label><input id="nk-tu" type="date" bind:value={tu} onchange={loc} />
  <label for="nk-den">Đến ngày</label><input id="nk-den" type="date" bind:value={den} onchange={loc} />
</div>
<section class="the">
  {#if dong.length === 0}<p class="nhat">Không có dòng nào.</p>{:else}
    <table class="bang">
      <thead><tr><th>Lúc</th><th>Ai</th><th>Việc</th><th>IP</th></tr></thead>
      <tbody>{#each dong as d (d.id)}<tr><td>{gio(d.luc)}</td><td>{d.nguoiDung?.ten ?? '—'}</td><td>{d.loai}{d.chiTiet ? ` ${JSON.stringify(d.chiTiet)}` : ''}</td><td>{d.ip ?? ''}</td></tr>{/each}</tbody>
    </table>
  {/if}
  <div class="hang-nut">
    <button class="phu" disabled={trang <= 1} onclick={() => { trang -= 1; void tai(); }}>Trang trước</button>
    <span class="nhat">Trang {trang} · {tong} dòng</span>
    <button class="phu" disabled={trang * 50 >= tong} onclick={() => { trang += 1; void tai(); }}>Trang sau</button>
  </div>
</section>
