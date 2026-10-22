<!-- Chuyển hướng 301: danh sách (tự động + thủ công), thêm thủ công, xoá. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { goiApi } from '../lib/api';
  import { thongBaoLoi } from '../lib/phien.svelte';

  interface R { tu: string; den: string; tuDong: boolean }
  let ds = $state<R[]>([]);
  let tu = $state('');
  let den = $state('');
  let loi = $state('');
  let ok = $state('');

  const tai = async () => (ds = await goiApi<R[]>('GET', '/redirect'));
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
  const them = (e: SubmitEvent) => {
    e.preventDefault();
    return lam(async () => { await goiApi('POST', '/redirect', { tu, den }); tu = ''; den = ''; }, 'Đã thêm chuyển hướng.');
  };
  const xoa = (r: R) => confirm(`Xoá chuyển hướng ${r.tu} → ${r.den}? Ai còn giữ liên kết cũ sẽ gặp lỗi 404.`) && lam(() => goiApi('DELETE', `/redirect?tu=${encodeURIComponent(r.tu)}`), 'Đã xoá.');
  onMount(() => void tai().catch((e) => (loi = thongBaoLoi(e))));
</script>

<h1>Chuyển hướng (301)</h1>
<p class="nhat">Hệ thống tự thêm khi bạn đổi slug/tỉnh của bài hoặc trang. Bạn cũng có thể thêm thủ công — đích phải là trang đang đăng.</p>
{#if loi}<p class="thong-bao-loi" role="alert">{loi}</p>{/if}
{#if ok}<p class="thong-bao-ok" role="status">{ok}</p>{/if}

<form class="the" onsubmit={them}>
  <h2>Thêm chuyển hướng</h2>
  <label for="rd-tu">Từ (đường dẫn cũ, vd /bai-cu/)</label><input id="rd-tu" type="text" required bind:value={tu} />
  <label for="rd-den">Đến (đường dẫn của trang đang đăng, vd /kinh-nghiem/bai-moi/)</label><input id="rd-den" type="text" required bind:value={den} />
  <div class="hang-nut"><button type="submit">Thêm</button></div>
</form>

<section class="the">
  {#if ds.length === 0}<p class="nhat">Chưa có chuyển hướng nào.</p>{/if}
  <ul class="danh-sach">
    {#each ds as r (r.tu)}
      <li>{r.tu} → {r.den} <span class="nhat">· {r.tuDong ? 'tự động' : 'thủ công'}</span>
        <div class="hang-nut"><button class="nguy" onclick={() => xoa(r)}>Xoá</button></div></li>
    {/each}
  </ul>
</section>
