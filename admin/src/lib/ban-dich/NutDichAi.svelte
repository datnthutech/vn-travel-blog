<!-- Nút "Dịch bằng AI": gọi máy chủ rồi ĐƯA KẾT QUẢ CHO FORM (khiCoKetQua). Không lưu gì — người dùng xem, sửa rồi tự bấm Lưu. Lỗi AI chỉ hiện ở đây. -->
<script lang="ts">
  import { goiApi, LoiApi } from '../api';

  let {
    baiId, ngonNgu, chiTruong, nhan = 'Dịch bằng AI', khiCoKetQua,
  }: {
    baiId: number; ngonNgu: string;
    /** Dịch MỘT ô chữ (tieuDe | moTa | noiDung | anhBiaAlt); bỏ trống = dịch cả bài. */
    chiTruong?: string;
    nhan?: string;
    khiCoKetQua: (ketQua: Record<string, unknown>, canhBao: string[]) => void;
  } = $props();

  let dang = $state(false);
  let loi = $state('');

  async function dich() {
    dang = true;
    loi = '';
    try {
      const r = await goiApi<{ ketQua: Record<string, unknown>; canhBao: string[] }>('POST', `/bai/${baiId}/ban-dich/${ngonNgu}/dich-ai`, chiTruong ? { chiTruong } : {});
      khiCoKetQua(r.ketQua, r.canhBao);
    } catch (e) {
      loi = e instanceof LoiApi ? e.loi : 'Không dịch được bằng AI, hãy thử lại.'; // thông báo tiếng Việt do máy chủ trả; form vẫn sửa/lưu bình thường
    } finally {
      dang = false;
    }
  }
</script>

<span class="nut-dich-ai">
  <button type="button" class="phu" onclick={dich} disabled={dang}>{dang ? 'AI đang dịch…' : nhan}</button>
  {#if loi}<span class="thong-bao-loi" role="alert">{loi}</span>{/if}
</span>

<style>
  .nut-dich-ai { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  button { min-height: 44px; }
</style>
