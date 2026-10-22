<!-- Bước 2 khi đăng nhập: nhập mã 6 số từ ứng dụng xác thực, hoặc một mã dự phòng. -->
<script lang="ts">
  import { goiApi, LoiApi } from '../lib/api';
  import { di, GOC } from '../lib/dieu-huong.svelte';

  let ma = $state('');
  let loi = $state('');
  let dangGui = $state(false);

  async function gui(e: SubmitEvent) {
    e.preventDefault();
    loi = '';
    dangGui = true;
    try {
      await goiApi('POST', '/dang-nhap/totp', { ma }, { khongChuyenTrang: true });
      di(GOC);
    } catch (e) {
      loi = e instanceof LoiApi && e.status === 429 ? `Nhập sai quá nhiều lần. Hãy thử lại sau khoảng ${Math.ceil(Number(e.du.conLaiGiay ?? 0) / 60)} phút.` : e instanceof LoiApi ? e.loi : 'Có lỗi, hãy thử lại.';
    } finally {
      dangGui = false;
    }
  }
</script>

<div class="dang-nhap">
  <h1>Xác thực 2 lớp</h1>
  <form class="the" onsubmit={gui}>
    <label for="ma">Mã 6 số trong ứng dụng xác thực (hoặc mã dự phòng)</label>
    <input id="ma" type="text" inputmode="text" autocomplete="one-time-code" required bind:value={ma} />
    {#if loi}<p class="thong-bao-loi" role="alert">{loi}</p>{/if}
    <div class="hang-nut"><button type="submit" disabled={dangGui}>Xác nhận</button></div>
  </form>
</div>
