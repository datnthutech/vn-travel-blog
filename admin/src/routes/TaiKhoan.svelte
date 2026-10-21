<!-- Quản lý tài khoản (chỉ quản trị): mời người dùng, đổi vai trò, khoá/mở khoá, đặt lại 2FA. Không xoá cứng tài khoản. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { goiApi } from '../lib/api';
  import { phien, thongBaoLoi } from '../lib/phien.svelte';

  interface U { id: number; email: string; ten: string; vaiTro: 'quan-tri' | 'quan-ly' | 'writer'; biKhoa: boolean; coTotp: boolean; dangNhapCuoiLuc: number | null }
  const TEN: Record<string, string> = { 'quan-tri': 'Quản trị', 'quan-ly': 'Quản lý', writer: 'Người viết (writer)' };
  let ds = $state<U[]>([]);
  let email = $state('');
  let vaiTro = $state('writer');
  let loi = $state('');
  let ok = $state('');
  const gio = (ms: number | null) => (ms ? new Date(ms).toLocaleString('vi-VN') : 'chưa đăng nhập');
  const tai = async () => (ds = await goiApi<U[]>('GET', '/tai-khoan'));
  async function lam(viec: () => Promise<unknown>, thanhCong: string) {
    loi = '';
    ok = '';
    try {
      await viec();
      ok = thanhCong;
      await tai();
    } catch (e) {
      loi = thongBaoLoi(e);
    }
  }
  const moi = (e: SubmitEvent) => {
    e.preventDefault();
    return lam(async () => { await goiApi('POST', '/tai-khoan/moi', { email, vaiTro }); email = ''; }, 'Đã gửi lời mời qua email (hiệu lực 48 giờ).');
  };
  const doiVaiTro = (u: U, v: string) => lam(() => goiApi('PUT', `/tai-khoan/${u.id}`, { vaiTro: v }), `Đã đổi vai trò của ${u.ten}.`);
  const khoa = (u: U) => confirm(`${u.biKhoa ? 'Mở khoá' : 'Khoá'} tài khoản ${u.ten}?${u.biKhoa ? '' : ' Họ bị đăng xuất ngay trên mọi thiết bị.'}`) && lam(() => goiApi('PUT', `/tai-khoan/${u.id}`, { biKhoa: !u.biKhoa }), u.biKhoa ? 'Đã mở khoá.' : 'Đã khoá.');
  const datLai2fa = (u: U) => confirm(`Đặt lại xác thực 2 lớp của ${u.ten}? Họ phải bật lại ở lần đăng nhập sau.`) && lam(() => goiApi('POST', `/tai-khoan/${u.id}/dat-lai-2fa`), 'Đã đặt lại 2FA.');
  onMount(() => void tai().catch((e) => (loi = thongBaoLoi(e))));
</script>

<h1>Tài khoản</h1>
{#if loi}<p class="thong-bao-loi" role="alert">{loi}</p>{/if}
{#if ok}<p class="thong-bao-ok" role="status">{ok}</p>{/if}

<form class="the" onsubmit={moi}>
  <h2>Mời người dùng</h2>
  <label for="moi-email">Email</label><input id="moi-email" type="email" required bind:value={email} />
  <label for="moi-vt">Vai trò</label>
  <select id="moi-vt" bind:value={vaiTro}>{#each Object.entries(TEN) as [v, t]}<option value={v}>{t}</option>{/each}</select>
  <p class="nhat">Quản trị: làm tất cả · Quản lý: mọi việc nội dung và cấu trúc, trừ cài đặt, tài khoản, nhật ký · Người viết: viết, đăng và quản lý bài của chính mình.</p>
  <div class="hang-nut"><button type="submit">Gửi lời mời</button></div>
</form>

<section class="the">
  <h2>Danh sách</h2>
  <ul class="danh-sach">
    {#each ds as u (u.id)}
      <li>
        <strong>{u.ten}</strong>{u.id === phien.nguoiDung?.id ? ' (bạn)' : ''}{u.biKhoa ? ' · ĐÃ KHOÁ' : ''}<br />
        <span class="nhat">{u.email} · 2FA: {u.coTotp ? 'đã bật' : 'chưa bật'} · đăng nhập gần nhất: {gio(u.dangNhapCuoiLuc)}</span>
        <label for="vt-{u.id}">Vai trò</label>
        <select id="vt-{u.id}" value={u.vaiTro} onchange={(e) => doiVaiTro(u, e.currentTarget.value)}>{#each Object.entries(TEN) as [v, t]}<option value={v}>{t}</option>{/each}</select>
        <div class="hang-nut">
          <button class={u.biKhoa ? '' : 'nguy'} onclick={() => khoa(u)}>{u.biKhoa ? 'Mở khoá' : 'Khoá'}</button>
          {#if u.id !== phien.nguoiDung?.id && u.coTotp}<button class="phu" onclick={() => datLai2fa(u)}>Đặt lại 2FA</button>{/if}
        </div>
      </li>
    {/each}
  </ul>
</section>
