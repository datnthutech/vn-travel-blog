<!-- Trang soạn bài: form có cấu trúc + trình soạn thảo thân bài + SEO + tự lưu + đăng/gỡ/hẹn giờ/thùng rác/nhân bản. -->
<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { goiApi, LoiApi } from '../lib/api';
  import { di, GOC } from '../lib/dieu-huong.svelte';
  import AnhBia from '../lib/form/AnhBia.svelte';
  import DiaDiemDs from '../lib/form/DiaDiem.svelte';
  import DoMangChoBe from '../lib/form/DoMangChoBe.svelte';
  import Faq from '../lib/form/Faq.svelte';
  import NutTrangThai from '../lib/form/NutTrangThai.svelte';
  import OSeo from '../lib/form/OSeo.svelte';
  import TraNhanhForm from '../lib/form/TraNhanh.svelte';
  import { baiTrong, gomLoi, LOAI_BAI, loiCua, traNhanhTrong, type BaiForm } from '../lib/kieu';
  import { phien } from '../lib/phien.svelte';
  import { goiTaiAnh } from '../lib/tai-anh';
  import { taoTuLuu, type TrangThaiTuLuu } from '../lib/tu-luu';
  import TrinhSoanThao from '../lib/soan-thao/TrinhSoanThao.svelte';

  let { idBanDau }: { idBanDau: number | null } = $props();

  // Component được tạo lại (#key) cho mỗi bài nên chỉ cần giá trị ban đầu của idBanDau.
  const idDau = untrack(() => idBanDau);
  let id = $state<number | null>(idDau);
  let daTai = $state(false);
  let bai = $state<BaiForm>(baiTrong());
  let noiDung = $state('');
  let trangThai = $state<'nhap' | 'da-dang' | 'hen-gio'>('nhap');
  let henGio = $state<string | undefined>();
  let thungRac = $state(false);
  let phienSo = $state(1);
  let tinhDs = $state<{ slug: string; ten: string }[]>([]);
  let chuyenMucDs = $state<{ slug: string; ten: string }[]>([]);
  let loiTruong = $state<Record<string, string[]>>({});
  let loiChung = $state('');
  let thongBao = $state('');
  let dangBan = $state(false);
  let tuLuuTT = $state<TrangThaiTuLuu | ''>('');
  let xungDot = $state<{ loi: string } | null>(null);
  let khoaLuu = $state(false);
  let banTuLuu = $state<{ bai: BaiForm; noiDung: string } | null>(null);
  let xemTruoc = $state({ dang: false, url: '', thongBao: '' });
  let trinh = $state<TrinhSoanThao>();
  let khoiTao = true;
  // Ảnh chụp dữ liệu lần cuối đã đồng bộ với máy chủ (nạp xong / lưu xong): chỉ tự lưu khi nội dung KHÁC mốc này.
  let moc = '';
  const datMoc = () => (moc = JSON.stringify(duLieu()));
  let banLocal = $state<{ bai: BaiForm; noiDung: string } | null>(null);
  const khoaLocal = `vtt-nhap-${idDau ?? 'moi'}`;

  let anhBaseUrl = $derived(phien.publicBaseUrl || location.origin);
  let canTraNhanh = $derived(bai.loai === 'nhat-ky' || bai.loai === 'review');

  const ngay = (v: unknown) => (typeof v === 'string' && v ? v.slice(0, 10) : undefined);
  function tuApi(b: Record<string, unknown>): BaiForm {
    const g = { ...baiTrong(), ...(b as object) } as BaiForm;
    g.anhBia = { ma: g.anhBia?.ma ?? '', alt: g.anhBia?.alt ?? '' };
    g.ngayDi = ngay(g.ngayDi);
    g.ngayDang = ngay(g.ngayDang);
    g.chuyenMuc ??= [];
    g.tags ??= [];
    g.diaDiem ??= [];
    g.doMangChoBe ??= [];
    g.faq ??= [];
    return g;
  }
  /** Dữ liệu gửi máy chủ: bỏ trường rỗng để nháp thiếu trường vẫn lưu được và bài đủ luật không bị rác. */
  function lamSach(b: BaiForm): Record<string, unknown> {
    const o: Record<string, unknown> = { ...$state.snapshot(b) };
    for (const k of ['tinh', 'ngayDi', 'ngayDang'] as const) if (!o[k]) delete o[k];
    if (!canTraNhanh) delete o.traNhanh;
    if (!(o.anhBia as { ma: string }).ma) delete o.anhBia;
    o.diaDiem = (o.diaDiem as BaiForm['diaDiem']).map((d) => ({ ...d, anh: d.anh.filter((a) => a.ma) }));
    return o;
  }
  const duLieu = () => ({ bai: lamSach(bai), noiDung });

  function napTuApi(r: Record<string, unknown>) {
    bai = tuApi(r.bai as Record<string, unknown>);
    if (canTraNhanh && !bai.traNhanh) bai.traNhanh = traNhanhTrong();
    noiDung = (r.noiDung as string) ?? '';
    trangThai = r.trangThai as typeof trangThai;
    henGio = typeof r.henGio === 'number' ? new Date(r.henGio + 7 * 3600_000).toISOString().slice(0, 16) : undefined;
    thungRac = r.thungRac === true;
    phienSo = r.phienSo as number;
    const bt = r.banNhapTuLuu as { bai: Record<string, unknown>; noiDung: string } | undefined;
    banTuLuu = bt ? { bai: tuApi(bt.bai), noiDung: bt.noiDung } : null;
    datMoc();
  }

  const tuLuu = taoTuLuu<{ bai: Record<string, unknown>; noiDung: string }>({
    khoa: khoaLocal,
    khiDoiTrangThai: (s) => (tuLuuTT = s),
    luu: async (dl) => {
      if (id === null) {
        if (typeof dl.bai.tieuDe !== 'string' || !dl.bai.tieuDe.trim()) return; // chưa có tiêu đề thì chưa tạo nháp
        const r = await goiApi<{ id: number; phienSo: number }>('POST', '/bai', dl);
        id = r.id;
        phienSo = r.phienSo;
        history.replaceState(null, '', `${GOC}/bai/${r.id}`);
      } else if (!khoaLuu) {
        await goiApi('PATCH', `/bai/${id}/tu-luu`, { ...dl, phienSo });
      }
    },
  });

  onMount(() => {
    void (async () => {
      try {
        [tinhDs, chuyenMucDs] = await Promise.all([
          goiApi<{ tinh: typeof tinhDs }>('GET', '/tinh').then((r) => r.tinh),
          goiApi<{ chuyenMuc: typeof chuyenMucDs }>('GET', '/chuyen-muc').then((r) => r.chuyenMuc),
        ]);
        if (id !== null) napTuApi(await goiApi<Record<string, unknown>>('GET', `/bai/${id}`));
        else if (canTraNhanh) bai.traNhanh = traNhanhTrong();
      } catch (e) {
        loiChung = e instanceof LoiApi ? e.loi : 'Không tải được bài.';
      } finally {
        daTai = true;
        try {
          const tho = localStorage.getItem(khoaLocal);
          if (tho) {
            const d = JSON.parse(tho) as { bai: Record<string, unknown>; noiDung: string };
            banLocal = { bai: tuApi(d.bai), noiDung: d.noiDung };
          }
        } catch {
          /* localStorage không dùng được: bỏ qua */
        }
        queueMicrotask(() => (khoiTao = false));
      }
    })();
    return () => void tuLuu.dungNgay();
  });

  // Mọi thay đổi → tự lưu (bỏ qua lần nạp ban đầu và khi đang khoá vì xung đột).
  $effect(() => {
    const dl = { bai: lamSach(bai), noiDung };
    if (!daTai || khoiTao || khoaLuu || thungRac || JSON.stringify(dl) === moc) return;
    tuLuu.doi(dl);
  });
  // Đổi loại bài sang nhật ký/review thì mở sẵn khối Tra nhanh.
  $effect(() => {
    if (canTraNhanh && !bai.traNhanh) bai.traNhanh = traNhanhTrong();
  });

  function xuLyLoi(e: unknown): void {
    if (e instanceof LoiApi) {
      if (e.status === 409 && typeof e.du.nguoiSua !== 'undefined') {
        xungDot = { loi: e.loi };
        khoaLuu = true;
        return;
      }
      loiTruong = gomLoi(e.du.chiTiet as string[] | undefined);
      loiChung = e.loi + (loiTruong._chung ? `: ${loiTruong._chung.join('; ')}` : '');
    } else loiChung = 'Có lỗi không xác định.';
  }
  const batDau = () => {
    loiTruong = {};
    loiChung = '';
    thongBao = '';
    dangBan = true;
  };

  /** Lưu chính thức (tạo phiên bản). Trả true nếu thành công. */
  async function luuThat(): Promise<boolean> {
    await tuLuu.dungNgay();
    try {
      if (id === null) {
        const r = await goiApi<{ id: number; phienSo: number }>('POST', '/bai', duLieu());
        id = r.id;
        phienSo = r.phienSo;
        history.replaceState(null, '', `${GOC}/bai/${r.id}`);
      } else {
        const r = await goiApi<{ phienSo: number }>('PUT', `/bai/${id}`, { ...duLieu(), phienSo });
        phienSo = r.phienSo;
      }
      datMoc();
      return true;
    } catch (e) {
      xuLyLoi(e);
      return false;
    }
  }

  async function luu() {
    batDau();
    try {
      if (await luuThat()) thongBao = 'Đã lưu.';
    } finally {
      dangBan = false;
    }
  }

  async function lamRoiTai(ten: string, thanhCong: string, thaoTac: () => Promise<unknown>, truocDo = true) {
    batDau();
    try {
      if (truocDo && !(await luuThat())) return;
      await thaoTac();
      napTuApi(await goiApi<Record<string, unknown>>('GET', `/bai/${id}`));
      thongBao = thanhCong;
    } catch (e) {
      xuLyLoi(e);
      if (!loiChung) loiChung = `Không ${ten} được.`;
    } finally {
      dangBan = false;
    }
  }
  const dang = () => lamRoiTai('đăng', 'Đã đăng bài.', () => goiApi('POST', `/bai/${id}/dang`));
  const go = () => lamRoiTai('gỡ', 'Đã gỡ bài về bản nháp.', () => goiApi('POST', `/bai/${id}/go`), false);
  const henGioDang = (luc: string) => lamRoiTai('hẹn giờ', `Đã hẹn giờ đăng lúc ${luc.replace('T', ' ')}.`, () => goiApi('POST', `/bai/${id}/hen-gio`, { luc }));
  const huyHen = () => lamRoiTai('huỷ hẹn giờ', 'Đã huỷ hẹn giờ.', () => goiApi('POST', `/bai/${id}/huy-hen-gio`), false);
  const khoiPhuc = () => lamRoiTai('khôi phục', 'Đã khôi phục bài.', () => goiApi('POST', `/bai/${id}/khoi-phuc`), false);
  async function thungRacBai() {
    if (!confirm('Chuyển bài vào thùng rác? Nếu bài đang đăng, nó sẽ bị gỡ khỏi site ở lần build sau.')) return;
    batDau();
    try {
      await goiApi('POST', `/bai/${id}/thung-rac`);
      di(`${GOC}/bai`);
    } catch (e) {
      xuLyLoi(e);
    } finally {
      dangBan = false;
    }
  }
  async function nhanBan() {
    batDau();
    try {
      await tuLuu.dungNgay();
      const r = await goiApi<{ id: number }>('POST', `/bai/${id}/nhan-ban`);
      di(`${GOC}/bai/${r.id}`);
      location.reload();
    } catch (e) {
      xuLyLoi(e);
    } finally {
      dangBan = false;
    }
  }

  // Xem trước: lưu → chờ build xong (previewNoiDungPhien ≥ noiDungPhien) → mở tab mới.
  async function xemTruocBai() {
    batDau();
    xemTruoc = { dang: true, url: '', thongBao: 'Đang lưu và dựng bản xem trước…' };
    try {
      await tuLuu.dungNgay();
      if (id === null && !(await luuThat())) return void (xemTruoc = { dang: false, url: '', thongBao: '' });
      const r = await goiApi<{ url: string; noiDungPhien: number; phienSo: number; hopLe: boolean; loi?: string[] }>('POST', `/bai/${id}/xem-truoc`, { ...duLieu(), phienSo });
      phienSo = r.phienSo;
      if (!r.hopLe) {
        loiTruong = gomLoi(r.loi);
        xemTruoc = { dang: false, url: '', thongBao: 'Bài còn thiếu thông tin nên chưa dựng được trang xem trước — xem các ô báo lỗi.' };
        return;
      }
      for (let i = 0; i < 90; i++) {
        const b = await goiApi<{ previewNoiDungPhien: number | null; lanCuoi: { ok: boolean } | null; trangThai: string }>('GET', '/build');
        if ((b.previewNoiDungPhien ?? -1) >= r.noiDungPhien) {
          xemTruoc = { dang: false, url: r.url, thongBao: 'Bản xem trước đã sẵn sàng.' };
          window.open(r.url, '_blank', 'noopener');
          return;
        }
        if (b.trangThai === 'roi' && b.lanCuoi && !b.lanCuoi.ok) {
          xemTruoc = { dang: false, url: '', thongBao: 'Dựng bản xem trước bị lỗi. Xem Tổng quan để biết chi tiết.' };
          return;
        }
        await new Promise((x) => setTimeout(x, 2000));
      }
      xemTruoc = { dang: false, url: r.url, thongBao: 'Dựng lâu hơn dự kiến; thử mở sau ít phút.' };
    } catch (e) {
      xemTruoc = { dang: false, url: '', thongBao: '' };
      xuLyLoi(e);
    } finally {
      dangBan = false;
      xemTruoc.dang = false;
    }
  }

  async function taiAnhVaChen(files: File[]) {
    loiChung = '';
    try {
      const kq = await goiTaiAnh(files);
      for (const a of kq.ok) trinh?.chenAnh(a.ma, '');
      if (kq.ok.length) thongBao = `Đã chèn ${kq.ok.length} ảnh — nhớ điền mô tả (alt) cho từng ảnh trong Markdown thô nếu cần.`;
      for (const l of kq.loi) loiChung += `${l.ten}: ${l.loi} `;
    } catch (e) {
      loiChung = e instanceof LoiApi ? e.loi : 'Không tải được ảnh.';
    }
  }

  async function taiBanMoi() {
    xungDot = null;
    khoaLuu = false;
    napTuApi(await goiApi<Record<string, unknown>>('GET', `/bai/${id}`));
  }
  const dungBanLocal = () => {
    if (!banLocal) return;
    bai = banLocal.bai;
    noiDung = banLocal.noiDung;
    boBanLocal();
  };
  const boBanLocal = () => {
    banLocal = null;
    try {
      localStorage.removeItem(khoaLocal);
    } catch {
      /* bỏ qua */
    }
  };
  const dungBanTuLuu = () => {
    if (!banTuLuu) return;
    bai = banTuLuu.bai;
    noiDung = banTuLuu.noiDung;
    banTuLuu = null;
  };
  async function chepBanCuaToi() {
    try {
      await navigator.clipboard.writeText(`${bai.tieuDe}\n\n${noiDung}`);
      thongBao = 'Đã chép tiêu đề và nội dung của bạn vào bộ nhớ tạm.';
    } catch {
      thongBao = 'Không chép tự động được — hãy bôi đen và chép thủ công.';
    }
  }
  const them = (k: 'chuyenMuc', ma: string) => (bai[k] = bai[k].includes(ma) ? bai[k].filter((x) => x !== ma) : [...bai[k], ma]);
  const loiNhom = (k: string) => loiCua(loiTruong, k);
</script>

<h1>{id === null ? 'Viết bài mới' : 'Sửa bài'}</h1>

{#if !daTai}
  <p class="nhat">Đang tải…</p>
{:else}
  {#if loiChung}<p class="thong-bao-loi" role="alert">{loiChung}</p>{/if}
  {#if thongBao}<p class="thong-bao-ok" role="status">{thongBao}</p>{/if}

  {#if banLocal}
    <div class="the" role="status">
      <p>Lần trước có thay đổi chưa lưu được lên máy chủ (mất mạng?). Khôi phục lại chúng?</p>
      <div class="hang-nut"><button type="button" onclick={dungBanLocal}>Khôi phục bản chưa lưu</button><button type="button" class="phu" onclick={boBanLocal}>Bỏ qua</button></div>
    </div>
  {/if}

  {#if banTuLuu}
    <div class="the" role="status">
      <p>Có bản tự lưu mới hơn bản đã lưu chính thức.</p>
      <div class="hang-nut"><button type="button" onclick={dungBanTuLuu}>Dùng bản tự lưu</button><button type="button" class="phu" onclick={() => (banTuLuu = null)}>Bỏ qua</button></div>
    </div>
  {/if}

  {#if xungDot}
    <div class="hop-xung-dot" role="alertdialog" aria-modal="true" aria-label="Xung đột khi lưu">
      <div class="the">
        <h2>Bài vừa được người khác sửa</h2>
        <p>{xungDot.loi}</p>
        <div class="hang-nut">
          <button type="button" onclick={taiBanMoi}>Tải bản mới</button>
          <button type="button" class="phu" onclick={() => { xungDot = null; void chepBanCuaToi(); }}>Giữ bản của tôi để chép</button>
        </div>
      </div>
    </div>
  {/if}
  {#if khoaLuu && !xungDot}
    <p class="thong-bao-loi">Đang giữ bản của bạn chưa lưu: hãy chép phần cần giữ, rồi <button type="button" class="phu" onclick={taiBanMoi}>Tải bản mới</button> để tiếp tục sửa (nút Lưu đang bị khoá để không ghi đè người khác).</p>
  {/if}

  <section class="the">
    <label for="tieu-de">Tiêu đề</label>
    <input id="tieu-de" type="text" bind:value={bai.tieuDe} disabled={thungRac} />
    {#each loiTruong.tieuDe ?? [] as l}<p class="thong-bao-loi">{l}</p>{/each}
    <label for="loai">Loại bài</label>
    <select id="loai" bind:value={bai.loai} disabled={thungRac}>{#each LOAI_BAI as l}<option value={l.ma}>{l.ten}</option>{/each}</select>
    <label for="tinh">Tỉnh</label>
    <select id="tinh" bind:value={bai.tinh} disabled={thungRac}>
      <option value={undefined}>Không thuộc tỉnh nào (kinh nghiệm chung)</option>
      {#each tinhDs as t}<option value={t.slug}>{t.ten}</option>{/each}
    </select>
    <fieldset>
      <legend>Chuyên mục</legend>
      {#each chuyenMucDs as c}<label class="hang-chon"><input type="checkbox" checked={bai.chuyenMuc.includes(c.slug)} onchange={() => them('chuyenMuc', c.slug)} /> {c.ten}</label>{/each}
    </fieldset>
    <label for="tags">Tag (cách nhau bằng dấu phẩy)</label>
    <input id="tags" type="text" value={bai.tags.join(', ')} oninput={(e) => (bai.tags = e.currentTarget.value.split(',').map((s) => s.trim()).filter(Boolean))} />
    <label for="ngay-di">Ngày đi (nên điền với nhật ký)</label><input id="ngay-di" type="date" bind:value={bai.ngayDi} />
    <label for="ngay-dang">Ngày đăng (để trống = ngày bấm Đăng)</label><input id="ngay-dang" type="date" bind:value={bai.ngayDang} />
    <label class="hang-chon"><input type="checkbox" bind:checked={bai.hopTac} /> Bài hợp tác / có tài trợ (hiện dòng tiết lộ)</label>
    <AnhBia bind:anh={bai.anhBia} {anhBaseUrl} loi={loiNhom('anhBia')} />
  </section>

  {#if canTraNhanh && bai.traNhanh}<TraNhanhForm bind:v={bai.traNhanh} loi={loiTruong} />{/if}
  {#each loiTruong.traNhanh ?? [] as l}<p class="thong-bao-loi">{l}</p>{/each}

  <section class="the">
    <h2>Nội dung bài</h2>
    <TrinhSoanThao bind:this={trinh} bind:markdown={noiDung} {anhBaseUrl} onChenAnh={taiAnhVaChen} disabled={thungRac} />
    {#each loiTruong._chung ?? [] as l}<p class="thong-bao-loi">{l}</p>{/each}
  </section>

  <DiaDiemDs bind:ds={bai.diaDiem} {anhBaseUrl} loi={loiTruong} />
  <DoMangChoBe bind:ds={bai.doMangChoBe} />
  <Faq bind:ds={bai.faq} />
  <OSeo tieuDe={bai.tieuDe} bind:slug={bai.slug} bind:moTa={bai.moTa} tinh={bai.tinh} publicBaseUrl={anhBaseUrl} slugDaDang={trangThai === 'da-dang'} loi={loiTruong} />

  {#if id !== null}
    <p class="nhat"><a href="{GOC}/bai/{id}/lich-su">Xem lịch sử phiên bản</a></p>
    <NutTrangThai {trangThai} {henGio} {thungRac} {dangBan} tuLuu={tuLuuTT} {xemTruoc}
      khiLuu={luu} khiXemTruoc={xemTruocBai} khiDang={dang} khiGo={go} khiHenGio={henGioDang} khiHuyHen={huyHen}
      khiThungRac={thungRacBai} khiNhanBan={nhanBan} khiKhoiPhuc={khoiPhuc} />
  {:else}
    <div class="hang-nut"><button type="button" onclick={luu} disabled={dangBan || !bai.tieuDe.trim()}>Lưu nháp</button></div>
    <p class="nhat">Bài sẽ tự lưu nháp sau khi bạn nhập tiêu đề.</p>
  {/if}
{/if}

<style>
  .hop-xung-dot { position: fixed; inset: 0; background: rgba(0, 0, 0, .6); z-index: 30; display: grid; place-items: center; padding: 16px; }
  .hop-xung-dot .the { max-width: 460px; }
  fieldset { border: 1px solid var(--vien); border-radius: 8px; margin: 12px 0; }
</style>
