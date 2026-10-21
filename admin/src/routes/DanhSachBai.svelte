<!-- Danh sách bài: tìm kiếm, lọc theo trạng thái/tỉnh, trạng thái có màu, giờ hẹn hiển thị giờ Việt Nam. -->
<script lang="ts">
  import { coQuyen } from '@vntraveltips/schema';
  import { onMount } from 'svelte';
  import { goiApi } from '../lib/api';
  import { bamLienKet, di, GOC } from '../lib/dieu-huong.svelte';
  import { phien, thongBaoLoi } from '../lib/phien.svelte';

  interface Tom { id: number; tieuDe: string; slug: string; trangThai: 'nhap' | 'da-dang' | 'hen-gio'; henGio?: number; banDich?: Record<string, { trangThai: string; cu?: boolean; daKiemTra?: boolean }>; tinh?: string; tacGia: { ten: string } | null; nguoiSuaCuoi: { ten: string } | null; suaLuc: number }
  let ds = $state<Tom[]>([]);
  let tong = $state(0);
  let trang = $state(1);
  let q = $state('');
  let trangThai = $state('');
  let tinh = $state('');
  let cuaToi = $state(false);
  // Lọc theo bản dịch: '' | 'thieu:<mã>' | 'cu:<mã>'
  let locDich = $state('');
  let ngonDs = $state<{ ma: string; ten: string }[]>([]);
  let tinhDs = $state<{ slug: string; ten: string }[]>([]);
  let loi = $state('');
  let dangTai = $state(false);

  let guiThongBaoLoi = $state('');
  const laQuanTri = $derived(phien.nguoiDung !== null && coQuyen(phien.nguoiDung, 'ban-tin.gui'));
  async function guiThongBao(b: Tom) {
    guiThongBaoLoi = '';
    try {
      const r = await goiApi<{ id: number }>('POST', `/ban-tin/tu-bai/${b.id}`, { ngonNgu: 'vi' });
      di(`${GOC}/ban-tin/${r.id}`);
    } catch (e) {
      guiThongBaoLoi = thongBaoLoi(e);
    }
  }

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
      if (locDich) qs.set(locDich.startsWith('thieu:') ? 'thieuBanDich' : 'banDichCu', locDich.slice(locDich.indexOf(':') + 1));
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
    const tim = new URLSearchParams(location.search); // liên kết từ Tổng quan: ?thieuBanDich=en | ?banDichCu=en
    if (tim.get('thieuBanDich')) locDich = `thieu:${tim.get('thieuBanDich')}`;
    else if (tim.get('banDichCu')) locDich = `cu:${tim.get('banDichCu')}`;
    void goiApi<{ ngonNgu: { ma: string; ten: string; bat: boolean }[] }>('GET', '/ngon-ngu').then((r) => (ngonDs = r.ngonNgu.filter((n) => n.bat && n.ma !== 'vi'))).catch(() => {});
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
  {#if ngonDs.length > 0}
    <label for="loc-dich">Bản dịch</label>
    <select id="loc-dich" bind:value={locDich} onchange={loc}>
      <option value="">Tất cả</option>
      {#each ngonDs as n}<option value="thieu:{n.ma}">Chưa dịch sang {n.ten}</option><option value="cu:{n.ma}">Bản dịch {n.ten} cũ hơn bản gốc</option>{/each}
    </select>
  {/if}
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
{#if guiThongBaoLoi}<p class="thong-bao-loi" role="alert">{guiThongBaoLoi}</p>{/if}
<div class="the">
  {#if !dangTai && ds.length === 0}<p class="nhat">Chưa có bài nào khớp.</p>{/if}
  <ul class="danh-sach">
    {#each ds as b (b.id)}
      <li>
        <a href="{GOC}/bai/{b.id}" onclick={bamLienKet}><strong>{b.tieuDe || '(chưa có tiêu đề)'}</strong></a>
        <span class="nhan {b.trangThai}">{TEN[b.trangThai]}</span><br />
        <span class="nhat">/{b.tinh ? `${b.tinh}/` : 'kinh-nghiem/'}{b.slug}/ · {b.tacGia?.ten ?? 'không rõ tác giả'} · sửa {gioVN(b.suaLuc)}{b.nguoiSuaCuoi ? ` bởi ${b.nguoiSuaCuoi.ten}` : ''}
          {#if b.trangThai === 'hen-gio' && b.henGio} · sẽ đăng {gioVN(b.henGio)} (giờ VN){/if}</span>
        {#if b.banDich && Object.keys(b.banDich).length > 0}
          <div class="chip-dich">{#each Object.entries(b.banDich) as [ma, x]}<a href="{GOC}/bai/{b.id}/ban-dich/{ma}" onclick={bamLienKet} class="chip" class:cu={x.cu}>{ma}: {x.trangThai === 'chua-dich' ? 'chưa dịch' : x.trangThai === 'da-dang' ? 'đã đăng' : x.trangThai === 'hen-gio' ? 'hẹn giờ' : 'nháp'}{x.cu ? ' · cũ hơn bản gốc' : ''}{x.daKiemTra ? ' · đã kiểm tra' : ''}</a>{/each}</div>
        {/if}
        {#if laQuanTri && b.trangThai === 'da-dang'}<div class="hang-nut"><button class="phu" onclick={() => guiThongBao(b)}>Gửi thông báo bài này</button></div>{/if}
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
  .chip-dich { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
  .chip { font-size: .8rem; padding: 4px 10px; border: 1px solid var(--vien); border-radius: 999px; text-decoration: none; min-height: 32px; display: inline-flex; align-items: center; }
  .chip.cu { background: #fff3cd; color: #7a5b00; }
</style>
