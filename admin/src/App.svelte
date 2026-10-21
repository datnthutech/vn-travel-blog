<!-- Khung ứng dụng: thanh điều hướng + chọn trang theo đường dẫn + chặn trang cần đăng nhập. -->
<script lang="ts">
  import { goiApi } from './lib/api';
  import { bamLienKet, dieuHuong, di, GOC } from './lib/dieu-huong.svelte';
  import { phien, taiPhien } from './lib/phien.svelte';
  import BatTotp from './routes/BatTotp.svelte';
  import DangNhap from './routes/DangNhap.svelte';
  import DatLai from './routes/DatLai.svelte';
  import Mail from './routes/Mail.svelte';
  import Menu from './routes/Menu.svelte';
  import Redirect from './routes/Redirect.svelte';
  import SoanTrang from './routes/SoanTrang.svelte';
  import Tag from './routes/Tag.svelte';
  import Tinh from './routes/Tinh.svelte';
  import Trang from './routes/Trang.svelte';
  import CaiDatSite from './routes/CaiDatSite.svelte';
  import ChuyenMuc from './routes/ChuyenMuc.svelte';
  import DanhSachBai from './routes/DanhSachBai.svelte';
  import LichSuBai from './routes/LichSuBai.svelte';
  import SoanBai from './routes/SoanBai.svelte';
  import ThuVienAnh from './routes/ThuVienAnh.svelte';
  import ThungRac from './routes/ThungRac.svelte';
  import QuenMatKhau from './routes/QuenMatKhau.svelte';
  import ThietBi from './routes/ThietBi.svelte';
  import TongQuan from './routes/TongQuan.svelte';
  import Totp from './routes/Totp.svelte';

  const CONG_KHAI = [`${GOC}/dang-nhap`, `${GOC}/quen-mat-khau`, `${GOC}/dat-lai`];
  const MUC = [
    { duong: GOC, ten: 'Tổng quan' },
    { duong: `${GOC}/bai`, ten: 'Bài viết' },
    { duong: `${GOC}/anh`, ten: 'Ảnh' },
    { duong: `${GOC}/thung-rac`, ten: 'Thùng rác' },
    { duong: `${GOC}/chuyen-muc`, ten: 'Chuyên mục' },
    { duong: `${GOC}/tinh`, ten: 'Tỉnh' },
    { duong: `${GOC}/tag`, ten: 'Tag' },
    { duong: `${GOC}/trang`, ten: 'Trang tĩnh' },
    { duong: `${GOC}/menu`, ten: 'Menu' },
    { duong: `${GOC}/redirect`, ten: 'Chuyển hướng' },
    { duong: `${GOC}/cai-dat`, ten: 'Cài đặt site' },
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
    {:else if dieuHuong.duong === `${GOC}/bai`}
      <DanhSachBai />
    {:else if dieuHuong.duong === `${GOC}/chuyen-muc`}
      <ChuyenMuc />
    {:else if dieuHuong.duong === `${GOC}/tinh`}
      <Tinh />
    {:else if dieuHuong.duong === `${GOC}/tag`}
      <Tag />
    {:else if dieuHuong.duong === `${GOC}/menu`}
      <Menu />
    {:else if dieuHuong.duong === `${GOC}/redirect`}
      <Redirect />
    {:else if dieuHuong.duong === `${GOC}/cai-dat`}
      <CaiDatSite />
    {:else if dieuHuong.duong === `${GOC}/trang`}
      <Trang />
    {:else if /^\/quan-tri\/trang\/[a-z0-9-]+$/.test(dieuHuong.duong)}
      {#key dieuHuong.duong}<SoanTrang slug={dieuHuong.duong.split('/').pop()!} />{/key}
    {:else if dieuHuong.duong === `${GOC}/anh`}
      <ThuVienAnh />
    {:else if dieuHuong.duong === `${GOC}/thung-rac`}
      <ThungRac />
    {:else if /^\/quan-tri\/bai\/\d+\/lich-su$/.test(dieuHuong.duong)}
      {#key dieuHuong.duong}<LichSuBai id={Number(dieuHuong.duong.split('/')[3])} />{/key}
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
