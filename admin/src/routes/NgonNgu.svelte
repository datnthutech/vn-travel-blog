<!-- Quản lý ngôn ngữ của site (quản trị): thêm, đổi tên/thứ tự, bật/tắt (tắt không xoá bản dịch). Tiếng Việt là ngôn ngữ gốc, luôn bật. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { goiApi } from '../lib/api';
  import { bamLienKet, GOC } from '../lib/dieu-huong.svelte';
  import { thongBaoLoi } from '../lib/phien.svelte';

  interface N { ma: string; ten: string; bat: boolean; thuTu: number }
  let ds = $state<N[]>([]);
  let ma = $state('');
  let ten = $state('');
  let loi = $state('');
  let ok = $state('');

  async function tai() {
    try {
      ds = (await goiApi<{ ngonNgu: N[] }>('GET', '/ngon-ngu')).ngonNgu;
    } catch (e) {
      loi = thongBaoLoi(e);
    }
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
  const them = (e: SubmitEvent) => {
    e.preventDefault();
    return lam(async () => { await goiApi('POST', '/ngon-ngu', { ma: ma.trim(), ten: ten.trim() }); ma = ''; ten = ''; }, 'Đã thêm ngôn ngữ. Site sẽ có trang /mã/… khi có bản dịch đã đăng.');
  };
  const bat = (n: N, v: boolean) => lam(() => goiApi('PUT', `/ngon-ngu/${n.ma}`, { bat: v }), v ? 'Đã bật.' : 'Đã tắt — bản dịch được giữ nguyên nhưng không hiện trên site.');
  const luuTen = (n: N, v: string) => lam(() => goiApi('PUT', `/ngon-ngu/${n.ma}`, { ten: v }), 'Đã đổi tên.');
  const doiThuTu = (n: N, d: number) => lam(() => goiApi('PUT', `/ngon-ngu/${n.ma}`, { thuTu: n.thuTu + d }), 'Đã đổi thứ tự.');
  onMount(() => void tai());
</script>

<h1>Ngôn ngữ</h1>
{#if loi}<p class="thong-bao-loi" role="alert">{loi}</p>{/if}
{#if ok}<p class="thong-bao-ok" role="status">{ok}</p>{/if}
<p class="nhat">Mã ngôn ngữ (vd <code>en</code>, <code>zh-cn</code>) không được trùng slug tỉnh hay trang tĩnh vì nó chiếm đường dẫn <code>/mã/…</code>. Dịch chuyên mục, tỉnh, menu, trang, chuỗi giao diện ở <a href="{GOC}/dich-cau-truc" onclick={bamLienKet}>Bản dịch cấu trúc</a> và <a href="{GOC}/chuoi-giao-dien" onclick={bamLienKet}>Chuỗi giao diện</a>.</p>
<section class="the">
  <ul class="danh-sach">
    {#each ds as n (n.ma)}
      <li>
        <strong>{n.ma}</strong> — <input type="text" value={n.ten} aria-label="Tên ngôn ngữ {n.ma}" maxlength="60" onchange={(e) => luuTen(n, e.currentTarget.value)} />
        {#if n.ma === 'vi'}<span class="nhat">ngôn ngữ gốc, luôn bật</span>
        {:else}
          <div class="hang-nut">
            <label class="hang-chon"><input type="checkbox" checked={n.bat} onchange={(e) => bat(n, e.currentTarget.checked)} /> Đang bật</label>
            <button class="phu" onclick={() => doiThuTu(n, -1)} aria-label="Đưa {n.ma} lên">↑</button>
            <button class="phu" onclick={() => doiThuTu(n, 1)} aria-label="Đưa {n.ma} xuống">↓</button>
          </div>
        {/if}
      </li>
    {/each}
  </ul>
</section>
<form class="the" onsubmit={them}>
  <h2>Thêm ngôn ngữ</h2>
  <label for="nn-ma">Mã (2 chữ cái thường, vd en)</label><input id="nn-ma" type="text" bind:value={ma} maxlength="5" required pattern="[a-z]{'{2}'}(-[a-z]{'{2}'})?" />
  <label for="nn-ten">Tên hiển thị (vd English)</label><input id="nn-ten" type="text" bind:value={ten} maxlength="60" required />
  <div class="hang-nut"><button type="submit">Thêm</button></div>
</form>
