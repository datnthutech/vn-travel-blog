<!-- Khối "Tra nhanh" (bắt buộc với nhật ký/review): thông tin tiện lợi hiện lên đầu bài. -->
<script lang="ts">
  import { loiCua, type TraNhanh } from '../kieu';

  let { v = $bindable(), loi = {} }: { v: TraNhanh; loi?: Record<string, string[]> } = $props();
  const err = (k: string) => loiCua(loi, `traNhanh.${k}`);
  let luuY = $derived(v.luuYVoiBe.join('\n'));
</script>

<fieldset class="the">
  <legend>Tra nhanh</legend>
  {#each loiCua(loi, 'traNhanh').filter(() => false) as l}<p>{l}</p>{/each}
  <label for="tn-hopvoi">Hợp với</label><input id="tn-hopvoi" type="text" bind:value={v.hopVoi} />
  {#each err('hopVoi') as l}<p class="thong-bao-loi">{l}</p>{/each}
  <label for="tn-tg">Thời gian đi</label><input id="tn-tg" type="text" bind:value={v.thoiGian} />
  <label for="tn-o">Chỗ ở (nếu có)</label><input id="tn-o" type="text" bind:value={v.choO} />
  <label for="tn-cp">Tổng chi phí (VNĐ)</label><input id="tn-cp" type="number" min="0" bind:value={v.tongChiPhi} />
  <label for="tn-sn">Số người</label><input id="tn-sn" type="number" min="1" bind:value={v.soNguoi} />
  <label for="tn-diem">Mức thân thiện với bé (1–5)</label><input id="tn-diem" type="number" min="1" max="5" bind:value={v.diemThanThienVoiBe} />
  <label for="tn-dc">Di chuyển</label><input id="tn-dc" type="text" bind:value={v.diChuyen} />
  <label for="tn-td">Thời điểm nên đi</label><input id="tn-td" type="text" bind:value={v.thoiDiemNenDi} />
  <label for="tn-ly">Lưu ý với bé (mỗi dòng một ý)</label>
  <textarea id="tn-ly" rows="3" value={luuY} oninput={(e) => (v.luuYVoiBe = e.currentTarget.value.split('\n').map((s) => s.trim()).filter(Boolean))}></textarea>
</fieldset>

<style>
  fieldset { margin: 16px 0; }
  textarea { width: 100%; padding: 8px 12px; border: 1px solid var(--vien); border-radius: 8px; background: var(--nen); color: var(--chu); font: inherit; }
</style>
