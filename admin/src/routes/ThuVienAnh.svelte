<!-- Thư viện ảnh: lưới ảnh, tải nhiều ảnh, sửa alt mặc định, xem "đang dùng ở", xoá (mờ + lý do khi đang dùng). -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { goiApi, LoiApi } from '../lib/api';
  import { bamLienKet, GOC } from '../lib/dieu-huong.svelte';
  import { thongBaoLoi } from '../lib/phien.svelte';
  import TaiAnhLen from '../lib/TaiAnhLen.svelte';

  interface Anh { ma: string; url: string; tenGoc: string; rong: number; cao: number; byte: number; altMacDinh: string; soBaiDung: number }
  let ds = $state<Anh[]>([]);
  let tong = $state(0);
  let trang = $state(1);
  let q = $state('');
  let oDia = $state<{ daDungByte: number; conTrongByte: number | null } | null>(null);
  let mo = $state<string | null>(null);
  let dungO = $state<{ bai: { id: number; tieuDe: string }[]; tinh: string[] } | null>(null);
  let alt = $state('');
  let loi = $state('');
  let ok = $state('');

  const MB = (b: number) => `${(b / 1024 / 1024).toFixed(1)} MB`;
  async function tai() {
    const r = await goiApi<{ anh: Anh[]; tong: number }>('GET', `/anh?trang=${trang}&q=${encodeURIComponent(q)}`);
    ds = r.anh;
    tong = r.tong;
    oDia = await goiApi('GET', '/o-dia');
  }
  async function chonAnh(a: Anh) {
    mo = a.ma;
    alt = a.altMacDinh;
    dungO = null;
    try {
      dungO = await goiApi('GET', `/anh/${a.ma}/dung-o`);
    } catch (e) {
      loi = thongBaoLoi(e);
    }
  }
  async function luuAlt(a: Anh) {
    loi = '';
    try {
      await goiApi('PATCH', `/anh/${a.ma}`, { altMacDinh: alt });
      ok = 'Đã lưu mô tả mặc định.';
      await tai();
    } catch (e) {
      loi = thongBaoLoi(e);
    }
  }
  async function xoa(a: Anh) {
    if (!confirm('Xoá ảnh này khỏi máy chủ? Không hoàn tác được.')) return;
    loi = '';
    try {
      await goiApi('DELETE', `/anh/${a.ma}`);
      mo = null;
      ok = 'Đã xoá ảnh.';
      await tai();
    } catch (e) {
      loi = e instanceof LoiApi ? e.loi : thongBaoLoi(e);
    }
  }
  onMount(() => void tai().catch((e) => (loi = thongBaoLoi(e))));
</script>

<h1>Thư viện ảnh</h1>
{#if oDia}<p class="nhat">Ảnh đã dùng {MB(oDia.daDungByte)}{oDia.conTrongByte !== null ? ` · ổ đĩa còn trống ${(oDia.conTrongByte / 1024 ** 3).toFixed(1)} GB` : ''}</p>{/if}
{#if loi}<p class="thong-bao-loi" role="alert">{loi}</p>{/if}
{#if ok}<p class="thong-bao-ok" role="status">{ok}</p>{/if}

<TaiAnhLen khiXong={() => void tai()} />
<label for="q-anh">Tìm ảnh</label>
<input id="q-anh" type="text" bind:value={q} oninput={() => { trang = 1; void tai(); }} placeholder="tên file hoặc mô tả" />

<ul class="luoi">
  {#each ds as a (a.ma)}
    <li><button class="phu anh" class:chon={mo === a.ma} onclick={() => chonAnh(a)} aria-label="Chọn ảnh {a.tenGoc || a.ma}"><img src={a.url} alt={a.altMacDinh || a.tenGoc} loading="lazy" />{#if a.soBaiDung}<span class="dung">{a.soBaiDung}</span>{/if}</button></li>
  {/each}
</ul>
{#if ds.length === 0}<p class="nhat">Chưa có ảnh nào.</p>{/if}
<div class="hang-nut">
  <button class="phu" disabled={trang <= 1} onclick={() => { trang -= 1; void tai(); }}>Trang trước</button>
  <span class="nhat">Trang {trang} · {tong} ảnh</span>
  <button class="phu" disabled={trang * 24 >= tong} onclick={() => { trang += 1; void tai(); }}>Trang sau</button>
</div>

{#each ds.filter((a) => a.ma === mo) as a (a.ma)}
  <section class="the">
    <h2>{a.tenGoc || a.ma}</h2>
    <p class="nhat">{a.rong}×{a.cao} · {MB(a.byte)} · mã {a.ma}</p>
    <label for="alt-mac-dinh">Mô tả mặc định (alt) khi chèn vào bài</label>
    <input id="alt-mac-dinh" type="text" bind:value={alt} />
    <div class="hang-nut"><button onclick={() => luuAlt(a)}>Lưu mô tả</button></div>
    <h3>Đang dùng ở</h3>
    {#if dungO && (dungO.bai.length || dungO.tinh.length)}
      <ul>{#each dungO.bai as b}<li><a href="{GOC}/bai/{b.id}" onclick={bamLienKet}>{b.tieuDe || `Bài #${b.id}`}</a></li>{/each}{#each dungO.tinh as t}<li>Trang tỉnh: {t}</li>{/each}</ul>
    {:else}<p class="nhat">Chưa bài nào dùng ảnh này.</p>{/if}
    <div class="hang-nut">
      <button class="nguy" disabled={a.soBaiDung > 0} onclick={() => xoa(a)}>Xoá ảnh</button>
    </div>
    {#if a.soBaiDung > 0}<p class="nhat">Không xoá được vì ảnh đang được dùng. Gỡ ảnh khỏi bài/tỉnh trước.</p>{/if}
  </section>
{/each}

<style>
  .luoi { list-style: none; margin: 12px 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: 8px; }
  .anh { padding: 0; width: 100%; aspect-ratio: 1; overflow: hidden; position: relative; }
  .anh.chon { outline: 3px solid var(--chinh); }
  .anh img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .dung { position: absolute; right: 4px; bottom: 4px; background: var(--chinh); color: var(--chinh-chu); border-radius: 999px; font-size: .75rem; padding: 0 8px; }
  h3 { font-size: 1rem; }
</style>
