<!-- Nhận lời mời từ email: đặt tên + mật khẩu, tạo tài khoản và đăng nhập luôn (quản trị sẽ được dẫn sang bật 2FA). -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { goiApi, LoiApi } from '../lib/api';
  import { dieuHuong, di, GOC } from '../lib/dieu-huong.svelte';
  import { taiPhien } from '../lib/phien.svelte';

  const token = new URLSearchParams(dieuHuong.tim).get('token') ?? '';
  const TEN_VAI_TRO: Record<string, string> = { 'quan-tri': 'Quản trị', 'quan-ly': 'Quản lý', writer: 'Người viết' };
  let moi = $state<{ email: string; vaiTro: string } | null>(null);
  let hetHan = $state(false);
  let ten = $state('');
  let mk = $state('');
  let nhapLai = $state('');
  let loi = $state('');
  let dang = $state(false);

  onMount(() => void goiApi<{ email: string; vaiTro: string }>('GET', `/loi-moi/${encodeURIComponent(token)}`, undefined, { khongChuyenTrang: true }).then((r) => (moi = r)).catch(() => (hetHan = true)));

  async function gui(e: SubmitEvent) {
    e.preventDefault();
    loi = '';
    if (mk !== nhapLai) return void (loi = 'Hai lần nhập mật khẩu chưa giống nhau.');
    dang = true;
    try {
      const r = await goiApi<{ canBatTotp: boolean }>('POST', `/loi-moi/${encodeURIComponent(token)}/nhan`, { ten, matKhau: mk }, { khongChuyenTrang: true });
      await taiPhien();
      di(r.canBatTotp ? `${GOC}/bat-totp` : GOC);
    } catch (e) {
      loi = e instanceof LoiApi ? e.loi : 'Có lỗi, hãy thử lại.';
      if (e instanceof LoiApi && e.status === 410) hetHan = true;
    } finally {
      dang = false;
    }
  }
</script>

<div class="dang-nhap">
  <h1>Nhận lời mời</h1>
  {#if hetHan}
    <p class="thong-bao-loi" role="alert">Lời mời không hợp lệ, đã dùng hoặc đã hết hạn (48 giờ). Hãy nhờ quản trị gửi lại lời mời.</p>
  {:else if !moi}
    <p class="nhat">Đang kiểm tra lời mời…</p>
  {:else}
    <form class="the" onsubmit={gui}>
      <p>Bạn được mời tham gia với email <strong>{moi.email}</strong>, vai trò <strong>{TEN_VAI_TRO[moi.vaiTro] ?? moi.vaiTro}</strong>.</p>
      <label for="ten">Tên hiển thị</label><input id="ten" type="text" required maxlength="80" autocomplete="name" bind:value={ten} />
      <label for="mk">Mật khẩu (ít nhất 12 ký tự)</label><input id="mk" type="password" minlength="12" required autocomplete="new-password" bind:value={mk} />
      <label for="mk2">Nhập lại mật khẩu</label><input id="mk2" type="password" minlength="12" required autocomplete="new-password" bind:value={nhapLai} />
      {#if moi.vaiTro === 'quan-tri'}<p class="nhat">Tài khoản quản trị bắt buộc bật xác thực 2 lớp ở bước tiếp theo.</p>{/if}
      {#if loi}<p class="thong-bao-loi" role="alert">{loi}</p>{/if}
      <div class="hang-nut"><button type="submit" disabled={dang}>Tạo tài khoản</button></div>
    </form>
  {/if}
</div>
