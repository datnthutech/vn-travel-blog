<!-- Đặt mật khẩu mới từ liên kết trong email (token nằm ở ?token=…). -->
<script lang="ts">
  import { goiApi, LoiApi } from '../lib/api';
  import { bamLienKet, dieuHuong, GOC } from '../lib/dieu-huong.svelte';

  const token = new URLSearchParams(dieuHuong.tim).get('token') ?? '';
  let mk = $state('');
  let nhapLai = $state('');
  let loi = $state('');
  let xong = $state(false);
  let dangGui = $state(false);

  async function gui(e: SubmitEvent) {
    e.preventDefault();
    loi = '';
    if (mk !== nhapLai) {
      loi = 'Hai lần nhập mật khẩu chưa giống nhau.';
      return;
    }
    dangGui = true;
    try {
      await goiApi('POST', '/dat-lai-mat-khau', { token, matKhauMoi: mk }, { khongChuyenTrang: true });
      xong = true;
    } catch (e) {
      loi = e instanceof LoiApi ? e.loi : 'Có lỗi, hãy thử lại.';
    } finally {
      dangGui = false;
    }
  }
</script>

<div class="dang-nhap">
  <h1>Đặt lại mật khẩu</h1>
  {#if xong}
    <p class="thong-bao-ok" role="status">Đã đặt lại mật khẩu. Mọi thiết bị đã được đăng xuất.</p>
    <p><a href="{GOC}/dang-nhap" onclick={bamLienKet}>Đăng nhập</a></p>
  {:else if !token}
    <p class="thong-bao-loi">Liên kết không đúng. Hãy yêu cầu gửi lại email.</p>
    <p><a href="{GOC}/quen-mat-khau" onclick={bamLienKet}>Yêu cầu lại</a></p>
  {:else}
    <form class="the" onsubmit={gui}>
      <label for="mk">Mật khẩu mới (ít nhất 12 ký tự)</label>
      <input id="mk" type="password" autocomplete="new-password" minlength="12" required bind:value={mk} />
      <label for="mk2">Nhập lại mật khẩu mới</label>
      <input id="mk2" type="password" autocomplete="new-password" minlength="12" required bind:value={nhapLai} />
      {#if loi}<p class="thong-bao-loi" role="alert">{loi}</p>{/if}
      <div class="hang-nut"><button type="submit" disabled={dangGui}>Đổi mật khẩu</button></div>
    </form>
  {/if}
</div>
