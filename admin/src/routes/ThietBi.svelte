<!-- Tài khoản & thiết bị: danh sách phiên đăng nhập, đăng xuất từng thiết bị / mọi nơi, đổi mật khẩu, 2FA. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { goiApi } from '../lib/api';
  import { bamLienKet, GOC } from '../lib/dieu-huong.svelte';
  import { phien, taiPhien, thongBaoLoi } from '../lib/phien.svelte';

  interface Phien { id: number; ip: string | null; thietBi: string | null; taoLuc: number; dungCuoiLuc: number; ghiNho: boolean; hienTai: boolean }

  let ds = $state<Phien[]>([]);
  let loi = $state('');
  let ok = $state('');
  let mkCu = $state('');
  let mkMoi = $state('');
  let tat = $state({ matKhau: '', ma: '' });

  const gio = (ms: number) => new Date(ms).toLocaleString('vi-VN');
  async function tai() {
    ds = (await goiApi<{ phien: Phien[] }>('GET', '/phien')).phien;
  }
  async function lam(viec: () => Promise<unknown>, thanhCong: string) {
    loi = '';
    ok = '';
    try {
      await viec();
      ok = thanhCong;
    } catch (e) {
      loi = thongBaoLoi(e);
    }
  }
  onMount(() => void tai().catch((e) => (loi = thongBaoLoi(e))));

  const xoaThietBi = (id: number) => lam(async () => { await goiApi('DELETE', `/phien/${id}`); await tai(); }, 'Đã đăng xuất thiết bị đó.');
  const xoaMoiNoi = () => lam(async () => { await goiApi('POST', '/dang-xuat-moi-noi'); await tai(); }, 'Đã đăng xuất mọi thiết bị khác.');
  const doiMk = (e: SubmitEvent) => {
    e.preventDefault();
    return lam(async () => { await goiApi('POST', '/doi-mat-khau', { matKhauCu: mkCu, matKhauMoi: mkMoi }); mkCu = ''; mkMoi = ''; await tai(); }, 'Đã đổi mật khẩu; các thiết bị khác đã bị đăng xuất.');
  };
  const tatHaiLop = (e: SubmitEvent) => {
    e.preventDefault();
    return lam(async () => { await goiApi('POST', '/2fa/tat', tat); tat = { matKhau: '', ma: '' }; await taiPhien(); }, 'Đã tắt xác thực 2 lớp.');
  };
</script>

<h1>Tài khoản & thiết bị</h1>
{#if loi}<p class="thong-bao-loi" role="alert">{loi}</p>{/if}
{#if ok}<p class="thong-bao-ok" role="status">{ok}</p>{/if}

<section class="the">
  <h2>Thiết bị đang đăng nhập</h2>
  <ul class="danh-sach">
    {#each ds as p (p.id)}
      <li>
        <strong>{p.hienTai ? 'Thiết bị này' : 'Thiết bị khác'}</strong>{p.ghiNho ? ' · ghi nhớ 30 ngày' : ''}<br />
        <span class="nhat">{p.thietBi || 'Không rõ trình duyệt'} · IP {p.ip ?? '?'}<br />Đăng nhập {gio(p.taoLuc)} · dùng lần cuối {gio(p.dungCuoiLuc)}</span>
        {#if !p.hienTai}<div class="hang-nut"><button class="nguy" onclick={() => xoaThietBi(p.id)}>Đăng xuất thiết bị này</button></div>{/if}
      </li>
    {/each}
  </ul>
  <div class="hang-nut"><button class="phu" onclick={xoaMoiNoi}>Đăng xuất mọi thiết bị khác</button></div>
</section>

<section class="the">
  <h2>Đổi mật khẩu</h2>
  <form onsubmit={doiMk}>
    <label for="mk-cu">Mật khẩu hiện tại</label>
    <input id="mk-cu" type="password" autocomplete="current-password" required bind:value={mkCu} />
    <label for="mk-moi">Mật khẩu mới (ít nhất 12 ký tự)</label>
    <input id="mk-moi" type="password" autocomplete="new-password" minlength="12" required bind:value={mkMoi} />
    <div class="hang-nut"><button type="submit">Đổi mật khẩu</button></div>
  </form>
</section>

<section class="the">
  <h2>Xác thực 2 lớp</h2>
  {#if !phien.nguoiDung?.coTotp}
    <p>Chưa bật.</p>
    <p><a class="nut" href="{GOC}/bat-totp" onclick={bamLienKet}>Bật xác thực 2 lớp</a></p>
  {:else if phien.nguoiDung.vaiTro === 'quan-tri'}
    <p>Đã bật. Tài khoản quản trị bắt buộc dùng xác thực 2 lớp nên không tắt được.</p>
  {:else}
    <p>Đã bật. Để tắt, nhập mật khẩu và một mã xác thực.</p>
    <form onsubmit={tatHaiLop}>
      <label for="t-mk">Mật khẩu</label>
      <input id="t-mk" type="password" autocomplete="current-password" required bind:value={tat.matKhau} />
      <label for="t-ma">Mã xác thực</label>
      <input id="t-ma" type="text" inputmode="numeric" autocomplete="one-time-code" required bind:value={tat.ma} />
      <div class="hang-nut"><button class="nguy" type="submit">Tắt xác thực 2 lớp</button></div>
    </form>
  {/if}
</section>
