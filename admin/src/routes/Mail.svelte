<!-- Cài đặt mail: các nhà cung cấp SMTP (Gmail, Brevo…), hạn mức, gửi thử, nhật ký. Mật khẩu chỉ ghi, không bao giờ hiện lại. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { goiApi } from '../lib/api';
  import { thongBaoLoi } from '../lib/phien.svelte';

  interface Ncc { id: number; ten: string; host: string; cong: number; baoMat: 'ssl' | 'starttls'; taiKhoan: string; diaChiGui: string; gioiHanNgay: number; duPhongQuanTrong: number; thuTu: number; laChinh: boolean; bat: boolean; daDatMatKhau: boolean }
  interface Mau { ten: string; host: string; cong: number; baoMat: 'ssl' | 'starttls'; gioiHanNgay: number }
  interface Thk { id: number; ten: string; daGui: number; gioiHan: number }
  interface NhatKy { id: number; luc: number; den: string | null; loai: string | null; ketQua: string; loi: string | null }

  const TRONG = { ten: '', host: '', cong: 465, baoMat: 'ssl' as 'ssl' | 'starttls', taiKhoan: '', matKhau: '', diaChiGui: '', gioiHanNgay: 500, duPhongQuanTrong: 30, thuTu: 0, laChinh: false, bat: true };

  let ds = $state<Ncc[]>([]);
  let mau = $state<Mau[]>([]);
  let thk = $state<Thk[]>([]);
  let nk = $state<{ trang: number; tong: number; dong: NhatKy[] }>({ trang: 1, tong: 0, dong: [] });
  let form = $state<typeof TRONG & { id?: number }>({ ...TRONG });
  let hienForm = $state(false);
  let loi = $state('');
  let ok = $state('');
  let thuDen = $state<Record<number, string>>({});

  const gio = (ms: number) => new Date(ms).toLocaleString('vi-VN');

  async function tai(trang = 1) {
    const [a, b, c, d] = await Promise.all([
      goiApi<{ nhaCungCap: Ncc[] }>('GET', '/mail/nha-cung-cap'),
      goiApi<{ mau: Mau[] }>('GET', '/mail/mau'),
      goiApi<{ homNay: Thk[] }>('GET', '/mail/thong-ke'),
      goiApi<typeof nk>('GET', `/mail/nhat-ky?trang=${trang}`),
    ]);
    ds = a.nhaCungCap;
    mau = b.mau;
    thk = c.homNay;
    nk = d;
  }
  async function lam(viec: () => Promise<unknown>, thanhCong: string) {
    loi = '';
    ok = '';
    try {
      await viec();
      ok = thanhCong;
    } catch (e) {
      loi = thongBaoLoi(e);
    }
  }
  onMount(() => void tai().catch((e) => (loi = thongBaoLoi(e))));

  function them() {
    form = { ...TRONG, thuTu: ds.length };
    hienForm = true;
  }
  function chonMau(ten: string) {
    const m = mau.find((x) => x.ten === ten);
    if (m) form = { ...form, ten: m.ten, host: m.host, cong: m.cong, baoMat: m.baoMat, gioiHanNgay: m.gioiHanNgay };
  }
  function sua(n: Ncc) {
    form = { ...n, matKhau: '' };
    hienForm = true;
  }
  function luu(e: SubmitEvent) {
    e.preventDefault();
    const { id, matKhau, ...con } = form;
    const body = { ...con, ...(matKhau ? { matKhau } : {}) }; // để trống mật khẩu = giữ mật khẩu cũ
    return lam(async () => {
      if (id === undefined) await goiApi('POST', '/mail/nha-cung-cap', body);
      else await goiApi('PUT', `/mail/nha-cung-cap/${id}`, body);
      hienForm = false;
      form = { ...TRONG };
      await tai();
    }, 'Đã lưu.');
  }
  const xoa = (n: Ncc) => confirm(`Xoá nhà cung cấp "${n.ten}"?`) && lam(async () => { await goiApi('DELETE', `/mail/nha-cung-cap/${n.id}`); await tai(); }, 'Đã xoá.');
  const datChinh = (n: Ncc) => lam(async () => { await goiApi('PUT', `/mail/nha-cung-cap/${n.id}`, { laChinh: true }); await tai(); }, `${n.ten} là nhà cung cấp chính.`);
  const batTat = (n: Ncc) => lam(async () => { await goiApi('PUT', `/mail/nha-cung-cap/${n.id}`, { bat: !n.bat }); await tai(); }, n.bat ? 'Đã tắt.' : 'Đã bật.');
  const guiThu = (n: Ncc) => lam(async () => { await goiApi('POST', `/mail/nha-cung-cap/${n.id}/gui-thu`, { den: thuDen[n.id] }); await tai(); }, 'Đã gửi thư thử. Hãy kiểm tra hộp thư.');
</script>

<h1>Cài đặt mail</h1>
<p class="nhat">Mail đặt lại mật khẩu, lời mời, xác nhận đăng ký và bản tin đều đi qua đây. Nhà cung cấp chính được dùng trước; hết hạn mức hoặc lỗi thì tự chuyển sang nhà cung cấp kế tiếp.</p>
{#if loi}<p class="thong-bao-loi" role="alert">{loi}</p>{/if}
{#if ok}<p class="thong-bao-ok" role="status">{ok}</p>{/if}

<section class="the">
  <h2>Nhà cung cấp</h2>
  {#if ds.length === 0}<p class="nhat">Chưa có nhà cung cấp nào.</p>{/if}
  <ul class="danh-sach">
    {#each ds as n (n.id)}
      {@const tk = thk.find((t) => t.id === n.id)}
      <li>
        <strong>{n.ten}</strong>{n.laChinh ? ' · chính' : ''}{n.bat ? '' : ' · đang tắt'}<br />
        <span class="nhat">{n.host}:{n.cong} ({n.baoMat}) · {n.taiKhoan} · gửi từ {n.diaChiGui}<br />
          Hôm nay {tk?.daGui ?? 0}/{n.gioiHanNgay} thư (chừa {n.duPhongQuanTrong} thư cho mail quan trọng) · mật khẩu: {n.daDatMatKhau ? 'đã đặt' : 'CHƯA đặt'}</span>
        <div class="hang-nut">
          <button class="phu" onclick={() => sua(n)}>Sửa</button>
          {#if !n.laChinh}<button class="phu" onclick={() => datChinh(n)}>Đặt làm chính</button>{/if}
          <button class="phu" onclick={() => batTat(n)}>{n.bat ? 'Tắt' : 'Bật'}</button>
          <button class="nguy" onclick={() => xoa(n)}>Xoá</button>
        </div>
        <label for="thu-{n.id}">Gửi thư thử tới</label>
        <input id="thu-{n.id}" type="email" placeholder="email của bạn" bind:value={thuDen[n.id]} />
        <div class="hang-nut"><button class="phu" disabled={!thuDen[n.id]} onclick={() => guiThu(n)}>Gửi thử</button></div>
      </li>
    {/each}
  </ul>
  {#if !hienForm}<div class="hang-nut"><button onclick={them}>Thêm nhà cung cấp</button></div>{/if}
</section>

{#if hienForm}
  <form class="the" onsubmit={luu}>
    <h2>{form.id === undefined ? 'Thêm nhà cung cấp' : 'Sửa nhà cung cấp'}</h2>
    {#if form.id === undefined}
      <label for="mau">Điền sẵn theo mẫu</label>
      <select id="mau" onchange={(e) => chonMau(e.currentTarget.value)}>
        <option value="">— chọn —</option>
        {#each mau as m}<option value={m.ten}>{m.ten}</option>{/each}
      </select>
    {/if}
    <label for="f-ten">Tên gọi</label><input id="f-ten" type="text" required bind:value={form.ten} />
    <label for="f-host">Máy chủ SMTP</label><input id="f-host" type="text" required bind:value={form.host} />
    <label for="f-cong">Cổng</label><input id="f-cong" type="number" required bind:value={form.cong} />
    <label for="f-bm">Bảo mật</label>
    <select id="f-bm" bind:value={form.baoMat}><option value="ssl">SSL (465)</option><option value="starttls">STARTTLS (587)</option></select>
    <label for="f-tk">Tài khoản đăng nhập SMTP</label><input id="f-tk" type="text" autocomplete="off" required bind:value={form.taiKhoan} />
    <label for="f-mk">Mật khẩu SMTP{form.id !== undefined ? ' (để trống nếu không đổi)' : ''}</label>
    <input id="f-mk" type="password" autocomplete="new-password" bind:value={form.matKhau} />
    <label for="f-gui">Địa chỉ gửi đi</label><input id="f-gui" type="text" required bind:value={form.diaChiGui} />
    <label for="f-gh">Giới hạn thư mỗi ngày</label><input id="f-gh" type="number" min="1" required bind:value={form.gioiHanNgay} />
    <label for="f-dp">Chừa lại cho mail quan trọng</label><input id="f-dp" type="number" min="0" required bind:value={form.duPhongQuanTrong} />
    <label class="hang-chon"><input type="checkbox" bind:checked={form.laChinh} /> Là nhà cung cấp chính</label>
    <label class="hang-chon"><input type="checkbox" bind:checked={form.bat} /> Đang bật</label>
    <div class="hang-nut">
      <button type="submit">Lưu</button>
      <button type="button" class="phu" onclick={() => (hienForm = false)}>Huỷ</button>
    </div>
  </form>
{/if}

<section class="the">
  <h2>Nhật ký gửi mail</h2>
  {#if nk.dong.length === 0}<p class="nhat">Chưa có.</p>{:else}
    <table class="bang">
      <thead><tr><th>Lúc</th><th>Tới</th><th>Kết quả</th></tr></thead>
      <tbody>{#each nk.dong as d (d.id)}<tr><td>{gio(d.luc)}</td><td>{d.den ?? ''}</td><td>{d.ketQua}{d.loi ? ` — ${d.loi}` : ''}</td></tr>{/each}</tbody>
    </table>
    <div class="hang-nut">
      <button class="phu" disabled={nk.trang <= 1} onclick={() => tai(nk.trang - 1)}>Trang trước</button>
      <button class="phu" disabled={nk.trang * 50 >= nk.tong} onclick={() => tai(nk.trang + 1)}>Trang sau</button>
    </div>
  {/if}
</section>
