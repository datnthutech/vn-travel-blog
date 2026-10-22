<!-- Chuyên mục: thêm, sửa, đổi slug (hệ thống tự 301), xoá (chuyển bài sang chuyên mục khác), kéo thả đổi thứ tự. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { goiApi, LoiApi } from '../lib/api';
  import KeoTha from '../lib/KeoTha.svelte';
  import { thongBaoLoi } from '../lib/phien.svelte';

  interface Cm { slug: string; ten: string; moTa: string; soBai: number }
  let ds = $state<Cm[]>([]);
  let loi = $state('');
  let ok = $state('');
  let sua = $state<(Cm & { slugMoi: string }) | null>(null);
  let them = $state({ ten: '', moTa: '' });
  let xoa = $state<{ cm: Cm; chuyenSang: string } | null>(null);

  async function tai() {
    ds = (await goiApi<{ chuyenMuc: Cm[] }>('GET', '/chuyen-muc')).chuyenMuc;
  }
  async function lam(viec: () => Promise<unknown>, thanhCong: string) {
    loi = '';
    ok = '';
    try {
      await viec();
      ok = thanhCong;
      await tai();
    } catch (e) {
      loi = e instanceof LoiApi && e.status === 409 && e.du.soBai ? e.loi : thongBaoLoi(e);
    }
  }
  const themMoi = (e: SubmitEvent) => {
    e.preventDefault();
    return lam(async () => { await goiApi('POST', '/chuyen-muc', them); them = { ten: '', moTa: '' }; }, 'Đã thêm chuyên mục.');
  };
  const luuSua = (e: SubmitEvent) => {
    e.preventDefault();
    const s = sua!;
    return lam(async () => { await goiApi('PUT', `/chuyen-muc/${s.slug}`, { ten: s.ten, moTa: s.moTa, slug: s.slugMoi }); sua = null; }, s.slugMoi !== s.slug ? 'Đã lưu. Địa chỉ cũ tự chuyển hướng (301) sang địa chỉ mới.' : 'Đã lưu.');
  };
  const xacNhanXoa = () => {
    const x = xoa!;
    return lam(async () => { await goiApi('DELETE', `/chuyen-muc/${x.cm.slug}${x.chuyenSang ? `?chuyenSang=${x.chuyenSang}` : ''}`); xoa = null; }, 'Đã xoá chuyên mục.');
  };
  const doiThuTu = (ids: string[]) => lam(() => goiApi('PUT', '/chuyen-muc/thu-tu', { slugs: ids }), 'Đã đổi thứ tự.');
  onMount(() => void tai().catch((e) => (loi = thongBaoLoi(e))));
</script>

<h1>Chuyên mục</h1>
{#if loi}<p class="thong-bao-loi" role="alert">{loi}</p>{/if}
{#if ok}<p class="thong-bao-ok" role="status">{ok}</p>{/if}

<section class="the">
  <KeoTha muc={ds.map((c) => ({ id: c.slug, nhan: `${c.ten} (${c.soBai} bài)` }))} onDoiThuTu={doiThuTu}>
    {#snippet hanhDong(m)}
      {@const c = ds.find((x) => x.slug === m.id)!}
      <button type="button" class="phu" onclick={() => (sua = { ...c, slugMoi: c.slug })}>Sửa</button>
      <button type="button" class="nguy" onclick={() => (xoa = { cm: c, chuyenSang: '' })}>Xoá</button>
    {/snippet}
  </KeoTha>
</section>

{#if sua}
  <form class="the" onsubmit={luuSua}>
    <h2>Sửa chuyên mục</h2>
    <label for="cm-ten">Tên</label><input id="cm-ten" type="text" required bind:value={sua.ten} />
    <label for="cm-slug">Địa chỉ (slug)</label><input id="cm-slug" type="text" required bind:value={sua.slugMoi} />
    {#if sua.slugMoi !== sua.slug}<p class="nhat">Đổi slug: các bài tự cập nhật và địa chỉ /chu-de/{sua.slug}/ tự chuyển hướng 301.</p>{/if}
    <label for="cm-mota">Mô tả</label><input id="cm-mota" type="text" bind:value={sua.moTa} />
    <div class="hang-nut"><button type="submit">Lưu</button><button type="button" class="phu" onclick={() => (sua = null)}>Huỷ</button></div>
  </form>
{/if}

{#if xoa}
  <div class="the">
    <h2>Xoá "{xoa.cm.ten}"</h2>
    {#if xoa.cm.soBai > 0}
      <p>Còn {xoa.cm.soBai} bài đang dùng chuyên mục này. Chọn chuyên mục để chuyển các bài sang:</p>
      <select bind:value={xoa.chuyenSang} aria-label="Chuyển bài sang chuyên mục">
        <option value="">— chọn —</option>
        {#each ds.filter((c) => c.slug !== xoa!.cm.slug) as c}<option value={c.slug}>{c.ten}</option>{/each}
      </select>
    {:else}<p>Chuyên mục chưa có bài nào.</p>{/if}
    <div class="hang-nut">
      <button type="button" class="nguy" disabled={xoa.cm.soBai > 0 && !xoa.chuyenSang} onclick={xacNhanXoa}>Xoá chuyên mục</button>
      <button type="button" class="phu" onclick={() => (xoa = null)}>Huỷ</button>
    </div>
  </div>
{/if}

<form class="the" onsubmit={themMoi}>
  <h2>Thêm chuyên mục</h2>
  <label for="cm-moi-ten">Tên</label><input id="cm-moi-ten" type="text" required bind:value={them.ten} />
  <label for="cm-moi-mota">Mô tả (hiện ở đầu trang chuyên mục)</label><input id="cm-moi-mota" type="text" bind:value={them.moTa} />
  <div class="hang-nut"><button type="submit">Thêm</button></div>
</form>
