<!-- Bật xác thực 2 lớp: quét mã QR (hoặc nhập khoá), xác nhận bằng mã 6 số, lưu mã dự phòng (chỉ hiện một lần). -->
<script lang="ts">
  import QRCode from 'qrcode';
  import { goiApi, LoiApi } from '../lib/api';
  import { di, GOC } from '../lib/dieu-huong.svelte';
  import { phien, taiPhien } from '../lib/phien.svelte';

  let buoc = $state<'dau' | 'quet' | 'ma-du-phong'>('dau');
  let qr = $state('');
  let khoa = $state('');
  let ma = $state('');
  let maDuPhong = $state<string[]>([]);
  let loi = $state('');
  let dang = $state(false);

  async function batDau() {
    loi = '';
    dang = true;
    try {
      const r = await goiApi<{ otpauthUrl: string }>('POST', '/2fa/bat-dau');
      khoa = /secret=([A-Z2-7]+)/.exec(r.otpauthUrl)?.[1] ?? '';
      qr = await QRCode.toDataURL(r.otpauthUrl, { margin: 1, width: 240 });
      buoc = 'quet';
    } catch (e) {
      loi = e instanceof LoiApi ? e.loi : 'Có lỗi, hãy thử lại.';
    } finally {
      dang = false;
    }
  }

  async function xacNhan(e: SubmitEvent) {
    e.preventDefault();
    loi = '';
    dang = true;
    try {
      const r = await goiApi<{ maDuPhong: string[] }>('POST', '/2fa/xac-nhan', { ma });
      maDuPhong = r.maDuPhong;
      buoc = 'ma-du-phong';
    } catch (e) {
      loi = e instanceof LoiApi ? e.loi : 'Có lỗi, hãy thử lại.';
    } finally {
      dang = false;
    }
  }

  async function xong() {
    await taiPhien();
    di(GOC);
  }
</script>

<h1>Bật xác thực 2 lớp</h1>
{#if phien.nguoiDung?.vaiTro === 'quan-tri' && buoc !== 'ma-du-phong'}
  <p class="thong-bao-loi">Tài khoản quản trị bắt buộc bật xác thực 2 lớp trước khi dùng các chức năng khác.</p>
{/if}

{#if buoc === 'dau'}
  <div class="the">
    <p>Bạn cần một ứng dụng xác thực trên điện thoại (Google Authenticator, Microsoft Authenticator, Authy…).</p>
    {#if loi}<p class="thong-bao-loi" role="alert">{loi}</p>{/if}
    <div class="hang-nut"><button onclick={batDau} disabled={dang}>Bắt đầu</button></div>
  </div>
{:else if buoc === 'quet'}
  <form class="the" onsubmit={xacNhan}>
    <p>1. Mở ứng dụng xác thực, chọn thêm tài khoản và quét mã QR này:</p>
    <img class="qr" src={qr} alt="Mã QR để thêm tài khoản vào ứng dụng xác thực" />
    <p class="nhat">Không quét được? Nhập khoá thủ công: <code>{khoa}</code></p>
    <label for="ma">2. Nhập mã 6 số ứng dụng đang hiện</label>
    <input id="ma" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]*" maxlength="6" required bind:value={ma} />
    {#if loi}<p class="thong-bao-loi" role="alert">{loi}</p>{/if}
    <div class="hang-nut"><button type="submit" disabled={dang}>Xác nhận và bật</button></div>
  </form>
{:else}
  <div class="the">
    <p class="thong-bao-ok" role="status">Đã bật xác thực 2 lớp.</p>
    <h2>Mã dự phòng</h2>
    <p>Lưu 10 mã này ở nơi an toàn (mỗi mã dùng được <strong>một lần</strong> khi mất điện thoại). Mã sẽ <strong>không hiện lại</strong>.</p>
    <ul class="ma-du-phong">{#each maDuPhong as m}<li>{m}</li>{/each}</ul>
    <div class="hang-nut"><button onclick={xong}>Tôi đã lưu mã dự phòng</button></div>
  </div>
{/if}
