<!-- Bản gốc (tiếng Việt) chỉ-đọc, đặt cạnh form bản dịch. -->
<script lang="ts">
  interface Goc {
    tieuDe: string; moTa: string; noiDung: string; anhBiaAlt: string;
    traNhanh?: { hopVoi: string; thoiGian: string; choO?: string; diChuyen: string; thoiDiemNenDi: string; luuYVoiBe: string[] };
    diaDiem: { ten: string; diaChi?: string; khoangGia?: string; gioMoCua?: string; thanThienVoiBe?: string; uuDiem: string[]; nhuocDiem: string[]; anhAlt: string[] }[];
    doMangChoBe: { ten: string; ghiChu?: string }[];
    faq: { hoi: string; dap: string }[];
  }
  let { goc }: { goc: Goc } = $props();
</script>

<section class="the goc" aria-label="Bản gốc tiếng Việt">
  <h2>Bản gốc (tiếng Việt)</h2>
  <p><strong>Tiêu đề:</strong> {goc.tieuDe}</p>
  <p><strong>Mô tả:</strong> {goc.moTa}</p>
  <p><strong>Mô tả ảnh bìa:</strong> {goc.anhBiaAlt}</p>
  {#if goc.traNhanh}
    <h3>Tra nhanh</h3>
    <ul>
      <li>Hợp với: {goc.traNhanh.hopVoi}</li><li>Thời gian: {goc.traNhanh.thoiGian}</li>
      {#if goc.traNhanh.choO}<li>Chỗ ở: {goc.traNhanh.choO}</li>{/if}
      <li>Di chuyển: {goc.traNhanh.diChuyen}</li><li>Thời điểm nên đi: {goc.traNhanh.thoiDiemNenDi}</li>
      {#each goc.traNhanh.luuYVoiBe as l}<li>Lưu ý: {l}</li>{/each}
    </ul>
  {/if}
  <h3>Nội dung</h3>
  <pre class="noi-dung">{goc.noiDung}</pre>
  {#if goc.diaDiem.length}
    <h3>Địa điểm</h3>
    <ol>{#each goc.diaDiem as d}<li><strong>{d.ten}</strong>{[d.diaChi, d.khoangGia, d.gioMoCua, d.thanThienVoiBe].filter(Boolean).map((x) => ` · ${x}`).join('')}
      {#if d.uuDiem.length}<br />Ưu điểm: {d.uuDiem.join('; ')}{/if}{#if d.nhuocDiem.length}<br />Nhược điểm: {d.nhuocDiem.join('; ')}{/if}
      {#if d.anhAlt.length}<br />Mô tả ảnh: {d.anhAlt.join(' | ')}{/if}</li>{/each}</ol>
  {/if}
  {#if goc.doMangChoBe.length}
    <h3>Đồ nên mang cho bé</h3>
    <ul>{#each goc.doMangChoBe as x}<li>{x.ten}{x.ghiChu ? ` — ${x.ghiChu}` : ''}</li>{/each}</ul>
  {/if}
  {#if goc.faq.length}
    <h3>Hỏi đáp</h3>
    <ul>{#each goc.faq as f}<li><strong>{f.hoi}</strong> {f.dap}</li>{/each}</ul>
  {/if}
</section>

<style>
  .goc { background: var(--nen-phu, transparent); }
  .noi-dung { white-space: pre-wrap; overflow-wrap: anywhere; max-height: 24rem; overflow: auto; font: inherit; margin: 0; }
</style>
