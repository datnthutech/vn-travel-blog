<!-- Gửi email đặt lại mật khẩu. Luôn báo cùng một thông điệp, dù email có tài khoản hay không. -->
<script lang="ts">
  import { goiApi, LoiApi } from '../lib/api';
  import { bamLienKet, GOC } from '../lib/dieu-huong.svelte';

  let email = $state('');
  let loi = $state('');
  let xong = $state('');
  let dangGui = $state(false);

  async function gui(e: SubmitEvent) {
    e.preventDefault();
    loi = '';
    dangGui = true;
    try {
      const r = await goiApi<{ thongBao: string }>('POST', '/quen-mat-khau', { email }, { khongChuyenTrang: true });
      xong = r.thongBao;
    } catch (e) {
      loi = e instanceof LoiApi ? e.loi : 'Có lỗi, hãy thử lại.';
    } finally {
      dangGui = false;
    }
  }
</script>

<div class="dang-nhap">
  <h1>Quên mật khẩu</h1>
  {#if xong}
    <p class="thong-bao-ok" role="status">{xong}</p>
  {:else}
    <form class="the" onsubmit={gui}>
      <label for="email">Email tài khoản</label>
      <input id="email" type="email" autocomplete="username" required bind:value={email} />
      {#if loi}<p class="thong-bao-loi" role="alert">{loi}</p>{/if}
      <div class="hang-nut"><button type="submit" disabled={dangGui}>Gửi hướng dẫn</button></div>
    </form>
  {/if}
  <p><a href="{GOC}/dang-nhap" onclick={bamLienKet}>Quay lại đăng nhập</a></p>
</div>
