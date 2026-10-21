<!-- Kiểm duyệt bình luận: lọc theo trạng thái, ẩn/hiện, xoá, trả lời (nhãn "Tác giả"), chặn email/IP. Người viết chỉ thấy bình luận ở bài của mình. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { goiApi } from '../lib/api';
  import { bamLienKet, GOC } from '../lib/dieu-huong.svelte';
  import { thongBaoLoi } from '../lib/phien.svelte';

  interface B { id: number; baiId: number; baiTieuDe: string; chaId: number | null; ten: string; email: string; noiDung: string; trangThai: 'hien' | 'an' | 'cho-xem'; lyDoChoXem: string | null; laTacGia: boolean; taoLuc: number }
  const TEN = { hien: 'Đang hiện', an: 'Đã ẩn', 'cho-xem': 'Chờ xem' } as const;
  let ds = $state<B[]>([]);
  let tong = $state(0);
  let trang = $state(1);
  let tt = $state('');
  let loi = $state('');
  let ok = $state('');
  let traLoi = $state<{ id: number; noiDung: string } | null>(null);
  let seq = 0;
  const gio = (ms: number) => new Date(ms).toLocaleString('vi-VN');

  async function tai() {
    const luot = ++seq;
    try {
      const r = await goiApi<{ binhLuan: B[]; tong: number }>('GET', `/binh-luan?trang=${trang}${tt ? `&trangThai=${tt}` : ''}`);
      if (luot !== seq) return;
      ds = r.binhLuan;
      tong = r.tong;
    } catch (e) {
      loi = thongBaoLoi(e);
    }
  }
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
  const dat = (b: B, v: 'hien' | 'an') => lam(() => goiApi('PUT', `/binh-luan/${b.id}`, { trangThai: v }), v === 'an' ? 'Đã ẩn bình luận.' : 'Đã hiện bình luận.');
  const xoa = (b: B) => confirm('Xoá bình luận này (và các trả lời của nó)? Không hoàn tác được.') && lam(() => goiApi('DELETE', `/binh-luan/${b.id}`), 'Đã xoá.');
  const chan = (b: B, loai: 'email' | 'ip') => confirm(`Chặn ${loai === 'email' ? 'email' : 'địa chỉ IP'} của "${b.ten}"? Họ vẫn thấy gửi thành công nhưng bình luận sẽ không được lưu.`) && lam(() => goiApi('POST', `/binh-luan/${b.id}/chan`, { loai }), `Đã chặn ${loai} và ẩn bình luận.`);
  const guiTraLoi = (e: SubmitEvent) => {
    e.preventDefault();
    const t = traLoi!;
    return lam(async () => { await goiApi('POST', `/binh-luan/${t.id}/tra-loi`, { noiDung: t.noiDung }); traLoi = null; }, 'Đã trả lời (hiện nhãn Tác giả).');
  };
  onMount(() => void tai());
</script>

<h1>Bình luận</h1>
{#if loi}<p class="thong-bao-loi" role="alert">{loi}</p>{/if}
{#if ok}<p class="thong-bao-ok" role="status">{ok}</p>{/if}
<div class="the">
  <label for="bl-tt">Lọc theo trạng thái</label>
  <select id="bl-tt" bind:value={tt} onchange={() => { trang = 1; void tai(); }}>
    <option value="">Tất cả (chờ xem lên đầu)</option><option value="cho-xem">Chờ xem</option><option value="hien">Đang hiện</option><option value="an">Đã ẩn</option>
  </select>
</div>

<section class="the">
  {#if ds.length === 0}<p class="nhat">Chưa có bình luận nào.</p>{/if}
  <ul class="danh-sach">
    {#each ds as b (b.id)}
      <li class:con={b.chaId !== null}>
        <strong>{b.ten}</strong>{b.laTacGia ? ' · Tác giả' : ''} <span class="nhan {b.trangThai}">{TEN[b.trangThai]}</span>
        {#if b.lyDoChoXem}<span class="nhat"> — {b.lyDoChoXem}</span>{/if}<br />
        <span class="nhat">{b.email} · {gio(b.taoLuc)} · <a href="{GOC}/bai/{b.baiId}" onclick={bamLienKet}>{b.baiTieuDe || `Bài #${b.baiId}`}</a></span>
        <p class="noi-dung">{b.noiDung}</p>
        <div class="hang-nut">
          {#if b.trangThai === 'hien'}<button class="phu" onclick={() => dat(b, 'an')}>Ẩn</button>{:else}<button onclick={() => dat(b, 'hien')}>Hiện</button>{/if}
          {#if !b.laTacGia}<button class="phu" onclick={() => (traLoi = { id: b.id, noiDung: '' })}>Trả lời</button>{/if}
          <button class="nguy" onclick={() => xoa(b)}>Xoá</button>
          {#if !b.laTacGia}
            <button class="phu" onclick={() => chan(b, 'email')}>Chặn email</button>
            <button class="phu" onclick={() => chan(b, 'ip')}>Chặn IP</button>
          {/if}
        </div>
        {#if traLoi?.id === b.id}
          <form onsubmit={guiTraLoi}>
            <label for="tl-{b.id}">Trả lời với tư cách tác giả</label>
            <textarea id="tl-{b.id}" rows="3" maxlength="2000" required bind:value={traLoi.noiDung}></textarea>
            <div class="hang-nut"><button type="submit">Gửi trả lời</button><button type="button" class="phu" onclick={() => (traLoi = null)}>Huỷ</button></div>
          </form>
        {/if}
      </li>
    {/each}
  </ul>
  <div class="hang-nut">
    <button class="phu" disabled={trang <= 1} onclick={() => { trang -= 1; void tai(); }}>Trang trước</button>
    <span class="nhat">Trang {trang} · {tong} bình luận</span>
    <button class="phu" disabled={trang * 30 >= tong} onclick={() => { trang += 1; void tai(); }}>Trang sau</button>
  </div>
</section>

<style>
  .con { margin-left: 1.25rem; border-left: 3px solid var(--vien); padding-left: .75rem; }
  .noi-dung { white-space: pre-wrap; overflow-wrap: anywhere; margin: .4rem 0; }
  .nhan { font-size: .75rem; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--vien); }
  .nhan.hien { background: var(--ok-nen); color: var(--ok); }
  .nhan.cho-xem { background: #fff3cd; color: #7a5b00; }
  textarea { width: 100%; padding: 8px 12px; border: 1px solid var(--vien); border-radius: 8px; background: var(--nen); color: var(--chu); font: inherit; }
</style>
