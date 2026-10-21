<!-- Menu đầu trang / chân trang: thêm mục (chuyên mục, tỉnh, trang, bài, link), một cấp con, kéo thả/nút ↑↓ đổi thứ tự. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { goiApi, LoiApi } from '../lib/api';
  import KeoTha from '../lib/KeoTha.svelte';
  import { thongBaoLoi } from '../lib/phien.svelte';

  type Loai = 'chuyen-muc' | 'tinh' | 'trang' | 'bai' | 'link';
  interface Con { nhan: string; loai: Loai; giaTri: string }
  interface Muc extends Con { con?: Con[]; _id: string }
  const NHAN_LOAI: Record<Loai, string> = { 'chuyen-muc': 'Chuyên mục', tinh: 'Tỉnh', trang: 'Trang tĩnh', bai: 'Bài viết (slug)', link: 'Link' };
  let menu = $state<{ dauTrang: Muc[]; chanTrang: Muc[] }>({ dauTrang: [], chanTrang: [] });
  let chuyenMuc = $state<{ slug: string; ten: string }[]>([]);
  let tinh = $state<{ slug: string; ten: string }[]>([]);
  let trang = $state<{ slug: string; tieuDe: string }[]>([]);
  let loi = $state('');
  let ok = $state('');
  let dem = 0;
  const id = () => `m${++dem}`;
  const them = (): Muc => ({ _id: id(), nhan: '', loai: 'link', giaTri: '/' });

  onMount(() =>
    void (async () => {
      try {
        const [m, c, t, tr] = await Promise.all([
          goiApi<{ dauTrang: Muc[]; chanTrang: Muc[] }>('GET', '/menu'),
          goiApi<{ chuyenMuc: typeof chuyenMuc }>('GET', '/chuyen-muc'),
          goiApi<{ tinh: typeof tinh }>('GET', '/tinh'),
          goiApi<{ trang: typeof trang }>('GET', '/trang'),
        ]);
        menu = { dauTrang: m.dauTrang.map((x) => ({ ...x, _id: id() })), chanTrang: m.chanTrang.map((x) => ({ ...x, _id: id() })) };
        chuyenMuc = c.chuyenMuc;
        tinh = t.tinh;
        trang = tr.trang.map((x) => ({ slug: x.slug, tieuDe: (x as unknown as { tieuDe: string }).tieuDe }));
      } catch (e) {
        loi = thongBaoLoi(e);
      }
    })(),
  );

  const sach = (ds: Muc[]) =>
    ds.map(({ _id, con, ...m }) => ({ ...m, ...(con && con.length ? { con: con.map((c) => ({ nhan: c.nhan, loai: c.loai, giaTri: c.giaTri })) } : {}) }));
  async function luu() {
    loi = '';
    ok = '';
    try {
      await goiApi('PUT', '/menu', { dauTrang: sach(menu.dauTrang), chanTrang: sach(menu.chanTrang) });
      ok = 'Đã lưu menu. Mục trỏ tới trang chưa đăng sẽ tự ẩn trên site.';
    } catch (e) {
      loi = e instanceof LoiApi && Array.isArray(e.du.chiTiet) ? `${e.loi}: ${(e.du.chiTiet as string[]).join('; ')}` : thongBaoLoi(e);
    }
  }
  const sapXep = (k: 'dauTrang' | 'chanTrang', ids: string[]) => (menu[k] = ids.map((i) => menu[k].find((m) => m._id === i)!));
  const options = (loai: Loai) => (loai === 'chuyen-muc' ? chuyenMuc.map((c) => ({ v: c.slug, t: c.ten })) : loai === 'tinh' ? tinh.map((c) => ({ v: c.slug, t: c.ten })) : loai === 'trang' ? trang.map((c) => ({ v: c.slug, t: c.tieuDe })) : []);
</script>

<h1>Menu</h1>
{#if loi}<p class="thong-bao-loi" role="alert">{loi}</p>{/if}
{#if ok}<p class="thong-bao-ok" role="status">{ok}</p>{/if}

{#snippet bang(k: 'dauTrang' | 'chanTrang', tieuDe: string)}
  <section class="the">
    <h2>{tieuDe}</h2>
    <KeoTha muc={menu[k].map((m) => ({ id: m._id, nhan: m.nhan || '(chưa đặt nhãn)' }))} onDoiThuTu={(ids) => sapXep(k, ids)}>
      {#snippet hanhDong(x)}<button type="button" class="nguy" onclick={() => (menu[k] = menu[k].filter((m) => m._id !== x.id))}>Xoá</button>{/snippet}
    </KeoTha>
    {#each menu[k] as m (m._id)}
      <fieldset>
        <legend>{m.nhan || '(mục mới)'}</legend>
        <label for="{m._id}-nhan">Nhãn hiển thị</label><input id="{m._id}-nhan" type="text" bind:value={m.nhan} />
        <label for="{m._id}-loai">Trỏ tới</label>
        <select id="{m._id}-loai" bind:value={m.loai} onchange={() => (m.giaTri = m.loai === 'link' ? '/' : '')}>{#each Object.entries(NHAN_LOAI) as [v, t]}<option value={v}>{t}</option>{/each}</select>
        {#if m.loai === 'bai' || m.loai === 'link'}
          <label for="{m._id}-gt">{m.loai === 'link' ? 'Địa chỉ (https://… hoặc /đường-dẫn)' : 'Slug bài'}</label><input id="{m._id}-gt" type="text" bind:value={m.giaTri} />
        {:else}
          <label for="{m._id}-gt">Chọn</label>
          <select id="{m._id}-gt" bind:value={m.giaTri}><option value="">— chọn —</option>{#each options(m.loai) as o}<option value={o.v}>{o.t}</option>{/each}</select>
        {/if}
        {#each m.con ?? [] as c, i (i)}
          <div class="con">
            <label for="{m._id}-c{i}">Mục con {i + 1}: nhãn</label><input id="{m._id}-c{i}" type="text" bind:value={c.nhan} />
            <select aria-label="Trỏ tới" bind:value={c.loai} onchange={() => (c.giaTri = c.loai === 'link' ? '/' : '')}>{#each Object.entries(NHAN_LOAI) as [v, t]}<option value={v}>{t}</option>{/each}</select>
            {#if c.loai === 'bai' || c.loai === 'link'}<input type="text" aria-label="Giá trị" bind:value={c.giaTri} />
            {:else}<select aria-label="Chọn" bind:value={c.giaTri}><option value="">— chọn —</option>{#each options(c.loai) as o}<option value={o.v}>{o.t}</option>{/each}</select>{/if}
            <button type="button" class="nguy" onclick={() => m.con!.splice(i, 1)}>Xoá mục con</button>
          </div>
        {/each}
        <div class="hang-nut"><button type="button" class="phu" onclick={() => (m.con ??= []).push({ nhan: '', loai: 'link', giaTri: '/' })}>＋ Thêm mục con</button></div>
      </fieldset>
    {/each}
    <div class="hang-nut"><button type="button" class="phu" onclick={() => menu[k].push(them())}>＋ Thêm mục</button></div>
  </section>
{/snippet}

{@render bang('dauTrang', 'Menu đầu trang')}
{@render bang('chanTrang', 'Menu chân trang')}
<div class="hang-nut"><button onclick={luu}>Lưu menu</button></div>

<style>
  fieldset { margin: 12px 0; border: 1px solid var(--vien); border-radius: 8px; }
  .con { margin: 8px 0 8px 12px; padding-left: 12px; border-left: 3px solid var(--vien); display: grid; gap: 6px; }
</style>
