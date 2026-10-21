<!-- Soạn trang tĩnh: tiêu đề, mô tả, thân bài (trình soạn thảo như bài), tự lưu, đăng/gỡ, xoá. -->
<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { goiApi, LoiApi } from '../lib/api';
  import { di, GOC } from '../lib/dieu-huong.svelte';
  import TrinhSoanThao from '../lib/soan-thao/TrinhSoanThao.svelte';
  import { phien } from '../lib/phien.svelte';
  import { taoTuLuu, type TrangThaiTuLuu } from '../lib/tu-luu';

  let { slug }: { slug: string } = $props();
  const slugDau = untrack(() => slug);
  interface T { slug: string; tieuDe: string; moTa: string; noiDung: string; trangThai: 'nhap' | 'da-dang'; coDinh: boolean; phienSo: number; nhapTuLuu: { tieuDe: string; moTa: string; noiDung: string } | null }
  let t = $state<T | null>(null);
  let tieuDe = $state('');
  let moTa = $state('');
  let noiDung = $state('');
  let loi = $state('');
  let ok = $state('');
  let tuLuuTT = $state<TrangThaiTuLuu | ''>('');
  let xungDot = $state('');
  let moc = '';
  let khoiTao = true;
  let anhBaseUrl = $derived(phien.publicBaseUrl || location.origin);

  const dl = () => ({ tieuDe, moTa, noiDung });
  const nap = (x: T) => {
    t = x;
    tieuDe = x.tieuDe;
    moTa = x.moTa;
    noiDung = x.noiDung;
    moc = JSON.stringify(dl());
  };
  const tuLuu = taoTuLuu<{ tieuDe: string; moTa: string; noiDung: string }>({
    khoa: `vtt-trang-${slugDau}`,
    khiDoiTrangThai: (s) => (tuLuuTT = s),
    luu: async (d) => {
      if (t && !xungDot) await goiApi('PATCH', `/trang/${slugDau}/tu-luu`, { ...d, phienSo: t.phienSo });
    },
  });
  onMount(() => {
    void goiApi<T>('GET', `/trang/${slugDau}`).then((x) => { nap(x); queueMicrotask(() => (khoiTao = false)); }).catch((e) => (loi = e instanceof LoiApi ? e.loi : 'Không tải được trang.'));
    return () => void tuLuu.dungNgay();
  });
  $effect(() => {
    const d = { tieuDe, moTa, noiDung };
    if (!t || khoiTao || xungDot || JSON.stringify(d) === moc) return;
    tuLuu.doi(d);
  });

  async function lam(viec: () => Promise<unknown>, thanhCong: string, taiLai = true) {
    loi = '';
    ok = '';
    try {
      await tuLuu.dungNgay();
      await viec();
      if (taiLai) nap(await goiApi<T>('GET', `/trang/${t?.slug ?? slugDau}`));
      ok = thanhCong;
    } catch (e) {
      if (e instanceof LoiApi && e.status === 409 && e.du.nguoiSua !== undefined) xungDot = e.loi;
      else loi = e instanceof LoiApi ? e.loi : 'Có lỗi, hãy thử lại.';
    }
  }
  const luu = () => lam(() => goiApi('PUT', `/trang/${t!.slug}`, { ...dl(), phienSo: t!.phienSo }), 'Đã lưu.');
  const dang = () => lam(async () => { await goiApi('PUT', `/trang/${t!.slug}`, { ...dl(), phienSo: t!.phienSo }); await goiApi('POST', `/trang/${t!.slug}/dang`); }, 'Đã đăng trang.');
  const go = () => lam(() => goiApi('POST', `/trang/${t!.slug}/go`), 'Đã gỡ về bản nháp.');
  const xoa = () => confirm('Xoá trang này? Không hoàn tác được.') && lam(async () => { await goiApi('DELETE', `/trang/${t!.slug}`); di(`${GOC}/trang`); }, 'Đã xoá.', false);
  const taiBanMoi = async () => { xungDot = ''; nap(await goiApi<T>('GET', `/trang/${t!.slug}`)); };
</script>

<h1>Soạn trang</h1>
{#if loi}<p class="thong-bao-loi" role="alert">{loi}</p>{/if}
{#if ok}<p class="thong-bao-ok" role="status">{ok}</p>{/if}
{#if xungDot}
  <div class="the" role="alertdialog"><p>{xungDot}</p><div class="hang-nut"><button onclick={taiBanMoi}>Tải bản mới</button></div></div>
{/if}
{#if t}
  <p class="nhat">{t.coDinh ? `Trang cố định /${t.slug}/` : `/trang/${t.slug}/`} · {t.trangThai === 'da-dang' ? 'đã đăng' : 'bản nháp'}
    {#if tuLuuTT === 'da-luu'} · đã tự lưu{:else if tuLuuTT === 'loi'} · chưa lưu được, sẽ thử lại{/if}</p>
  <section class="the">
    <label for="tt-tieu-de">Tiêu đề</label><input id="tt-tieu-de" type="text" bind:value={tieuDe} />
    <label for="tt-mo-ta">Mô tả (SEO)</label><input id="tt-mo-ta" type="text" bind:value={moTa} />
  </section>
  <section class="the"><TrinhSoanThao bind:markdown={noiDung} {anhBaseUrl} /></section>
  <div class="the hang-nut">
    <button onclick={luu}>Lưu</button>
    {#if t.trangThai === 'nhap'}<button onclick={dang}>Đăng</button>{:else if !t.coDinh}<button class="phu" onclick={go}>Gỡ</button>{/if}
    {#if !t.coDinh}<button class="nguy" onclick={xoa}>Xoá trang</button>{/if}
  </div>
{/if}
