<!-- Tổng quan giai đoạn 1: người đang đăng nhập, trạng thái build, lần sao lưu gần nhất, mail hôm nay. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { goiApi } from '../lib/api';
  import { phien, thongBaoLoi } from '../lib/phien.svelte';

  interface Build { trangThai: 'roi' | 'dang-cho' | 'dang-build'; dangCho: boolean; lanCuoi: { ok: boolean; luc?: string; log?: string } | null; saoLuuCuoiLuc: number | null }
  interface ThongKeMail { id: number; ten: string; daGui: number; gioiHan: number }

  let build = $state<Build | null>(null);
  let mail = $state<ThongKeMail[]>([]);
  let loi = $state('');

  const TEN_TRANG_THAI: Record<string, string> = { roi: 'Đang rảnh', 'dang-cho': 'Đang chờ build', 'dang-build': 'Đang build site…' };
  const gio = (ms: number) => new Date(ms).toLocaleString('vi-VN');

  onMount(async () => {
    try {
      [build, mail] = await Promise.all([
        goiApi<Build>('GET', '/build'),
        goiApi<{ homNay: ThongKeMail[] }>('GET', '/mail/thong-ke').then((r) => r.homNay),
      ]);
    } catch (e) {
      loi = thongBaoLoi(e);
    }
  });
</script>

<h1>Tổng quan</h1>
{#if loi}<p class="thong-bao-loi" role="alert">{loi}</p>{/if}
<div class="nhom">
  <section class="the">
    <h2>Bạn</h2>
    <p><strong>{phien.nguoiDung?.ten}</strong><br /><span class="nhat">{phien.nguoiDung?.email} · {phien.nguoiDung?.vaiTro}</span></p>
    <p class="nhat">Xác thực 2 lớp: {phien.nguoiDung?.coTotp ? 'đã bật' : 'chưa bật'}</p>
  </section>
  <section class="the">
    <h2>Site</h2>
    {#if build}
      <p>Trạng thái build: <strong>{TEN_TRANG_THAI[build.trangThai] ?? build.trangThai}</strong></p>
      {#if build.lanCuoi}
        <p class={build.lanCuoi.ok ? 'thong-bao-ok' : 'thong-bao-loi'}>
          Lần build gần nhất: {build.lanCuoi.ok ? 'thành công' : 'LỖI'}{build.lanCuoi.luc ? ` (${new Date(build.lanCuoi.luc).toLocaleString('vi-VN')})` : ''}
        </p>
      {/if}
      <p class="nhat">Sao lưu dữ liệu gần nhất: {build.saoLuuCuoiLuc ? gio(build.saoLuuCuoiLuc) : 'chưa có'}</p>
    {:else}<p class="nhat">Đang tải…</p>{/if}
  </section>
  <section class="the">
    <h2>Mail hôm nay</h2>
    {#if mail.length === 0}
      <p class="nhat">Chưa cấu hình nhà cung cấp mail. Vào <em>Cài đặt mail</em> để thêm.</p>
    {:else}
      <ul class="danh-sach">{#each mail as m}<li>{m.ten}: <strong>{m.daGui}</strong> / {m.gioiHan} thư</li>{/each}</ul>
    {/if}
  </section>
</div>
