<!-- Bảng tổng quan: số bài theo trạng thái, build, sao lưu (trong/ngoài VPS), ổ đĩa, mail hôm nay. -->
<script lang="ts">
  import { coQuyen } from '@vntraveltips/schema';
  import { onMount } from 'svelte';
  import { goiApi } from '../lib/api';
  import { bamLienKet, GOC } from '../lib/dieu-huong.svelte';
  import { phien, thongBaoLoi } from '../lib/phien.svelte';

  interface Tq {
    bai: { daDang: number; nhap: number; henGio: number; thungRac: number };
    build: { trangThai: 'roi' | 'dang-build'; dangCho: boolean; lanCuoi: { ok: boolean; luc?: string } | null; previewNoiDungPhien: number | null; productionNoiDungPhien: number | null };
    saoLuu: { trongVpsLuc: number | null; ngoaiVpsLuc: number | null; canhBao: boolean };
    oDia: { daDungByte: number; conTrongByte: number | null };
    mail: { id: number; ten: string; daGui: number; gioiHan: number }[];
    chuyenNhaCungCapGanNhat?: { luc: number; tu: string; den: string };
  }
  let tq = $state<Tq | null>(null);
  let loi = $state('');
  const gio = (ms: number) => new Date(ms).toLocaleString('vi-VN');
  const GB = (b: number) => `${(b / 1024 ** 3).toFixed(1)} GB`;
  // Bảng tổng quan (sao lưu, mail, build…) chỉ dành cho quản lý trở lên; người viết thấy lối tắt.
  let xemDuoc = $derived(phien.nguoiDung !== null && coQuyen(phien.nguoiDung, 'cau-truc.sua'));
  onMount(() => void (xemDuoc ? goiApi<Tq>('GET', '/tong-quan') : Promise.resolve(null))  .then((r) => (tq = r)).catch((e) => (loi = thongBaoLoi(e))));
</script>

<h1>Tổng quan</h1>
{#if loi}<p class="thong-bao-loi" role="alert">{loi}</p>{/if}
<p class="nhat">Xin chào <strong>{phien.nguoiDung?.ten}</strong> · {phien.nguoiDung?.email}</p>
{#if !xemDuoc}
  <section class="the">
    <p>Tài khoản người viết: bạn viết, đăng và quản lý bài của chính mình.</p>
    <div class="hang-nut"><a class="nut" href="{GOC}/bai/moi" onclick={bamLienKet}>＋ Viết bài mới</a><a class="nut" href="{GOC}/bai" onclick={bamLienKet}>Bài viết</a></div>
  </section>
{/if}
{#if tq}
  {#if tq.saoLuu.canhBao}
    <p class="thong-bao-loi" role="alert">
      {tq.saoLuu.ngoaiVpsLuc ? `Bản sao lưu ra ngoài VPS lần cuối ${gio(tq.saoLuu.ngoaiVpsLuc)} (quá 26 giờ).` : 'Chưa có bản sao lưu ra ngoài VPS.'} Hãy kiểm tra cron sao lưu (deploy/backup).
    </p>
  {/if}
  {#if tq.build.lanCuoi && !tq.build.lanCuoi.ok}<p class="thong-bao-loi" role="alert">Lần build gần nhất bị LỖI — site đang giữ bản cũ. Hãy kiểm tra nhật ký.</p>{/if}
  <div class="nhom">
    <section class="the">
      <h2>Bài viết</h2>
      <p><a href="{GOC}/bai" onclick={bamLienKet}>Đã đăng: <strong>{tq.bai.daDang}</strong></a><br />Nháp: <strong>{tq.bai.nhap}</strong> · Hẹn giờ: <strong>{tq.bai.henGio}</strong><br />
        <a href="{GOC}/thung-rac" onclick={bamLienKet}>Thùng rác: {tq.bai.thungRac}</a></p>
    </section>
    <section class="the">
      <h2>Site</h2>
      <p>Build: <strong>{tq.build.trangThai === 'dang-build' ? 'đang dựng…' : tq.build.dangCho ? 'đang chờ' : 'rảnh'}</strong></p>
      <p class="nhat">Bản đang chạy: nội dung #{tq.build.productionNoiDungPhien ?? '?'} · bản xem trước: #{tq.build.previewNoiDungPhien ?? '?'}</p>
    </section>
    <section class="the">
      <h2>Sao lưu</h2>
      <p class="nhat">Trong VPS: {tq.saoLuu.trongVpsLuc ? gio(tq.saoLuu.trongVpsLuc) : 'chưa có'}<br />Ngoài VPS: {tq.saoLuu.ngoaiVpsLuc ? gio(tq.saoLuu.ngoaiVpsLuc) : 'chưa có'}</p>
    </section>
    <section class="the">
      <h2>Ổ đĩa và ảnh</h2>
      <p>Ảnh: {GB(tq.oDia.daDungByte)}{tq.oDia.conTrongByte !== null ? ` · ổ còn trống ${GB(tq.oDia.conTrongByte)}` : ''}</p>
    </section>
    <section class="the">
      <h2>Mail hôm nay</h2>
      {#if tq.mail.length === 0}<p class="nhat">Chưa cấu hình nhà cung cấp mail.</p>{:else}
        <ul class="danh-sach">{#each tq.mail as m}<li>{m.ten}: <strong>{m.daGui}</strong> / {m.gioiHan}</li>{/each}</ul>
      {/if}
      {#if tq.chuyenNhaCungCapGanNhat}<p class="nhat">Lần tự chuyển gần nhất: {tq.chuyenNhaCungCapGanNhat.tu} → {tq.chuyenNhaCungCapGanNhat.den} ({gio(tq.chuyenNhaCungCapGanNhat.luc)})</p>{/if}
    </section>
  </div>
{/if}
