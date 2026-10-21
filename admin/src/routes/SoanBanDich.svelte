<!-- Soạn bản dịch của một bài: bản gốc bên cạnh (máy tính hai cột; điện thoại bấm "Xem bản gốc"), Dịch bằng AI (chỉ điền, không lưu),
     cảnh báo AI, lưu, Review toàn màn hình, đăng/gỡ, "đã kiểm tra". -->
<script lang="ts">
  import { taoSlug } from '@vntraveltips/schema';
  import { onMount } from 'svelte';
  import { goiApi, LoiApi } from '../lib/api';
  import NutDichAi from '../lib/ban-dich/NutDichAi.svelte';
  import NutReview from '../lib/ban-dich/NutReview.svelte';
  import SoSanhGoc from '../lib/ban-dich/SoSanhGoc.svelte';
  import TabBanDich from '../lib/ban-dich/TabBanDich.svelte';
  import { bamLienKet, GOC } from '../lib/dieu-huong.svelte';
  import { thongBaoLoi } from '../lib/phien.svelte';

  let { id, ma }: { id: number; ma: string } = $props();

  interface Dich {
    tieuDe: string; slug: string; moTa: string; noiDung: string; anhBiaAlt: string;
    traNhanh?: { hopVoi: string; thoiGian: string; choO?: string; diChuyen: string; thoiDiemNenDi: string; luuYVoiBe: string[] };
    diaDiem: { ten: string; diaChi?: string; khoangGia?: string; gioMoCua?: string; thanThienVoiBe?: string; uuDiem: string[]; nhuocDiem: string[]; anhAlt: string[] }[];
    doMangChoBe: { ten: string; ghiChu?: string }[];
    faq: { hoi: string; dap: string }[];
  }
  type Goc = Omit<Dich, 'slug'> & { slug?: string };
  interface Doc {
    ngonNgu: string; banGoc: Goc | null; banGocDuDieuKien: boolean; trangThai: 'chua-dich' | 'nhap' | 'da-dang' | 'hen-gio'; dich: Dich | null; phienSo: number;
    cuHonBanGoc: boolean; daKiemTra: boolean; ghiChuKiemTra: string | null; nguoiKiemTra: { ten: string } | null; banVi: { trangThai: string; thungRac: boolean };
  }
  const TEN = { 'chua-dich': 'Chưa dịch', nhap: 'Nháp', 'da-dang': 'Đã đăng', 'hen-gio': 'Hẹn giờ' } as const;

  let doc = $state<Doc | null>(null);
  let f = $state<Dich | null>(null);
  let daTai = $state(false);
  let loi = $state('');
  let chiTietLoi = $state<string[]>([]);
  let thongBao = $state('');
  let canhBao = $state<string[]>([]);
  let dangBan = $state(false);
  let xemGoc = $state(false);
  let moc = ''; // ảnh chụp dữ liệu lần cuối đồng bộ với máy chủ: không đổi gì thì không lưu lại (giữ dấu "đã kiểm tra")

  const dong = (ds: string[]) => ds.join('\n');
  const tach = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);

  /** Khung bản dịch rỗng theo đúng cấu trúc bản gốc (cùng số địa điểm, ảnh, đồ mang). */
  function khungRong(g: Goc): Dich {
    return {
      tieuDe: '', slug: '', moTa: '', noiDung: '', anhBiaAlt: '',
      ...(g.traNhanh ? { traNhanh: { hopVoi: '', thoiGian: '', choO: g.traNhanh.choO !== undefined ? '' : undefined, diChuyen: '', thoiDiemNenDi: '', luuYVoiBe: g.traNhanh.luuYVoiBe.map(() => '') } } : {}),
      diaDiem: g.diaDiem.map((d) => ({ ten: '', diaChi: d.diaChi !== undefined ? '' : undefined, khoangGia: d.khoangGia !== undefined ? '' : undefined, gioMoCua: d.gioMoCua !== undefined ? '' : undefined, thanThienVoiBe: d.thanThienVoiBe !== undefined ? '' : undefined, uuDiem: d.uuDiem.map(() => ''), nhuocDiem: d.nhuocDiem.map(() => ''), anhAlt: d.anhAlt.map(() => '') })),
      doMangChoBe: g.doMangChoBe.map((x) => ({ ten: '', ghiChu: x.ghiChu !== undefined ? '' : undefined })),
      faq: g.faq.map(() => ({ hoi: '', dap: '' })),
    };
  }

  async function tai() {
    try {
      const r = await goiApi<Doc>('GET', `/bai/${id}/ban-dich/${ma}`);
      doc = r;
      f = r.dich ? ($state.snapshot(r.dich) as Dich) : r.banGoc ? khungRong(r.banGoc) : null;
      moc = r.dich && f ? JSON.stringify(sach()) : '';
    } catch (e) {
      loi = thongBaoLoi(e);
    } finally {
      daTai = true;
    }
  }
  onMount(() => void tai());

  /** Dữ liệu gửi máy chủ: bỏ khoá `undefined`. */
  const sach = () => JSON.parse(JSON.stringify($state.snapshot(f))) as Dich;

  function xuLy(e: unknown) {
    loi = e instanceof LoiApi ? e.loi : 'Có lỗi không xác định.';
    chiTietLoi = e instanceof LoiApi && Array.isArray(e.du.chiTiet) ? (e.du.chiTiet as string[]) : [];
  }
  const batDau = () => {
    loi = '';
    chiTietLoi = [];
    thongBao = '';
    dangBan = true;
  };

  async function luuThat(): Promise<boolean> {
    if (!f) return false;
    if (!f.slug && f.tieuDe) f.slug = taoSlug(f.tieuDe);
    if (doc && doc.phienSo > 0 && JSON.stringify(sach()) === moc) return true; // không có gì mới để lưu
    try {
      const r = await goiApi<{ phienSo: number }>('PUT', `/bai/${id}/ban-dich/${ma}`, { dich: sach(), ...(doc && doc.phienSo > 0 ? { phienSo: doc.phienSo } : {}) });
      if (doc) {
        doc.phienSo = r.phienSo;
        if (doc.trangThai === 'chua-dich') doc.trangThai = 'nhap';
        doc.daKiemTra = false; // lưu lại nội dung → máy chủ xoá dấu "đã kiểm tra"
        doc.cuHonBanGoc = false;
      }
      moc = JSON.stringify(sach());
      return true;
    } catch (e) {
      xuLy(e);
      return false;
    }
  }
  async function luu() {
    batDau();
    try {
      if (await luuThat()) thongBao = 'Đã lưu bản dịch.';
    } finally {
      dangBan = false;
    }
  }
  async function taiMeta() {
    const r = await goiApi<Doc>('GET', `/bai/${id}/ban-dich/${ma}`);
    if (doc) Object.assign(doc, { trangThai: r.trangThai, cuHonBanGoc: r.cuHonBanGoc, daKiemTra: r.daKiemTra, ghiChuKiemTra: r.ghiChuKiemTra, nguoiKiemTra: r.nguoiKiemTra, banVi: r.banVi, phienSo: r.phienSo });
  }
  async function lamRoiTai(ok: string, viec: () => Promise<unknown>, truocDo = true) {
    batDau();
    try {
      if (truocDo && !(await luuThat())) return;
      await viec();
      await taiMeta(); // chỉ làm mới trạng thái/dấu kiểm tra; KHÔNG nạp lại form (giữ nội dung đang gõ hoặc AI vừa điền)
      thongBao = ok;
    } catch (e) {
      xuLy(e);
    } finally {
      dangBan = false;
    }
  }
  const dang = () => lamRoiTai('Đã đăng bản dịch.', () => goiApi('POST', `/bai/${id}/ban-dich/${ma}/dang`));
  const go = () => lamRoiTai('Đã gỡ bản dịch về nháp.', () => goiApi('POST', `/bai/${id}/ban-dich/${ma}/go`), false);
  const kiemTra = (ghiChu: string) => lamRoiTai('Đã đánh dấu "đã kiểm tra".', () => goiApi('POST', `/bai/${id}/ban-dich/${ma}/kiem-tra`, { daKiemTra: true, ghiChu }), false);

  // AI chỉ ĐIỀN vào form (không gọi API lưu); người dùng xem cảnh báo rồi tự bấm Lưu.
  function dienKetQua(ketQua: Record<string, unknown>, cb: string[]) {
    if (!f) return;
    f = { ...f, ...(ketQua as Partial<Dich>) } as Dich;
    canhBao = cb;
    thongBao = 'AI đã điền bản dịch vào form — hãy đọc lại, sửa nếu cần rồi bấm Lưu (chưa lưu gì).';
  }

  // Review: lưu → chờ build xem trước xong → trả URL cho lớp phủ.
  async function xemTruoc(): Promise<string | null> {
    batDau();
    try {
      if (!f) return null;
      if (!f.slug && f.tieuDe) f.slug = taoSlug(f.tieuDe);
      const r = await goiApi<{ url: string; noiDungPhien: number; phienSo: number; hopLe: boolean; loi?: string[] }>('POST', `/bai/${id}/ban-dich/${ma}/xem-truoc`, { dich: sach(), ...(doc && doc.phienSo > 0 ? { phienSo: doc.phienSo } : {}) });
      if (doc) doc.phienSo = r.phienSo;
      if (!r.hopLe) {
        loi = 'Bản dịch còn thiếu/lệch cấu trúc so với bản gốc nên chưa dựng được trang xem trước:';
        chiTietLoi = r.loi ?? [];
        return null;
      }
      thongBao = 'Đang dựng bản xem trước…';
      for (let i = 0; i < 90; i++) {
        const b = await goiApi<{ previewNoiDungPhien: number | null; lanCuoi: { ok: boolean } | null; trangThai: string }>('GET', '/build');
        if ((b.previewNoiDungPhien ?? -1) >= r.noiDungPhien) {
          thongBao = 'Bản xem trước đã sẵn sàng.';
          return r.url;
        }
        if (b.trangThai === 'roi' && b.lanCuoi && !b.lanCuoi.ok) {
          loi = 'Dựng bản xem trước bị lỗi. Xem Tổng quan để biết chi tiết.';
          return null;
        }
        await new Promise((x) => setTimeout(x, 2000));
      }
      loi = 'Dựng lâu hơn dự kiến; thử lại sau ít phút.';
      return null;
    } catch (e) {
      xuLy(e);
      return null;
    } finally {
      dangBan = false;
    }
  }
</script>

<TabBanDich {id} hienTai={ma} />
<h1>Dịch bài sang {ma}</h1>

{#if !daTai}
  <p class="nhat">Đang tải…</p>
{:else}
  {#if loi}<p class="thong-bao-loi" role="alert">{loi}</p>{/if}
  {#each chiTietLoi as l}<p class="thong-bao-loi">{l}</p>{/each}
  {#if thongBao}<p class="thong-bao-ok" role="status">{thongBao}</p>{/if}

  {#if doc && f && doc.banGoc}
    <p>
      <strong>{TEN[doc.trangThai]}</strong>
      {#if doc.cuHonBanGoc}<span class="cu"> · Cũ hơn bản gốc — bản tiếng Việt đã đổi sau lần dịch này</span>{/if}
      {#if doc.daKiemTra}<span class="kt"> · Đã kiểm tra{doc.nguoiKiemTra ? ` bởi ${doc.nguoiKiemTra.ten}` : ''}{doc.ghiChuKiemTra ? ` — ${doc.ghiChuKiemTra}` : ''}</span>{/if}
      <a href="{GOC}/bai/{id}" onclick={bamLienKet}>← Về bản tiếng Việt</a>
    </p>
    {#if doc.banVi.trangThai !== 'da-dang'}<p class="nhat">Bản tiếng Việt chưa đăng nên chưa đăng được bản dịch.</p>{/if}

    {#if canhBao.length}
      <div class="the canh-bao" role="alert">
        <strong>AI dịch xong — cần đọc lại các điểm sau trước khi lưu:</strong>
        <ul>{#each canhBao as c}<li>{c}</li>{/each}</ul>
      </div>
    {/if}

    <div class="hang-nut"><NutDichAi baiId={id} ngonNgu={ma} khiCoKetQua={dienKetQua} nhan="Dịch cả bài bằng AI" />
      <button type="button" class="phu nut-goc" onclick={() => (xemGoc = !xemGoc)}>{xemGoc ? 'Ẩn bản gốc' : 'Xem bản gốc'}</button></div>

    <div class="hai-cot" class:hien-goc={xemGoc}>
      <div class="goc-cot"><SoSanhGoc goc={doc.banGoc as never} /></div>
      <div>
        <section class="the">
          <label for="bd-td">Tiêu đề <NutDichAi baiId={id} ngonNgu={ma} chiTruong="tieuDe" nhan="Dịch ô này" khiCoKetQua={dienKetQua} /></label>
          <input id="bd-td" type="text" bind:value={f.tieuDe} />
          <label for="bd-slug">Slug (đường dẫn — tự gợi ý từ tiêu đề khi lưu nếu để trống)</label>
          <input id="bd-slug" type="text" bind:value={f.slug} />
          <label for="bd-mt">Mô tả (120–160 ký tự, {[...f.moTa].length} hiện tại) <NutDichAi baiId={id} ngonNgu={ma} chiTruong="moTa" nhan="Dịch ô này" khiCoKetQua={dienKetQua} /></label>
          <textarea id="bd-mt" rows="3" bind:value={f.moTa}></textarea>
          <label for="bd-alt">Mô tả ảnh bìa <NutDichAi baiId={id} ngonNgu={ma} chiTruong="anhBiaAlt" nhan="Dịch ô này" khiCoKetQua={dienKetQua} /></label>
          <input id="bd-alt" type="text" bind:value={f.anhBiaAlt} />
        </section>

        {#if f.traNhanh}
          <section class="the">
            <h2>Tra nhanh</h2>
            <label for="tn-hv">Hợp với</label><input id="tn-hv" type="text" bind:value={f.traNhanh.hopVoi} />
            <label for="tn-tg">Thời gian</label><input id="tn-tg" type="text" bind:value={f.traNhanh.thoiGian} />
            {#if f.traNhanh.choO !== undefined}<label for="tn-co">Chỗ ở</label><input id="tn-co" type="text" bind:value={f.traNhanh.choO} />{/if}
            <label for="tn-dc">Di chuyển</label><input id="tn-dc" type="text" bind:value={f.traNhanh.diChuyen} />
            <label for="tn-td">Thời điểm nên đi</label><input id="tn-td" type="text" bind:value={f.traNhanh.thoiDiemNenDi} />
            {#each f.traNhanh.luuYVoiBe as _, i}<label for="tn-ly{i}">Lưu ý với bé #{i + 1}</label><input id="tn-ly{i}" type="text" bind:value={f.traNhanh.luuYVoiBe[i]} />{/each}
          </section>
        {/if}

        <section class="the">
          <h2>Nội dung <NutDichAi baiId={id} ngonNgu={ma} chiTruong="noiDung" nhan="Dịch ô này" khiCoKetQua={dienKetQua} /></h2>
          <p class="nhat">Giữ nguyên cú pháp ảnh ![mô tả](anh:MÃ) (chỉ dịch phần mô tả) và các link.</p>
          <textarea id="bd-nd" rows="18" aria-label="Nội dung bản dịch" bind:value={f.noiDung}></textarea>
        </section>

        {#each f.diaDiem as d, i}
          <section class="the">
            <h2>Địa điểm {i + 1}</h2>
            <label for="dd{i}-ten">Tên</label><input id="dd{i}-ten" type="text" bind:value={d.ten} />
            {#if d.diaChi !== undefined}<label for="dd{i}-dc">Địa chỉ</label><input id="dd{i}-dc" type="text" bind:value={d.diaChi} />{/if}
            {#if d.khoangGia !== undefined}<label for="dd{i}-g">Giá</label><input id="dd{i}-g" type="text" bind:value={d.khoangGia} />{/if}
            {#if d.gioMoCua !== undefined}<label for="dd{i}-gm">Giờ mở cửa</label><input id="dd{i}-gm" type="text" bind:value={d.gioMoCua} />{/if}
            {#if d.thanThienVoiBe !== undefined}<label for="dd{i}-tt">Với bé</label><input id="dd{i}-tt" type="text" bind:value={d.thanThienVoiBe} />{/if}
            {#if d.uuDiem.length}<label for="dd{i}-uu">Ưu điểm (mỗi dòng một ý, đúng {d.uuDiem.length} dòng)</label><textarea id="dd{i}-uu" rows={d.uuDiem.length + 1} value={dong(d.uuDiem)} oninput={(e) => (d.uuDiem = e.currentTarget.value.split('\n'))}></textarea>{/if}
            {#if d.nhuocDiem.length}<label for="dd{i}-nh">Nhược điểm (đúng {d.nhuocDiem.length} dòng)</label><textarea id="dd{i}-nh" rows={d.nhuocDiem.length + 1} value={dong(d.nhuocDiem)} oninput={(e) => (d.nhuocDiem = e.currentTarget.value.split('\n'))}></textarea>{/if}
            {#each d.anhAlt as _, j}<label for="dd{i}-a{j}">Mô tả ảnh {j + 1}</label><input id="dd{i}-a{j}" type="text" bind:value={d.anhAlt[j]} />{/each}
          </section>
        {/each}

        {#if f.doMangChoBe.length}
          <section class="the">
            <h2>Đồ nên mang cho bé</h2>
            {#each f.doMangChoBe as x, i}
              <label for="dm{i}">Tên #{i + 1}</label><input id="dm{i}" type="text" bind:value={x.ten} />
              {#if x.ghiChu !== undefined}<label for="dm{i}-gc">Ghi chú #{i + 1}</label><input id="dm{i}-gc" type="text" bind:value={x.ghiChu} />{/if}
            {/each}
          </section>
        {/if}

        {#if f.faq.length}
          <section class="the">
            <h2>Hỏi đáp</h2>
            {#each f.faq as q, i}
              <label for="fq{i}-h">Câu hỏi #{i + 1}</label><input id="fq{i}-h" type="text" bind:value={q.hoi} />
              <label for="fq{i}-d">Trả lời #{i + 1}</label><textarea id="fq{i}-d" rows="3" bind:value={q.dap}></textarea>
            {/each}
          </section>
        {/if}

        <div class="the thanh-nut">
          <div class="hang-nut">
            <button type="button" onclick={luu} disabled={dangBan}>Lưu</button>
            <NutReview {dangBan} khiXemTruoc={xemTruoc} khiDang={dang} khiKiemTra={kiemTra} daKiemTra={doc.daKiemTra} daDang={doc.trangThai === 'da-dang'} />
            {#if doc.trangThai === 'da-dang'}<button type="button" class="phu" onclick={go} disabled={dangBan}>Gỡ bản dịch</button>
            {:else}<button type="button" onclick={dang} disabled={dangBan || doc.banVi.trangThai !== 'da-dang'}>Đăng bản dịch</button>{/if}
            {#if doc.phienSo > 0 && !doc.daKiemTra}<button type="button" class="phu" onclick={() => kiemTra('')} disabled={dangBan}>Đánh dấu đã kiểm tra</button>{/if}
          </div>
        </div>
      </div>
    </div>
  {:else}
    <p class="nhat">Hoàn thiện bản tiếng Việt (đủ trường theo luật bài viết) trước khi dịch.</p>
    <p><a href="{GOC}/bai/{id}" onclick={bamLienKet}>← Về bản tiếng Việt</a></p>
  {/if}
{/if}

<style>
  .hai-cot { display: grid; grid-template-columns: 1fr; gap: 16px; }
  .goc-cot { display: none; }
  .hien-goc .goc-cot { display: block; }
  .nut-goc { display: inline-flex; }
  @media (min-width: 1000px) {
    .hai-cot { grid-template-columns: 1fr 1fr; }
    .goc-cot { display: block; position: sticky; top: 8px; align-self: start; max-height: 95vh; overflow: auto; }
    .nut-goc { display: none; }
  }
  .cu { color: #7a5b00; font-weight: 600; }
  .kt { color: var(--ok); }
  .canh-bao { border-color: #e0a800; background: #fff8e1; color: #4a3b00; }
  input, textarea { width: 100%; padding: 8px 12px; border: 1px solid var(--vien); border-radius: 8px; background: var(--nen); color: var(--chu); font: inherit; }
  label { display: block; margin-top: 8px; }
</style>
