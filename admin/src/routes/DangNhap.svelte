<!-- Đăng nhập bằng email + mật khẩu; nếu tài khoản có 2FA thì sang bước nhập mã. -->
<script lang="ts">
  import { goiApi, LoiApi } from '../lib/api';
  import { bamLienKet, di, GOC } from '../lib/dieu-huong.svelte';

  let email = $state('');
  let matKhau = $state('');
  let ghiNho = $state(false);
  let loi = $state('');
  let dangGui = $state(false);

  async function gui(e: SubmitEvent) {
    e.preventDefault();
    loi = '';
    dangGui = true;
    try {
      const r = await goiApi<{ canTotp: boolean }>('POST', '/dang-nhap', { email, matKhau, ghiNho }, { khongChuyenTrang: true });
      matKhau = '';
      di(r.canTotp ? `${GOC}/totp` : GOC);
    } catch (e) {
      if (e instanceof LoiApi && e.status === 429) {
        const phut = Math.ceil(Number(e.du.conLaiGiay ?? 0) / 60);
        loi = `Bạn đã đăng nhập sai quá nhiều lần. Hãy thử lại sau khoảng ${phut} phút.`;
      } else loi = e instanceof LoiApi ? e.loi : 'Không đăng nhập được. Hãy thử lại.';
    } finally {
      dangGui = false;
    }
  }
</script>

<div class="dang-nhap">
  <h1>Đăng nhập quản trị</h1>
  <form class="the" onsubmit={gui}>
    <label for="email">Email</label>
    <input id="email" type="email" autocomplete="username" required bind:value={email} />
    <label for="mk">Mật khẩu</label>
    <input id="mk" type="password" autocomplete="current-password" required bind:value={matKhau} />
    <label class="hang-chon"><input type="checkbox" bind:checked={ghiNho} /> Ghi nhớ trên thiết bị này (30 ngày)</label>
    {#if loi}<p class="thong-bao-loi" role="alert">{loi}</p>{/if}
    <div class="hang-nut"><button type="submit" disabled={dangGui}>{dangGui ? 'Đang đăng nhập…' : 'Đăng nhập'}</button></div>
  </form>
  <p><a href="{GOC}/quen-mat-khau" onclick={bamLienKet}>Quên mật khẩu?</a></p>
</div>
