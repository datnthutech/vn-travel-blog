<!-- Dịch chuyên mục, tỉnh, trang tĩnh, mục menu và tên/mô tả site sang ngôn ngữ khác. Chọn ngôn ngữ + loại → danh sách → sửa từng mục. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { goiApi, LoiApi } from '../lib/api';
  import { thongBaoLoi } from '../lib/phien.svelte';

  type Loai = 'chuyen-muc' | 'tinh' | 'trang' | 'menu' | 'site';
  const TEN_LOAI: Record<Loai, string> = { 'chuyen-muc': 'Chuyên mục', tinh: 'Tỉnh', trang: 'Trang tĩnh', menu: 'Menu', site: 'Tên & mô tả site' };
  // Trường của từng loại: [khoá, nhãn, nhiều dòng?]
  const TRUONG: Record<Loai, [string, string, boolean][]> = {
    'chuyen-muc': [['ten', 'Tên', false], ['moTa', 'Mô tả', true]],
    tinh: [['ten', 'Tên', false], ['gioiThieu', 'Giới thiệu', true], ['moTa', 'Mô tả', true], ['anhBiaAlt', 'Mô tả ảnh bìa', false]],
    trang: [['tieuDe', 'Tiêu đề', false], ['slug', 'Slug (đường dẫn)', false], ['moTa', 'Mô tả', true], ['noiDung', 'Nội dung', true]],
    menu: [['nhan', 'Nhãn', false]],
    site: [['tenSite', 'Tên site', false], ['moTaMacDinh', 'Mô tả mặc định', true]],
  };
  interface Ngon { ma: string; ten: string }
  let ngon = $state<Ngon[]>([]);
  let ma = $state('');
  let loai = $state<Loai>('chuyen-muc');
  let khoas = $state<{ khoa: string; nhan: string }[]>([]);
  let khoa = $state('');
  let goc = $state<Record<string, string>>({});
  let du = $state<Record<string, string>>({});
  let trangThai = $state<'nhap' | 'da-dang'>('nhap');
  let loi = $state('');
  let ok = $state('');
  let ban = $state(false);

  async function taiKhoa() {
    khoas = [];
    khoa = '';
    goc = {};
    du = {};
    try {
      if (loai === 'chuyen-muc') khoas = (await goiApi<{ chuyenMuc: { slug: string; ten: string }[] }>('GET', '/chuyen-muc')).chuyenMuc.map((c) => ({ khoa: c.slug, nhan: c.ten }));
      else if (loai === 'tinh') khoas = (await goiApi<{ tinh: { slug: string; ten: string }[] }>('GET', '/tinh')).tinh.map((t) => ({ khoa: t.slug, nhan: t.ten }));
      else if (loai === 'trang') khoas = (await goiApi<{ trang: { slug: string; tieuDe: string }[] }>('GET', '/trang')).trang.map((t) => ({ khoa: t.slug, nhan: t.tieuDe }));
      else if (loai === 'site') khoas = [{ khoa: 'site', nhan: 'Tên và mô tả site' }];
      else {
        const m = await goiApi<{ dauTrang: { nhan: string; con?: { nhan: string }[] }[]; chanTrang: { nhan: string; con?: { nhan: string }[] }[] }>('GET', '/menu');
        for (const vt of ['dauTrang', 'chanTrang'] as const) m[vt].forEach((x, i) => {
          khoas.push({ khoa: `${vt}.${i}`, nhan: `${vt === 'dauTrang' ? 'Đầu trang' : 'Chân trang'}: ${x.nhan}` });
          (x.con ?? []).forEach((c, j) => khoas.push({ khoa: `${vt}.${i}.${j}`, nhan: `   ↳ ${c.nhan}` }));
        });
      }
      if (khoas[0]) {
        khoa = khoas[0].khoa;
        await taiMuc();
      }
    } catch (e) {
      loi = thongBaoLoi(e);
    }
  }
  async function taiMuc() {
    if (!khoa) return;
    loi = '';
    ok = '';
    try {
      const r = await goiApi<{ banGoc: Record<string, string>; duLieu: Record<string, string> | null }>('GET', `/dich/${loai}/${khoa}/${ma}`);
      goc = r.banGoc;
      du = { ...(r.duLieu ?? {}) };
      trangThai = (r.duLieu?.trangThai as 'nhap' | 'da-dang' | undefined) ?? 'nhap';
    } catch (e) {
      loi = thongBaoLoi(e);
    }
  }
  async function luu() {
    ban = true;
    loi = '';
    ok = '';
    try {
      await goiApi('PUT', `/dich/${loai}/${khoa}/${ma}`, { ...du, ...(loai === 'trang' ? { trangThai } : {}) });
      ok = 'Đã lưu bản dịch.';
    } catch (e) {
      loi = thongBaoLoi(e);
    }
    ban = false;
  }
  async function dichAi() {
    ban = true;
    loi = '';
    ok = '';
    try {
      const nguon = Object.fromEntries(TRUONG[loai].filter(([k]) => k !== 'slug' && goc[k]).map(([k]) => [k, goc[k]!]));
      const r = await goiApi<{ ketQua: Record<string, string> }>('POST', '/dich-ai/chuoi', { nguon, ngonNgu: ma });
      du = { ...du, ...r.ketQua };
      ok = 'AI đã điền bản dịch — đọc lại rồi bấm Lưu (chưa lưu gì).';
    } catch (e) {
      loi = e instanceof LoiApi ? e.loi : 'Không dịch được bằng AI.';
    }
    ban = false;
  }
  onMount(() => void goiApi<{ ngonNgu: Ngon[] }>('GET', '/ngon-ngu').then((r) => {
    ngon = r.ngonNgu.filter((n) => n.ma !== 'vi');
    if (ngon[0]) {
      ma = ngon[0].ma;
      return taiKhoa();
    }
  }).catch((e) => (loi = thongBaoLoi(e))));
</script>

<h1>Bản dịch cấu trúc</h1>
{#if loi}<p class="thong-bao-loi" role="alert">{loi}</p>{/if}
{#if ok}<p class="thong-bao-ok" role="status">{ok}</p>{/if}
{#if ngon.length === 0}
  <p class="nhat">Chưa có ngôn ngữ nào ngoài tiếng Việt. Thêm ở mục Ngôn ngữ (quản trị).</p>
{:else}
  <div class="the">
    <label for="dc-ma">Ngôn ngữ</label>
    <select id="dc-ma" bind:value={ma} onchange={taiKhoa}>{#each ngon as n}<option value={n.ma}>{n.ten} ({n.ma})</option>{/each}</select>
    <label for="dc-loai">Loại</label>
    <select id="dc-loai" bind:value={loai} onchange={taiKhoa}>{#each Object.entries(TEN_LOAI) as [k, t]}<option value={k}>{t}</option>{/each}</select>
    {#if khoas.length > 1}
      <label for="dc-khoa">Mục cần dịch</label>
      <select id="dc-khoa" bind:value={khoa} onchange={taiMuc}>{#each khoas as k}<option value={k.khoa}>{k.nhan}</option>{/each}</select>
    {/if}
  </div>
  {#if khoa}
    <section class="the">
      {#each TRUONG[loai] as [k, nhan, nhieu]}
        <p class="nhat">Bản gốc — {nhan}: {goc[k] ?? ''}</p>
        <label for="dc-{k}">{nhan}</label>
        {#if nhieu}<textarea id="dc-{k}" rows="4" bind:value={du[k]}></textarea>{:else}<input id="dc-{k}" type="text" bind:value={du[k]} />{/if}
      {/each}
      {#if loai === 'trang'}
        <label for="dc-tt">Trạng thái bản dịch trang</label>
        <select id="dc-tt" bind:value={trangThai}><option value="nhap">Nháp (chỉ ở bản xem trước)</option><option value="da-dang">Đã đăng</option></select>
      {/if}
      <div class="hang-nut"><button type="button" onclick={luu} disabled={ban}>Lưu</button><button type="button" class="phu" onclick={dichAi} disabled={ban}>Dịch bằng AI</button></div>
    </section>
  {/if}
{/if}

<style>
  input, textarea, select { width: 100%; padding: 8px 12px; border: 1px solid var(--vien); border-radius: 8px; background: var(--nen); color: var(--chu); font: inherit; }
</style>
