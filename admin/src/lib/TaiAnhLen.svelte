<!-- Chọn / kéo thả nhiều ảnh và tải lên một lần (máy chủ xử lý tuần tự). Hiện lỗi riêng cho từng file bị từ chối. -->
<script lang="ts">
  import { LoiApi } from './api';
  import { goiTaiAnh } from './tai-anh';

  interface KetQua { ok: { ma: string; rong: number; cao: number }[]; loi: { ten: string; loi: string }[] }
  let { khiXong }: { khiXong?: (kq: KetQua) => void } = $props();

  let dangTai = $state(false);
  let loiChung = $state('');
  let ketQua = $state<KetQua | null>(null);
  let keo = $state(false);

  async function tai(files: File[]) {
    if (!files.length) return;
    loiChung = '';
    ketQua = null;
    dangTai = true;
    try {
      ketQua = await goiTaiAnh(files);
      khiXong?.(ketQua);
    } catch (e) {
      loiChung = e instanceof LoiApi ? e.loi : 'Không tải lên được, hãy thử lại.';
    } finally {
      dangTai = false;
    }
  }
</script>

<div
  class="tai-len"
  class:keo
  role="group"
  aria-label="Tải ảnh lên"
  ondragover={(e) => { e.preventDefault(); keo = true; }}
  ondragleave={() => (keo = false)}
  ondrop={(e) => { e.preventDefault(); keo = false; void tai([...(e.dataTransfer?.files ?? [])].filter((f) => f.type.startsWith('image/'))); }}
>
  <label class="nut" for="chon-anh-len">{dangTai ? 'Đang tải và nén ảnh…' : '＋ Chọn ảnh để tải lên (hoặc kéo thả vào đây)'}</label>
  <input id="chon-anh-len" type="file" accept="image/*" multiple hidden disabled={dangTai} onchange={(e) => { const f = [...(e.currentTarget.files ?? [])]; e.currentTarget.value = ''; void tai(f); }} />
  {#if loiChung}<p class="thong-bao-loi" role="alert">{loiChung}</p>{/if}
  {#if ketQua}
    {#if ketQua.ok.length}<p class="thong-bao-ok" role="status">Đã tải {ketQua.ok.length} ảnh.</p>{/if}
    {#each ketQua.loi as l}<p class="thong-bao-loi" role="alert"><strong>{l.ten}</strong>: {l.loi}</p>{/each}
  {/if}
</div>

<style>
  .tai-len { border: 2px dashed var(--vien); border-radius: 10px; padding: 12px; margin: 12px 0; text-align: center; }
  .tai-len.keo { border-color: var(--chinh); }
  .nut { display: inline-flex; align-items: center; justify-content: center; }
</style>
