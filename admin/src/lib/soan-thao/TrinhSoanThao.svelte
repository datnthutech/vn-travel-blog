<!-- Trình soạn thảo trực quan (TipTap) cho thân bài; lưu ra Markdown tương thích site (ảnh `![alt](anh:MÃ)`).
     Có chế độ "Markdown thô" chuyển qua lại không mất nội dung. Nút to cho điện thoại. -->
<script lang="ts">
  import type { Editor } from '@tiptap/core';
  import { onMount } from 'svelte';
  import { docSangMarkdown, lamSachMarkdown, taoEditor } from './markdown';

  interface Props {
    markdown: string;
    anhBaseUrl: string;
    /** Người dùng chọn/kéo thả/dán ảnh: trang soạn bài tải lên rồi gọi `chenAnh` cho từng ảnh. */
    onChenAnh?: (files: File[]) => void;
    disabled?: boolean;
  }
  let { markdown = $bindable(), anhBaseUrl, onChenAnh, disabled = false }: Props = $props();

  let phanTu: HTMLDivElement;
  let editor: Editor | undefined;
  let cheDo = $state<'truc-quan' | 'markdown'>('truc-quan');
  let daCapNhat = $state(0); // tăng mỗi lần editor đổi → vẽ lại trạng thái nút (đậm/nghiêng đang bật…)
  let cuoiCung = markdown; // Markdown mới nhất do chính editor phát ra (để phân biệt với thay đổi từ bên ngoài)
  let hopLink = $state(false);
  let urlLink = $state('');

  onMount(() => {
    editor = taoEditor(markdown, { anhBaseUrl, element: phanTu });
    editor.setEditable(!disabled);
    editor.on('update', () => {
      cuoiCung = docSangMarkdown(editor!);
      markdown = cuoiCung;
    });
    editor.on('transaction', () => (daCapNhat += 1));
    // Dán / kéo thả ảnh → chuyển cho trang soạn bài tải lên.
    const lamAnh = (e: ClipboardEvent | DragEvent) => {
      const dt = 'clipboardData' in e ? e.clipboardData : e.dataTransfer;
      const files = [...(dt?.files ?? [])].filter((f) => f.type.startsWith('image/'));
      if (files.length && onChenAnh) {
        e.preventDefault();
        onChenAnh(files);
      }
    };
    phanTu.addEventListener('paste', lamAnh);
    phanTu.addEventListener('drop', lamAnh);
    return () => {
      phanTu.removeEventListener('paste', lamAnh);
      phanTu.removeEventListener('drop', lamAnh);
      editor?.destroy();
    };
  });

  // Markdown đổi từ bên ngoài (nạp bài, khôi phục phiên bản…) → nạp lại vào editor.
  $effect(() => {
    const md = markdown;
    if (editor && md !== cuoiCung && cheDo === 'truc-quan') {
      cuoiCung = md;
      editor.commands.setContent(lamSachMarkdown(md), { contentType: 'markdown', emitUpdate: false });
    }
  });
  $effect(() => editor?.setEditable(!disabled && cheDo === 'truc-quan'));

  function doiCheDo() {
    if (cheDo === 'truc-quan') {
      cheDo = 'markdown';
    } else {
      cheDo = 'truc-quan';
      cuoiCung = markdown;
      editor?.commands.setContent(lamSachMarkdown(markdown), { contentType: 'markdown', emitUpdate: false });
    }
  }

  /** Chèn ảnh đã tải lên vào vị trí con trỏ. Trang soạn bài gọi hàm này. */
  export function chenAnh(ma: string, alt: string) {
    if (cheDo === 'markdown') {
      markdown = `${markdown.trimEnd()}\n\n![${alt}](anh:${ma})\n`;
      return;
    }
    editor?.chain().focus().setImage({ src: `anh:${ma}`, alt }).run();
  }

  const dang = (ten: string, thuoc?: Record<string, unknown>) => (daCapNhat >= 0 && editor?.isActive(ten, thuoc)) || false;
  const chay = (f: (c: ReturnType<Editor['chain']>) => ReturnType<Editor['chain']>) => f(editor!.chain().focus()).run();

  function chenLink(e: SubmitEvent) {
    e.preventDefault();
    const url = urlLink.trim();
    if (!url) editor?.chain().focus().unsetLink().run();
    else if (/^(https?:\/\/|\/|mailto:)/i.test(url)) editor?.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    hopLink = false;
    urlLink = '';
  }
  function moLink() {
    urlLink = (editor?.getAttributes('link').href as string | undefined) ?? '';
    hopLink = true;
  }
  let oChonAnh: HTMLInputElement;
</script>

<div class="soan-thao">
  <div class="thanh-cong-cu" role="toolbar" aria-label="Định dạng văn bản">
    {#if cheDo === 'truc-quan'}
      <button type="button" class="phu" class:bat={dang('heading', { level: 2 })} onclick={() => chay((c) => c.toggleHeading({ level: 2 }))} {disabled}>H2</button>
      <button type="button" class="phu" class:bat={dang('heading', { level: 3 })} onclick={() => chay((c) => c.toggleHeading({ level: 3 }))} {disabled}>H3</button>
      <button type="button" class="phu" class:bat={dang('bold')} onclick={() => chay((c) => c.toggleBold())} {disabled} aria-label="Đậm"><b>B</b></button>
      <button type="button" class="phu" class:bat={dang('italic')} onclick={() => chay((c) => c.toggleItalic())} {disabled} aria-label="Nghiêng"><i>I</i></button>
      <button type="button" class="phu" class:bat={dang('bulletList')} onclick={() => chay((c) => c.toggleBulletList())} {disabled}>• Danh sách</button>
      <button type="button" class="phu" class:bat={dang('orderedList')} onclick={() => chay((c) => c.toggleOrderedList())} {disabled}>1. Số</button>
      <button type="button" class="phu" class:bat={dang('blockquote')} onclick={() => chay((c) => c.toggleBlockquote())} {disabled}>❝ Trích</button>
      <button type="button" class="phu" class:bat={dang('link')} onclick={moLink} {disabled}>Link</button>
      <button type="button" class="phu" onclick={() => oChonAnh.click()} disabled={disabled || !onChenAnh}>🖼 Chèn ảnh</button>
    {/if}
    <button type="button" class="phu" onclick={doiCheDo}>{cheDo === 'truc-quan' ? 'Markdown thô' : 'Quay lại soạn trực quan'}</button>
    <input bind:this={oChonAnh} type="file" accept="image/*" multiple hidden onchange={(e) => { const f = [...(e.currentTarget.files ?? [])]; e.currentTarget.value = ''; if (f.length) onChenAnh?.(f); }} />
  </div>

  {#if hopLink}
    <form class="hop-link" onsubmit={chenLink}>
      <label for="url-link">Địa chỉ liên kết (để trống để gỡ link)</label>
      <input id="url-link" type="text" inputmode="url" placeholder="https://… hoặc /vung-tau/ten-bai/" bind:value={urlLink} />
      <div class="hang-nut"><button type="submit">Áp dụng</button><button type="button" class="phu" onclick={() => (hopLink = false)}>Huỷ</button></div>
    </form>
  {/if}

  <div class="vung-soan" class:an={cheDo !== 'truc-quan'} bind:this={phanTu}></div>
  {#if cheDo === 'markdown'}
    <textarea class="markdown-tho" bind:value={markdown} rows="18" spellcheck="false" aria-label="Markdown thô" {disabled}></textarea>
  {/if}
</div>

<style>
  .soan-thao { border: 1px solid var(--vien); border-radius: 10px; background: var(--the); }
  .thanh-cong-cu { display: flex; flex-wrap: wrap; gap: 6px; padding: 8px; border-bottom: 1px solid var(--vien); position: sticky; top: 0; background: var(--the); z-index: 2; border-radius: 10px 10px 0 0; }
  .thanh-cong-cu button { min-width: 44px; padding: 0 12px; }
  .thanh-cong-cu button.bat { background: var(--chinh); color: var(--chinh-chu); }
  .hop-link { padding: 8px 12px; border-bottom: 1px solid var(--vien); }
  .vung-soan.an { display: none; }
  .vung-soan :global(.tiptap) { min-height: 280px; padding: 12px; outline: none; }
  .vung-soan :global(.tiptap img) { max-width: 100%; height: auto; border-radius: 6px; }
  .vung-soan :global(.tiptap blockquote) { border-left: 3px solid var(--vien); margin-left: 0; padding-left: 12px; color: var(--chu-nhat); }
  .markdown-tho { width: 100%; border: 0; padding: 12px; background: var(--nen); color: var(--chu); font: .95rem/1.5 ui-monospace, Menlo, monospace; resize: vertical; border-radius: 0 0 10px 10px; }
</style>
