<!-- Thanh nút của trang soạn bài: Lưu · Xem trước · Đăng/Gỡ · Hẹn giờ · Thùng rác · Nhân bản. -->
<script lang="ts">
  let {
    trangThai, henGio, thungRac, dangBan, tuLuu, xemTruoc,
    khiLuu, khiXemTruoc, khiDang, khiGo, khiHenGio, khiHuyHen, khiThungRac, khiNhanBan, khiKhoiPhuc,
  }: {
    trangThai: 'nhap' | 'da-dang' | 'hen-gio'; henGio?: string; thungRac: boolean; dangBan: boolean;
    tuLuu: 'dang-luu' | 'da-luu' | 'loi' | '';
    xemTruoc: { dang: boolean; url: string; thongBao: string };
    khiLuu: () => void; khiXemTruoc: () => void; khiDang: () => void; khiGo: () => void;
    khiHenGio: (luc: string) => void; khiHuyHen: () => void; khiThungRac: () => void; khiNhanBan: () => void; khiKhoiPhuc: () => void;
  } = $props();

  let hen = $state('');
  const TEN = { nhap: 'Bản nháp', 'da-dang': 'Đã đăng', 'hen-gio': 'Đã hẹn giờ' } as const;
</script>

<div class="thanh-nut the">
  <p><strong>{thungRac ? 'Trong thùng rác' : TEN[trangThai]}</strong>{#if trangThai === 'hen-gio' && henGio} · sẽ đăng lúc {henGio.replace('T', ' ')} (giờ Việt Nam){/if}
    <span class="nhat">
      {#if tuLuu === 'dang-luu'} · đang lưu nháp…{:else if tuLuu === 'da-luu'} · đã tự lưu{:else if tuLuu === 'loi'} · <span style="color:var(--loi)">Chưa lưu được — sẽ thử lại</span>{/if}
    </span></p>
  {#if thungRac}
    <div class="hang-nut"><button type="button" onclick={khiKhoiPhuc}>Khôi phục bài</button></div>
  {:else}
    <div class="hang-nut">
      <button type="button" onclick={khiLuu} disabled={dangBan}>Lưu</button>
      <button type="button" class="phu" onclick={khiXemTruoc} disabled={dangBan || xemTruoc.dang}>{xemTruoc.dang ? 'Đang dựng bản xem trước…' : 'Xem trước'}</button>
      {#if trangThai === 'da-dang'}
        <button type="button" class="phu" onclick={khiGo} disabled={dangBan}>Gỡ bài</button>
      {:else}
        <button type="button" onclick={khiDang} disabled={dangBan}>Đăng</button>
      {/if}
    </div>
    {#if xemTruoc.thongBao}<p class="nhat" role="status">{xemTruoc.thongBao}{#if xemTruoc.url} <a href={xemTruoc.url} target="_blank" rel="noopener">Mở bản xem trước</a>{/if}</p>{/if}
    {#if trangThai !== 'da-dang'}
      <div class="hen">
        <label for="hen-gio">Hẹn giờ đăng (giờ Việt Nam)</label>
        <input id="hen-gio" type="datetime-local" bind:value={hen} />
        <div class="hang-nut">
          <button type="button" class="phu" disabled={!hen || dangBan} onclick={() => khiHenGio(hen)}>Hẹn giờ</button>
          {#if trangThai === 'hen-gio'}<button type="button" class="phu" onclick={khiHuyHen}>Huỷ hẹn giờ</button>{/if}
        </div>
      </div>
    {/if}
    <div class="hang-nut">
      <button type="button" class="phu" onclick={khiNhanBan}>Nhân bản</button>
      <button type="button" class="nguy" onclick={khiThungRac}>Chuyển vào thùng rác</button>
    </div>
  {/if}
</div>

<style>
  .hen { margin-top: 8px; }
</style>
