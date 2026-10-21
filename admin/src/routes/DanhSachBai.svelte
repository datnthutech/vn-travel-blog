<!-- Danh sách bài: tìm kiếm, lọc theo trạng thái/tỉnh, trạng thái có màu, giờ hẹn hiển thị giờ Việt Nam. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { goiApi } from '../lib/api';
  import { bamLienKet, GOC } from '../lib/dieu-huong.svelte';
  import { phien, thongBaoLoi } from '../lib/phien.svelte';

  interface Tom { id: number; tieuDe: string; slug: string; trangThai: 'nhap' | 'da-dang' | 'hen-gio'; henGio?: number; tinh?: string; tacGia: { ten: string } | null; nguoiSuaCuoi: { ten: string } | null; suaLuc: number }
  let ds = $state<Tom[]>([]);
  let tong = $state(0);
  let trang = $state(1);
  let q = $state('');
  let trangThai = $state('');
  let tinh = $state('');
  let cuaToi = $state(false);
  let tinhDs = $state<{ slug: string; ten: string }[]>([]);
  let loi = $state('');
  let dangTai = $state(false);

  const TEN = { nhap: 'Nháp', 'da-dang': 'Đã đăng', 'hen-gio': 'Hẹn giờ' } as const;
  const gioVN = (ms: number) => new Date(ms + 7 * 3600_000).toISOString().slice(0, 16).replace('T', ' ');

  let seq = 0; // chỉ kết quả của lần gọi MỚI NHẤT được hiển thị (tránh kết quả cũ đến muộn ghi đè)
  let hen: ReturnType<typeof setTimeout> | undefined;
  async function tai() {
    const luot = ++seq;
    dangTai = true;
    loi = '';
    try {
      const qs = new URLSearchParams({ trang: String(trang) });
      if (q.trim()) qs.set('q', q.trim());
      if (trangThai) qs.set('trangThai', trangThai);
      if (tinh) qs.set('tinh', tinh);
      if (cuaToi && phien.nguoiDung) qs.set('tacGia', String(phien.nguoiDung.id));
      const r = await goiApi<{ bai: Tom[]; tong: number }>('GET', `/bai?${qs}`);
      if (luot !== seq) return;
      ds = r.bai;
      tong = r.tong;
    } catch (e) {
      if (luot === seq) loi = thongBaoLoi(e);
    } finally {
      if (luot === seq) dangTai = false;
    }
  }
  // Gõ tìm kiếm: đợi 300 ms sau phím cuối rồi mới gọi.
  const loc = () => {
    trang = 1;
    clearTimeout(hen);
    hen = setTimeout(() => void tai(), 300);
  };
  onMount(() => {
    void goiApi<{ tinh: typeof tinhDs }>('GET', '/tinh').then((r) => (tinhDs = r.tinh)).catch(() => {});
    void tai();
  });
</script>

<div class="dau-trang">
  <h1>Bài viết</h1>
  <a class="nut" href="{GOC}/bai/moi" onclick={bamLienKet}>＋ Viết bài mới</a>
</div>

<div class="the">
  <label for="q">Tìm theo tiêu đề hoặc slug</label>
  <input id="q" type="text" bind:value={q} oninput={loc} />
  <label class="hang-chon"><input type="checkbox" bind:checked={cuaToi} onchange={loc} /> Chỉ bài của tôi</label>
  <div class="hang-loc">
    <div><label for="tt">Trạng thái</label>
      <select id="tt" bind:value={trangThai} onchange={loc}>
        <option value="">Tất cả</option><option value="nhap">Nháp</option><option value="da-dang">Đã đăng</option><option value="hen-gio">Hẹn giờ</option>
      </select></div>
    <div><label for="tinh">Tỉnh</label>
      <select id="tinh" bind:value={tinh} onchange={loc}><option value="">Tất cả</option>{#each tinhDs as t}<option value={t.slug}>{t.ten}</option>{/each}</select></div>
  </div>
</div>

{#if loi}<p class="thong-bao-loi" role="alert">{loi}</p>{/if}
<div class="the">
  {#if !dangTai && ds.length === 0}<p class="nhat">Chưa có bài nào khớp.</p>{/if}
  <ul class="danh-sach">
    {#each ds as b (b.id)}
      <li>
        <a href="{GOC}/bai/{b.id}" onclick={bamLienKet}><strong>{b.tieuDe || '(chưa có tiêu đề)'}</strong></a>
        <span class="nhan {b.trangThai}">{TEN[b.trangThai]}</span><br />
        <span class="nhat">/{b.tinh ? `${b.tinh}/` : 'kinh-nghiem/'}{b.slug}/ · {b.tacGia?.ten ?? 'không rõ tác giả'} · sửa {gioVN(b.suaLuc)}{b.nguoiSuaCuoi ? ` bởi ${b.nguoiSuaCuoi.ten}` : ''}
          {#if b.trangThai === 'hen-gio' && b.henGio} · sẽ đăng {gioVN(b.henGio)} (giờ VN){/if}</span>
      </li>
    {/each}
  </ul>
  <div class="hang-nut">
    <button class="phu" disabled={trang <= 1} onclick={() => { trang -= 1; void tai(); }}>Trang trước</button>
    <span class="nhat">Trang {trang} · {tong} bài</span>
    <button class="phu" disabled={trang * 20 >= tong} onclick={() => { trang += 1; void tai(); }}>Trang sau</button>
  </div>
</div>

<style>
  .dau-trang { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  .dau-trang :global(.nut) { display: inline-flex; align-items: center; text-decoration: none; }
  .hang-loc { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .nhan { font-size: .75rem; padding: 2px 8px; border-radius: 999px; margin-left: 6px; border: 1px solid var(--vien); }
  .nhan.da-dang { background: var(--ok-nen); color: var(--ok); }
  .nhan.hen-gio { background: #fff3cd; color: #7a5b00; }
  .nhan.nhap { color: var(--chu-nhat); }
</style>
