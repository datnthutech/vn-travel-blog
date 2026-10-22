<!-- Thanh tab ngôn ngữ của một bài: "Tiếng Việt (gốc)" + mỗi ngôn ngữ đang bật, kèm nhãn trạng thái bản dịch. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { goiApi } from '../api';
  import { bamLienKet, GOC } from '../dieu-huong.svelte';

  let { id, hienTai }: { id: number; hienTai: string } = $props();
  interface Tab { ma: string; ten: string; nhan: string; cu: boolean; daKiemTra: boolean }
  let tabs = $state<Tab[]>([]);
  const TEN = { 'chua-dich': 'Chưa dịch', nhap: 'Nháp', 'da-dang': 'Đã đăng', 'hen-gio': 'Hẹn giờ' } as const;

  onMount(() => {
    void (async () => {
      try {
        const nn = (await goiApi<{ ngonNgu: { ma: string; ten: string; bat: boolean }[] }>('GET', '/ngon-ngu')).ngonNgu.filter((n) => n.bat && n.ma !== 'vi');
        tabs = await Promise.all(
          nn.map(async (n) => {
            const r = await goiApi<{ trangThai: keyof typeof TEN; cuHonBanGoc: boolean; daKiemTra: boolean }>('GET', `/bai/${id}/ban-dich/${n.ma}`);
            return { ma: n.ma, ten: n.ten, nhan: TEN[r.trangThai], cu: r.cuHonBanGoc, daKiemTra: r.daKiemTra };
          }),
        );
      } catch {
        tabs = []; // không có tab thì vẫn soạn bản gốc được
      }
    })();
  });
</script>

{#if tabs.length > 0}
  <nav class="tab-ngon-ngu" aria-label="Ngôn ngữ của bài">
    <a href="{GOC}/bai/{id}" class:dang={hienTai === 'vi'} aria-current={hienTai === 'vi' ? 'page' : undefined} onclick={bamLienKet}>Tiếng Việt (gốc)</a>
    {#each tabs as t (t.ma)}
      <a href="{GOC}/bai/{id}/ban-dich/{t.ma}" class:dang={hienTai === t.ma} aria-current={hienTai === t.ma ? 'page' : undefined} onclick={bamLienKet}>
        {t.ten} <span class="nhat">· {t.nhan}</span>{#if t.cu}<span class="cu"> · Cũ hơn bản gốc</span>{/if}{#if t.daKiemTra}<span class="kt"> · Đã kiểm tra</span>{/if}
      </a>
    {/each}
  </nav>
{/if}

<style>
  .tab-ngon-ngu { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0 16px; }
  a { padding: 8px 12px; border: 1px solid var(--vien); border-radius: 8px; text-decoration: none; min-height: 44px; display: inline-flex; align-items: center; }
  a.dang { background: var(--ok-nen); font-weight: 600; }
  .cu { color: #7a5b00; font-weight: 600; }
  .kt { color: var(--ok); }
</style>
