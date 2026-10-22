<!-- Cài đặt site: tên, mô tả, logo/favicon/ảnh chia sẻ, mạng xã hội, cho phép Google lập chỉ mục, GoatCounter, quảng cáo. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { goiApi, LoiApi } from '../lib/api';
  import AnhBia from '../lib/form/AnhBia.svelte';
  import { phien, thongBaoLoi } from '../lib/phien.svelte';

  const VI_TRI = [{ v: 'sau-tra-nhanh', t: 'Sau khối Tra nhanh' }, { v: 'giua-bai', t: 'Giữa bài' }, { v: 'cuoi-bai', t: 'Cuối bài' }];
  interface Anh { ma: string; alt: string }
  let cd = $state<Record<string, unknown> | null>(null);
  let tenSite = $state('');
  let moTa = $state('');
  let logo = $state<Anh>({ ma: '', alt: '' });
  let favicon = $state<Anh>({ ma: '', alt: '' });
  let chiaSe = $state<Anh>({ ma: '', alt: '' });
  let mxh = $state({ facebook: '', instagram: '', tiktok: '', youtube: '' });
  let lapChiMuc = $state(false);
  let gc = $state('');
  let qcBat = $state(false);
  let qcViTri = $state<string[]>([]);
  let affiliate = $state('');
  let blBat = $state(false);
  let tuCam = $state('');
  let loi = $state('');
  let ok = $state('');
  let anhBaseUrl = $derived(phien.publicBaseUrl || location.origin);

  onMount(() =>
    void goiApi<Record<string, any>>('GET', '/cai-dat/site')
      .then((c) => {
        cd = c;
        tenSite = c.tenSite;
        moTa = c.moTaMacDinh;
        logo = { ma: c.logo?.ma ?? '', alt: 'Logo' };
        favicon = { ma: c.favicon?.ma ?? '', alt: 'Favicon' };
        chiaSe = c.anhChiaSeMacDinh ?? { ma: '', alt: '' };
        mxh = { facebook: c.mangXaHoi?.facebook ?? '', instagram: c.mangXaHoi?.instagram ?? '', tiktok: c.mangXaHoi?.tiktok ?? '', youtube: c.mangXaHoi?.youtube ?? '' };
        lapChiMuc = c.choPhepLapChiMuc;
        gc = c.goatcounterCode ?? '';
        qcBat = c.quangCao?.bat ?? false;
        qcViTri = c.quangCao?.viTri ?? [];
        affiliate = c.affiliateMacDinh ?? '';
        blBat = c.binhLuan?.bat ?? false;
        tuCam = (c.binhLuan?.tuCam ?? []).join('\n');
      })
      .catch((e) => (loi = thongBaoLoi(e))),
  );

  async function luu(e: SubmitEvent) {
    e.preventDefault();
    loi = '';
    ok = '';
    const co = (a: Anh) => (a.ma ? { ma: a.ma } : undefined);
    const body = {
      tenSite, moTaMacDinh: moTa, logo: co(logo), favicon: co(favicon), anhChiaSeMacDinh: chiaSe.ma ? chiaSe : undefined,
      mangXaHoi: Object.fromEntries(Object.entries(mxh).filter(([, v]) => v.trim()).map(([k, v]) => [k, v.trim()])),
      choPhepLapChiMuc: lapChiMuc, goatcounterCode: gc.trim() || undefined,
      quangCao: { bat: qcBat, viTri: qcViTri },
      binhLuan: { bat: blBat, tuCam: tuCam.split('\n').map((x) => x.trim()).filter(Boolean) }, affiliateMacDinh: affiliate || undefined, muiGio: 'Asia/Ho_Chi_Minh',
    };
    try {
      await goiApi('PUT', '/cai-dat/site', body);
      ok = 'Đã lưu. Thay đổi lên site sau khi build xong (vài phút).';
    } catch (e) {
      loi = e instanceof LoiApi && Array.isArray(e.du.chiTiet) ? `${e.loi}: ${(e.du.chiTiet as string[]).join('; ')}` : thongBaoLoi(e);
    }
  }
  const batTatViTri = (v: string) => (qcViTri = qcViTri.includes(v) ? qcViTri.filter((x) => x !== v) : [...qcViTri, v]);
</script>

<h1>Cài đặt site</h1>
{#if loi}<p class="thong-bao-loi" role="alert">{loi}</p>{/if}
{#if ok}<p class="thong-bao-ok" role="status">{ok}</p>{/if}
{#if cd}
  <form onsubmit={luu}>
    <section class="the">
      <h2>Thông tin chung</h2>
      <label for="cd-ten">Tên site</label><input id="cd-ten" type="text" required bind:value={tenSite} />
      <label for="cd-mota">Mô tả mặc định (trang không có mô tả riêng)</label><input id="cd-mota" type="text" required bind:value={moTa} />
      <AnhBia bind:anh={logo} {anhBaseUrl} nhan="Logo (tuỳ chọn)" />
      <AnhBia bind:anh={favicon} {anhBaseUrl} nhan="Favicon (dùng bản 480px của ảnh)" />
      <AnhBia bind:anh={chiaSe} {anhBaseUrl} nhan="Ảnh chia sẻ mặc định (Facebook, Zalo…)" />
    </section>
    <section class="the">
      <h2>Mạng xã hội (địa chỉ https://…)</h2>
      {#each Object.keys(mxh) as k}
        <label for="mxh-{k}">{k}</label><input id="mxh-{k}" type="text" inputmode="url" bind:value={mxh[k as keyof typeof mxh]} />
      {/each}
    </section>
    <section class="the">
      <h2>Google và thống kê</h2>
      <label class="hang-chon"><input type="checkbox" bind:checked={lapChiMuc} /> Cho phép Google lập chỉ mục site</label>
      {#if !lapChiMuc}<p class="thong-bao-loi">Đang CHẶN Google (noindex): site chưa xuất hiện trên tìm kiếm. Bật khi bạn sẵn sàng; bản xem trước luôn bị chặn.</p>{/if}
      <label for="cd-gc">Mã GoatCounter (đếm lượt xem không cookie; để trống nếu chưa dùng)</label><input id="cd-gc" type="text" bind:value={gc} />
    </section>
    <section class="the">
      <h2>Quảng cáo và liên kết</h2>
      <label class="hang-chon"><input type="checkbox" bind:checked={qcBat} /> Bật quảng cáo (cần điền mã AdSense trong cấu hình site)</label>
      {#each VI_TRI as p}<label class="hang-chon"><input type="checkbox" checked={qcViTri.includes(p.v)} onchange={() => batTatViTri(p.v)} /> {p.t}</label>{/each}
      <label for="cd-aff">Nơi đặt phòng/vé mặc định cho link affiliate</label>
      <select id="cd-aff" bind:value={affiliate}><option value="">Không đặt mặc định</option><option value="agoda">Agoda</option><option value="klook">Klook</option><option value="traveloka">Traveloka</option><option value="booking">Booking</option></select>
    </section>
    <section class="the">
      <h2>Bình luận của người đọc</h2>
      <label class="hang-chon"><input type="checkbox" bind:checked={blBat} /> Cho phép người đọc bình luận (tên + email, hiện ngay)</label>
      <p class="nhat">Chống spam tự động: giới hạn 3 bình luận/10 phút/IP, ô bẫy, thời gian gửi tối thiểu 3 giây, hơn 2 liên kết hoặc có từ cấm thì vào hàng chờ xem.</p>
      <label for="cd-tucam">Từ cấm (mỗi dòng một cụm; không phân biệt hoa/thường và dấu)</label>
      <textarea id="cd-tucam" rows="4" bind:value={tuCam}></textarea>
    </section>
    <div class="hang-nut"><button type="submit">Lưu cài đặt</button></div>
  </form>
{/if}
