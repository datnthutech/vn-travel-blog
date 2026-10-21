<!-- "Review": lưu bản dịch, chờ build xem trước, mở TOÀN MÀN HÌNH trang /<mã>/… trong lớp phủ; từ đó đóng / đăng / đánh dấu đã kiểm tra. -->
<script lang="ts">
  let {
    dangBan, khiXemTruoc, khiDang, khiKiemTra, daKiemTra = false, daDang = false,
  }: {
    dangBan: boolean;
    /** Lưu + dựng bản xem trước; trả URL trang xem trước, hoặc null nếu không dựng được (parent đã báo lỗi). */
    khiXemTruoc: () => Promise<string | null>;
    khiDang: () => Promise<void>;
    khiKiemTra: (ghiChu: string) => Promise<void>;
    daKiemTra?: boolean;
    daDang?: boolean;
  } = $props();

  let url = $state('');
  let dangDung = $state(false);
  let ghiChu = $state('');

  async function mo() {
    dangDung = true;
    try {
      url = (await khiXemTruoc()) ?? '';
    } finally {
      dangDung = false;
    }
  }
  const dong = () => (url = '');
  const lam = async (f: () => Promise<void>) => {
    dangDung = true;
    try {
      await f();
    } finally {
      dangDung = false;
    }
  };
</script>

<button type="button" class="phu" onclick={mo} disabled={dangBan || dangDung}>{dangDung && !url ? 'Đang dựng bản xem trước…' : 'Review toàn màn hình'}</button>

{#if url}
  <div class="phu-man-hinh" role="dialog" aria-modal="true" aria-label="Xem trước bản dịch">
    <div class="thanh the">
      <div class="hang-nut">
        <button type="button" class="phu" onclick={dong}>Đóng</button>
        {#if !daDang}<button type="button" onclick={() => lam(async () => { await khiDang(); dong(); })} disabled={dangDung}>Đăng bản này</button>{/if}
        <button type="button" class="phu" onclick={() => lam(() => khiKiemTra(ghiChu))} disabled={dangDung}>{daKiemTra ? 'Cập nhật "đã kiểm tra"' : 'Đánh dấu đã kiểm tra'}</button>
        <a href={url} target="_blank" rel="noopener">Mở ở tab mới</a>
      </div>
      <label for="ghi-chu-kt">Ghi chú kiểm tra (tuỳ chọn)</label>
      <input id="ghi-chu-kt" type="text" maxlength="1000" bind:value={ghiChu} />
    </div>
    <iframe title="Xem trước bản dịch" src={url} class="khung"></iframe>
  </div>
{/if}

<style>
  .phu-man-hinh { position: fixed; inset: 0; z-index: 40; background: var(--nen); display: flex; flex-direction: column; }
  .thanh { margin: 0; border-radius: 0; flex: none; }
  .khung { flex: 1; width: 100%; border: 0; background: #fff; }
  button { min-height: 44px; }
  input { width: 100%; padding: 8px 12px; border: 1px solid var(--vien); border-radius: 8px; background: var(--nen); color: var(--chu); font: inherit; }
</style>
