<!-- Danh sách bản tin (chỉ quản trị): tạo mới, mở để soạn/gửi, xem tiến độ các bản đã gửi. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { goiApi } from '../lib/api';
  import { bamLienKet, di, GOC } from '../lib/dieu-huong.svelte';
  import { thongBaoLoi } from '../lib/phien.svelte';

  interface TienDo { tong: number; daGui: number; dangCho: number; boQua: number; loi: number }
  interface B { id: number; tieuDe: string; ngonNgu: string; loai: 'tu-soan' | 'bai-moi'; trangThai: 'nhap' | 'dang-gui' | 'da-gui'; taoLuc: number; guiLuc: number | null; tienDo?: TienDo }
  const TEN = { nhap: 'Nháp', 'dang-gui': 'Đang gửi', 'da-gui': 'Đã gửi' } as const;
  let ds = $state<B[]>([]);
  let loi = $state('');
  let dangTao = $state(false);
  const gio = (ms: number) => new Date(ms).toLocaleString('vi-VN');

  async function tai() {
    try {
      ds = (await goiApi<{ banTin: B[] }>('GET', '/ban-tin')).banTin;
    } catch (e) {
      loi = thongBaoLoi(e);
    }
  }
  async function taoMoi() {
    dangTao = true;
    loi = '';
    try {
      const b = await goiApi<B>('POST', '/ban-tin', { tieuDe: 'Bản tin mới', noiDung: 'Viết nội dung ở đây.', ngonNgu: 'vi' });
      di(`${GOC}/ban-tin/${b.id}`);
    } catch (e) {
      loi = thongBaoLoi(e);
      dangTao = false;
    }
  }
  onMount(() => void tai());
</script>

<div class="dau-trang">
  <h1>Bản tin</h1>
  <div class="hang-nut">
    <a class="nut phu" href="{GOC}/nguoi-dang-ky" onclick={bamLienKet}>Người đăng ký</a>
    <button onclick={taoMoi} disabled={dangTao}>Soạn bản tin mới</button>
  </div>
</div>
{#if loi}<p class="thong-bao-loi" role="alert">{loi}</p>{/if}
<p class="nhat">Bản tin chỉ gửi khi bạn bấm "Gửi" — đăng bài không tự gửi. Muốn báo bài mới: vào "Bài viết" → "Gửi thông báo bài này".</p>
<section class="the">
  {#if ds.length === 0}<p class="nhat">Chưa có bản tin nào.</p>{/if}
  <ul class="danh-sach">
    {#each ds as b (b.id)}
      <li>
        <a href="{GOC}/ban-tin/{b.id}" onclick={bamLienKet}><strong>{b.tieuDe}</strong></a>
        <span class="nhan {b.trangThai}">{TEN[b.trangThai]}</span><br />
        <span class="nhat">{b.loai === 'bai-moi' ? 'Thông báo bài mới' : 'Tự soạn'} · ngôn ngữ {b.ngonNgu} · tạo {gio(b.taoLuc)}
          {#if b.tienDo} · đã gửi {b.tienDo.daGui}/{b.tienDo.tong}{b.tienDo.dangCho ? `, còn chờ ${b.tienDo.dangCho}` : ''}{/if}</span>
      </li>
    {/each}
  </ul>
</section>

<style>
  .dau-trang { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  .dau-trang :global(.nut) { display: inline-flex; align-items: center; text-decoration: none; }
  .nhan { font-size: .75rem; padding: 2px 8px; border-radius: 999px; margin-left: 6px; border: 1px solid var(--vien); }
  .nhan.da-gui { background: var(--ok-nen); color: var(--ok); }
  .nhan.dang-gui { background: #fff3cd; color: #7a5b00; }
</style>
