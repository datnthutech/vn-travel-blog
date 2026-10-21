<!-- Danh sách địa điểm (quán ăn, chỗ ở, điểm chơi…): thêm, xoá, đổi thứ tự; mỗi địa điểm có ảnh và link đặt phòng. -->
<script lang="ts">
  import { KIEU_DIA_DIEM, loiCua, type DiaDiem } from '../kieu';
  import AnhBia from './AnhBia.svelte';

  let { ds = $bindable(), anhBaseUrl, loi = {} }: { ds: DiaDiem[]; anhBaseUrl: string; loi?: Record<string, string[]> } = $props();

  const moi = (): DiaDiem => ({ ten: '', kieu: 'diem-choi', uuDiem: [], nhuocDiem: [], anh: [] });
  const doi = (i: number, j: number) => {
    if (j < 0 || j >= ds.length) return;
    const t = ds[i]!;
    ds[i] = ds[j]!;
    ds[j] = t;
  };
  const dong = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);
</script>

<section class="the">
  <h2>Địa điểm</h2>
  {#each ds as d, i (i)}
    <fieldset>
      <legend>Địa điểm {i + 1}</legend>
      <label for="dd-ten-{i}">Tên</label><input id="dd-ten-{i}" type="text" bind:value={d.ten} />
      <label for="dd-kieu-{i}">Loại</label>
      <select id="dd-kieu-{i}" bind:value={d.kieu}>{#each KIEU_DIA_DIEM as k}<option value={k.ma}>{k.ten}</option>{/each}</select>
      <label for="dd-dc-{i}">Địa chỉ</label><input id="dd-dc-{i}" type="text" bind:value={d.diaChi} />
      <label for="dd-gia-{i}">Khoảng giá</label><input id="dd-gia-{i}" type="text" bind:value={d.khoangGia} />
      <label for="dd-gio-{i}">Giờ mở cửa</label><input id="dd-gio-{i}" type="text" bind:value={d.gioMoCua} />
      <label for="dd-be-{i}">Thân thiện với bé</label><input id="dd-be-{i}" type="text" bind:value={d.thanThienVoiBe} />
      <label for="dd-diem-{i}">Điểm (1–5)</label><input id="dd-diem-{i}" type="number" min="1" max="5" bind:value={d.diem} />
      <label for="dd-uu-{i}">Ưu điểm (mỗi dòng một ý)</label>
      <textarea id="dd-uu-{i}" rows="2" value={d.uuDiem.join('\n')} oninput={(e) => (d.uuDiem = dong(e.currentTarget.value))}></textarea>
      <label for="dd-nhuoc-{i}">Nhược điểm (mỗi dòng một ý)</label>
      <textarea id="dd-nhuoc-{i}" rows="2" value={d.nhuocDiem.join('\n')} oninput={(e) => (d.nhuocDiem = dong(e.currentTarget.value))}></textarea>
      <label for="dd-nc-{i}">Nơi đặt (link đặt phòng/vé)</label>
      <select id="dd-nc-{i}" value={d.linkDat?.nhaCungCap ?? ''} onchange={(e) => { const v = e.currentTarget.value; d.linkDat = v ? { nhaCungCap: v as never, url: d.linkDat?.url ?? '' } : undefined; }}>
        <option value="">Không có</option><option value="agoda">Agoda</option><option value="klook">Klook</option><option value="traveloka">Traveloka</option><option value="booking">Booking</option><option value="khac">Khác</option>
      </select>
      {#if d.linkDat}<label for="dd-url-{i}">Địa chỉ link đặt</label><input id="dd-url-{i}" type="text" inputmode="url" bind:value={d.linkDat.url} />{/if}
      {#each d.anh as a, k (k)}
        <AnhBia bind:anh={d.anh[k]!} {anhBaseUrl} nhan="Ảnh {k + 1} của địa điểm {i + 1}" loi={loiCua(loi, `diaDiem.${i}.anh.${k}`)} />
        <div class="hang-nut"><button type="button" class="nguy" onclick={() => d.anh.splice(k, 1)}>Xoá ảnh {k + 1}</button></div>
      {/each}
      <div class="hang-nut"><button type="button" class="phu" onclick={() => d.anh.push({ ma: '', alt: '' })}>＋ Thêm ảnh</button></div>
      {#each loiCua(loi, `diaDiem.${i}`).filter((l) => !l.includes('alt')) as l}<p class="thong-bao-loi">{l}</p>{/each}
      <div class="hang-nut">
        <button type="button" class="phu" onclick={() => doi(i, i - 1)} disabled={i === 0}>↑ Lên</button>
        <button type="button" class="phu" onclick={() => doi(i, i + 1)} disabled={i === ds.length - 1}>↓ Xuống</button>
        <button type="button" class="nguy" onclick={() => ds.splice(i, 1)}>Xoá địa điểm</button>
      </div>
    </fieldset>
  {/each}
  <div class="hang-nut"><button type="button" class="phu" onclick={() => ds.push(moi())}>＋ Thêm địa điểm</button></div>
</section>

<style>
  fieldset { margin: 12px 0; }
  textarea { width: 100%; padding: 8px 12px; border: 1px solid var(--vien); border-radius: 8px; background: var(--nen); color: var(--chu); font: inherit; }
</style>
