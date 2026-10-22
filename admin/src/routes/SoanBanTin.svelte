<!-- Soạn một bản tin: sửa tiêu đề/nội dung khi còn nháp, gửi thử cho chính mình, gửi cho người đăng ký (bằng tay), xem tiến độ. -->
<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { goiApi } from '../lib/api';
  import { bamLienKet, GOC } from '../lib/dieu-huong.svelte';
  import { thongBaoLoi } from '../lib/phien.svelte';

  let { id }: { id: number } = $props();
  interface TienDo { tong: number; daGui: number; dangCho: number; boQua: number; loi: number; trangThai: 'nhap' | 'dang-gui' | 'da-gui' }
  interface B { id: number; tieuDe: string; noiDung: string; ngonNgu: string; trangThai: 'nhap' | 'dang-gui' | 'da-gui'; tienDo?: TienDo }
  let tieuDe = $state('');
  let noiDung = $state('');
  let ngonNgu = $state('vi');
  let trangThai = $state<B['trangThai']>('nhap');
  let td = $state<TienDo | null>(null);
  let loi = $state('');
  let ok = $state('');
  let ban = $state(false);
  let dat: ReturnType<typeof setInterval> | undefined;
  const khoa = $derived(trangThai !== 'nhap');

  async function taiTienDo() {
    try {
      td = await goiApi<TienDo>('GET', `/ban-tin/${id}/tien-do`);
      trangThai = td.trangThai;
      if (td.trangThai === 'da-gui' && dat) (clearInterval(dat), (dat = undefined));
    } catch (e) {
      loi = thongBaoLoi(e);
    }
  }
  const theoDoi = () => {
    void taiTienDo();
    dat ??= setInterval(() => void taiTienDo(), 10_000);
  };
  async function lam(viec: () => Promise<string | void>) {
    ban = true;
    loi = '';
    ok = '';
    try {
      ok = (await viec()) ?? '';
    } catch (e) {
      loi = thongBaoLoi(e);
    }
    ban = false;
  }
  const luu = () => lam(async () => { await goiApi('PUT', `/ban-tin/${id}`, { tieuDe, noiDung, ngonNgu }); return 'Đã lưu.'; });
  const guiThu = () => lam(async () => {
    await goiApi('PUT', `/ban-tin/${id}`, { tieuDe, noiDung, ngonNgu });
    const r = await goiApi<{ den: string }>('POST', `/ban-tin/${id}/gui-thu`);
    return `Đã xếp thư thử gửi tới ${r.den} (vài chục giây sau sẽ đến).`;
  });
  const gui = () =>
    confirm('Gửi bản tin này cho TẤT CẢ người đã xác nhận (cùng ngôn ngữ)? Không thu hồi được.') &&
    lam(async () => {
      await goiApi('PUT', `/ban-tin/${id}`, { tieuDe, noiDung, ngonNgu });
      const r = await goiApi<{ soNguoiNhan: number }>('POST', `/ban-tin/${id}/gui`);
      trangThai = 'dang-gui';
      theoDoi();
      return `Đã xếp hàng gửi cho ${r.soNguoiNhan} người. Mail đi dần theo hạn mức trong ngày; phần chưa gửi hết sẽ tự gửi tiếp hôm sau.`;
    });

  onMount(() =>
    void (async () => {
      try {
        const ds = (await goiApi<{ banTin: B[] }>('GET', '/ban-tin')).banTin;
        const b = ds.find((x) => x.id === id);
        if (!b) return void (loi = 'Không tìm thấy bản tin.');
        ({ tieuDe, noiDung, ngonNgu, trangThai } = b);
        if (b.trangThai !== 'nhap') theoDoi();
      } catch (e) {
        loi = thongBaoLoi(e);
      }
    })(),
  );
  onDestroy(() => dat && clearInterval(dat));
</script>

<p><a href="{GOC}/ban-tin" onclick={bamLienKet}>← Bản tin</a></p>
<h1>Soạn bản tin</h1>
{#if loi}<p class="thong-bao-loi" role="alert">{loi}</p>{/if}
{#if ok}<p class="thong-bao-ok" role="status">{ok}</p>{/if}
{#if khoa}<p class="nhat">Bản tin đã gửi (hoặc đang gửi) nên không sửa được nữa.</p>{/if}
<section class="the">
  <label for="bt-td">Tiêu đề thư</label>
  <input id="bt-td" type="text" maxlength="150" bind:value={tieuDe} disabled={khoa} />
  <label for="bt-nn">Ngôn ngữ (chỉ gửi người đăng ký cùng ngôn ngữ)</label>
  <input id="bt-nn" type="text" maxlength="8" bind:value={ngonNgu} disabled={khoa} />
  <label for="bt-nd">Nội dung (đoạn cách nhau một dòng trống; dòng chỉ có link ảnh sẽ hiện ảnh; link tự bấm được)</label>
  <textarea id="bt-nd" rows="14" maxlength="20000" bind:value={noiDung} disabled={khoa}></textarea>
  {#if !khoa}
    <div class="hang-nut">
      <button class="phu" onclick={luu} disabled={ban}>Lưu nháp</button>
      <button class="phu" onclick={guiThu} disabled={ban}>Gửi thử cho tôi</button>
      <button onclick={gui} disabled={ban}>Gửi cho người đăng ký</button>
    </div>
  {/if}
</section>
{#if td}
  <section class="the">
    <h2>Tiến độ</h2>
    <p>Đã gửi <strong>{td.daGui}</strong> / {td.tong} · đang chờ {td.dangCho}{td.loi ? ` (trong đó ${td.loi} mail lần thử gần nhất bị lỗi)` : ''}{td.boQua ? ` · bỏ qua ${td.boQua} (người đã huỷ)` : ''}</p>
    {#if td.dangCho > 0}<p class="nhat">Phần chờ sẽ tự gửi khi còn hạn mức; qua 0 giờ (giờ Việt Nam) hạn mức được làm mới.</p>{/if}
  </section>
{/if}

<style>
  input, textarea { width: 100%; padding: 8px 12px; border: 1px solid var(--vien); border-radius: 8px; background: var(--nen); color: var(--chu); font: inherit; }
</style>
