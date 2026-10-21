<!-- Tỉnh (trang điểm đến): thêm, sửa, đổi slug (301 cho hub + mọi bài đã đăng), xoá (chuyển bài sang tỉnh khác hoặc bỏ tỉnh). -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { goiApi, LoiApi } from '../lib/api';
  import AnhBia from '../lib/form/AnhBia.svelte';
  import type { AnhRef } from '../lib/kieu';
  import { phien, thongBaoLoi } from '../lib/phien.svelte';

  interface T { slug: string; ten: string; gioiThieu: string; moTa: string; anhBia: AnhRef; soBai: number }
  const trong = (): T & { slugMoi: string } => ({ slug: '', slugMoi: '', ten: '', gioiThieu: '', moTa: '', anhBia: { ma: '', alt: '' }, soBai: 0 });
  let ds = $state<T[]>([]);
  let form = $state<(T & { slugMoi: string }) | null>(null);
  let moi = $state(false);
  let xoa = $state<{ t: T; chuyenSang: string | null } | null>(null);
  let loi = $state('');
  let ok = $state('');
  let anhBaseUrl = $derived(phien.publicBaseUrl || location.origin);

  async function tai() {
    ds = (await goiApi<{ tinh: T[] }>('GET', '/tinh')).tinh;
  }
  async function lam(viec: () => Promise<unknown>, thanhCong: string) {
    loi = '';
    ok = '';
    try {
      await viec();
      ok = thanhCong;
      await tai();
    } catch (e) {
      loi = e instanceof LoiApi && Array.isArray(e.du.chiTiet) ? `${e.loi}: ${(e.du.chiTiet as string[]).join('; ')}` : thongBaoLoi(e);
    }
  }
  function luu(e: SubmitEvent) {
    e.preventDefault();
    const f = form!;
    const body = { ten: f.ten, gioiThieu: f.gioiThieu, moTa: f.moTa, anhBia: f.anhBia, slug: f.slugMoi || undefined };
    return lam(async () => {
      if (moi) await goiApi('POST', '/tinh', body);
      else await goiApi('PUT', `/tinh/${f.slug}`, body);
      form = null;
    }, !moi && f.slugMoi !== f.slug ? 'Đã lưu. Trang tỉnh và mọi bài đã đăng của tỉnh tự chuyển hướng (301) sang địa chỉ mới.' : 'Đã lưu.');
  }
  const xacNhanXoa = () => {
    const x = xoa!;
    return lam(async () => { await goiApi('DELETE', `/tinh/${x.t.slug}${x.chuyenSang === null ? '' : `?chuyenSang=${x.chuyenSang}`}`); xoa = null; }, 'Đã xoá tỉnh.');
  };
  onMount(() => void tai().catch((e) => (loi = thongBaoLoi(e))));
</script>

<h1>Tỉnh / điểm đến</h1>
{#if loi}<p class="thong-bao-loi" role="alert">{loi}</p>{/if}
{#if ok}<p class="thong-bao-ok" role="status">{ok}</p>{/if}

<section class="the">
  {#if ds.length === 0}<p class="nhat">Chưa có tỉnh nào.</p>{/if}
  <ul class="danh-sach">
    {#each ds as t (t.slug)}
      <li>
        <strong>{t.ten}</strong> <span class="nhat">/{t.slug}/ · {t.soBai} bài</span>
        <div class="hang-nut">
          <button class="phu" onclick={() => { moi = false; form = { ...t, slugMoi: t.slug }; }}>Sửa</button>
          <button class="nguy" onclick={() => (xoa = { t, chuyenSang: t.soBai > 0 ? null : '' })}>Xoá</button>
        </div>
      </li>
    {/each}
  </ul>
  <div class="hang-nut"><button onclick={() => { moi = true; form = trong(); }}>＋ Thêm tỉnh</button></div>
</section>

{#if form}
  <form class="the" onsubmit={luu}>
    <h2>{moi ? 'Thêm tỉnh' : 'Sửa tỉnh'}</h2>
    <label for="t-ten">Tên</label><input id="t-ten" type="text" required bind:value={form.ten} />
    <label for="t-slug">Địa chỉ (slug){moi ? ' — để trống để tự sinh từ tên' : ''}</label><input id="t-slug" type="text" bind:value={form.slugMoi} />
    {#if !moi && form.slugMoi !== form.slug}<p class="thong-bao-loi">Đổi slug: /{form.slug}/ và mọi bài đã đăng của tỉnh sẽ tự chuyển hướng 301 sang địa chỉ mới.</p>{/if}
    <label for="t-gt">Giới thiệu</label><input id="t-gt" type="text" required bind:value={form.gioiThieu} />
    <label for="t-mt">Mô tả (SEO)</label><input id="t-mt" type="text" required bind:value={form.moTa} />
    <AnhBia bind:anh={form.anhBia} {anhBaseUrl} />
    <div class="hang-nut"><button type="submit">Lưu</button><button type="button" class="phu" onclick={() => (form = null)}>Huỷ</button></div>
  </form>
{/if}

{#if xoa}
  <div class="the">
    <h2>Xoá "{xoa.t.ten}"</h2>
    {#if xoa.t.soBai > 0}
      <p>Còn {xoa.t.soBai} bài thuộc tỉnh này. Chuyển sang:</p>
      <select aria-label="Chuyển bài sang" onchange={(e) => (xoa!.chuyenSang = e.currentTarget.value === '__khong__' ? '' : e.currentTarget.value === '' ? null : e.currentTarget.value)}>
        <option value="">— chọn —</option>
        <option value="__khong__">Bỏ tỉnh (bài thành "kinh nghiệm chung", tự chuyển hướng)</option>
        {#each ds.filter((x) => x.slug !== xoa!.t.slug) as x}<option value={x.slug}>{x.ten}</option>{/each}
      </select>
    {/if}
    <div class="hang-nut">
      <button type="button" class="nguy" disabled={xoa.chuyenSang === null} onclick={xacNhanXoa}>Xoá tỉnh</button>
      <button type="button" class="phu" onclick={() => (xoa = null)}>Huỷ</button>
    </div>
  </div>
{/if}
