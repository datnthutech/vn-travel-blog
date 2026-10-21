<!-- Khung ứng dụng: thanh điều hướng + chọn trang theo đường dẫn + chặn trang cần đăng nhập. -->
<script lang="ts">
  import { goiApi } from './lib/api';
  import { bamLienKet, dieuHuong, di, GOC } from './lib/dieu-huong.svelte';
  import { phien, taiPhien } from './lib/phien.svelte';
  import BatTotp from './routes/BatTotp.svelte';
  import DangNhap from './routes/DangNhap.svelte';
  import DatLai from './routes/DatLai.svelte';
  import Mail from './routes/Mail.svelte';
  import SoanBai from './routes/SoanBai.svelte';
  import QuenMatKhau from './routes/QuenMatKhau.svelte';
  import ThietBi from './routes/ThietBi.svelte';
  import TongQuan from './routes/TongQuan.svelte';
  import Totp from './routes/Totp.svelte';

  const CONG_KHAI = [`${GOC}/dang-nhap`, `${GOC}/quen-mat-khau`, `${GOC}/dat-lai`];
  const MUC = [
    { duong: GOC, ten: 'Tổng quan' },
    { duong: `${GOC}/thiet-bi`, ten: 'Tài khoản & thiết bị' },
    { duong: `${GOC}/mail`, ten: 'Cài đặt mail' },
  ];

  // Mỗi lần đổi trang: kiểm tra phiên rồi điều hướng nếu chưa đủ điều kiện vào trang đó.
  $effect(() => {
    const duong = dieuHuong.duong;
    void (async () => {
      await taiPhien();
      const congKhai = CONG_KHAI.includes(duong);
      if (phien.choTotp) {
        if (duong !== `${GOC}/totp`) di(`${GOC}/totp`, true);
      } else if (!phien.nguoiDung) {
        if (!congKhai) di(`${GOC}/dang-nhap`, true);
      } else if (phien.nguoiDung.vaiTro === 'quan-tri' && !phien.nguoiDung.coTotp) {
        if (duong !== `${GOC}/bat-totp`) di(`${GOC}/bat-totp`, true); // quản trị bắt buộc bật 2FA
      } else if (congKhai || duong === `${GOC}/totp`) {
        di(GOC, true);
      }
    })();
  });

  async function dangXuat() {
    try {
      await goiApi('POST', '/dang-xuat');
    } finally {
      phien.nguoiDung = null;
      di(`${GOC}/dang-nhap`);
    }
  }
</script>

{#if phien.nguoiDung && !phien.choTotp}
  <header class="thanh">
    <nav class="thanh-trong" aria-label="Điều hướng quản trị">
      <span class="nhan-hieu">VNTravelTips</span>
      {#each MUC as m}
        <a href={m.duong} class:dang-o={dieuHuong.duong === m.duong} onclick={bamLienKet}>{m.ten}</a>
      {/each}
      <button class="lien-ket" onclick={dangXuat}>Đăng xuất</button>
    </nav>
  </header>
{/if}

{#if !phien.daTai}
  <p class="khung nhat">Đang tải…</p>
{:else if dieuHuong.duong === `${GOC}/dang-nhap`}
  <DangNhap />
{:else if dieuHuong.duong === `${GOC}/quen-mat-khau`}
  <QuenMatKhau />
{:else if dieuHuong.duong === `${GOC}/dat-lai`}
  <DatLai />
{:else if phien.choTotp || dieuHuong.duong === `${GOC}/totp`}
  <Totp />
{:else if phien.nguoiDung}
  <main class="khung">
    {#if dieuHuong.duong === `${GOC}/bat-totp`}
      <BatTotp />
    {:else if dieuHuong.duong === `${GOC}/bai/moi`}
      {#key 'moi'}<SoanBai idBanDau={null} />{/key}
    {:else if /^\/quan-tri\/bai\/\d+$/.test(dieuHuong.duong)}
      {#key dieuHuong.duong}<SoanBai idBanDau={Number(dieuHuong.duong.split('/').pop())} />{/key}
    {:else if dieuHuong.duong === `${GOC}/thiet-bi`}
      <ThietBi />
    {:else if dieuHuong.duong === `${GOC}/mail`}
      <Mail />
    {:else}
      <TongQuan />
    {/if}
  </main>
{/if}
