<!-- Cài đặt AI dịch bài (quản trị): model + API key Anthropic (chỉ ghi, không bao giờ hiện lại) + thử kết nối. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { goiApi, LoiApi } from '../lib/api';
  import { thongBaoLoi } from '../lib/phien.svelte';

  let model = $state('claude-opus-5-5');
  let daDatKey = $state(false);
  let apiKey = $state('');
  let loi = $state('');
  let ok = $state('');
  let ban = $state(false);

  async function tai() {
    try {
      const r = await goiApi<{ model: string; daDatKey: boolean }>('GET', '/cai-dat/ai');
      model = r.model;
      daDatKey = r.daDatKey;
    } catch (e) {
      loi = thongBaoLoi(e);
    }
  }
  async function luu(xoaKey = false) {
    ban = true;
    loi = '';
    ok = '';
    try {
      const r = await goiApi<{ daDatKey: boolean }>('PUT', '/cai-dat/ai', { model, ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}), ...(xoaKey ? { xoaKey: true } : {}) });
      daDatKey = r.daDatKey;
      apiKey = '';
      ok = xoaKey ? 'Đã xoá API key.' : 'Đã lưu cài đặt AI.';
    } catch (e) {
      loi = thongBaoLoi(e);
    }
    ban = false;
  }
  async function thu() {
    ban = true;
    loi = '';
    ok = '';
    try {
      const r = await goiApi<{ ketQua: string }>('POST', '/cai-dat/ai/thu', {});
      ok = `Kết nối được. AI dịch thử "Xin chào" → "${r.ketQua}".`;
    } catch (e) {
      loi = e instanceof LoiApi ? e.loi : 'Không thử được.';
    }
    ban = false;
  }
  onMount(() => void tai());
</script>

<h1>Cài đặt AI dịch bài</h1>
{#if loi}<p class="thong-bao-loi" role="alert">{loi}</p>{/if}
{#if ok}<p class="thong-bao-ok" role="status">{ok}</p>{/if}
<p class="nhat">AI chỉ <strong>điền</strong> bản dịch vào form để bạn đọc lại — không tự lưu, không tự đăng. Nếu AI lỗi, chỉ nút "Dịch bằng AI" báo lỗi; mọi việc khác vẫn chạy. Dịch tốn phí theo tài khoản Anthropic của bạn.</p>
<form class="the" onsubmit={(e) => { e.preventDefault(); void luu(); }}>
  <label for="ai-model">Model</label>
  <input id="ai-model" type="text" bind:value={model} maxlength="64" required />
  <label for="ai-key">API key Anthropic {daDatKey ? '(đã có — để trống nếu giữ nguyên)' : '(chưa có)'}</label>
  <input id="ai-key" type="password" bind:value={apiKey} autocomplete="off" placeholder={daDatKey ? '••••••••' : 'dán API key vào đây'} />
  <div class="hang-nut">
    <button type="submit" disabled={ban}>Lưu</button>
    <button type="button" class="phu" onclick={thu} disabled={ban || !daDatKey}>Thử kết nối</button>
    {#if daDatKey}<button type="button" class="nguy" onclick={() => confirm('Xoá API key AI đã lưu?') && luu(true)} disabled={ban}>Xoá key</button>{/if}
  </div>
</form>

<style>
  input { width: 100%; padding: 8px 12px; border: 1px solid var(--vien); border-radius: 8px; background: var(--nen); color: var(--chu); font: inherit; }
</style>
