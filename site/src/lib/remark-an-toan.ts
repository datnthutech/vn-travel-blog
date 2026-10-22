// Plugin remark chạy TRƯỚC mọi plugin khác: làm sạch Markdown do người viết nhập (writer, bản dịch AI, Claude/MCP).
// Site chung tên miền với /quan-tri, nên một <script> lọt lên trang công khai sẽ chạy dưới quyền quản trị khi họ mở bài.
// - HTML thô (khối hoặc giữa câu) → đổi thành chữ thường: vẫn thấy nội dung nhưng trình duyệt không hiểu là thẻ.
// - Link/ảnh có giao thức nguy hiểm (javascript:, data:, vbscript:…) → đổi thành "#".
// Plugin remarkAnh chạy SAU và tự tạo HTML <picture> tin cậy cho ảnh anh:MÃ, nên không bị ảnh hưởng.
interface Nut {
  type: string;
  url?: string;
  value?: string;
  children?: Nut[];
}

const GIAO_THUC_AN_TOAN = /^(https?:|mailto:|tel:)/i;

// URL không có giao thức (/, #, ./, ?, đường dẫn tương đối) là an toàn; có giao thức thì chỉ cho http(s), mailto, tel.
// Ảnh còn được phép dạng anh:MÃ. Bỏ ký tự điều khiển/khoảng trắng trước khi xét (trình duyệt cũng bỏ: "java\tscript:").
export function urlAnToan(url: string, choPhepAnh = false): boolean {
  const u = url.replace(/[\u0000- \u007f-\u009f]/g, '');
  if (choPhepAnh && u.startsWith('anh:')) return true;
  const coGiaoThuc = /^[a-z][a-z0-9+.-]*:/i.test(u);
  return !coGiaoThuc || GIAO_THUC_AN_TOAN.test(u);
}

export function remarkAnToan() {
  return () => (cay: Nut) => {
    const duyet = (n: Nut) => {
      if (n.type === 'html') {
        n.type = 'text'; // giữ nguyên chữ; mdast → hast sẽ escape "<", ">"
      } else if ((n.type === 'link' || n.type === 'definition') && n.url !== undefined && !urlAnToan(n.url)) {
        n.url = '#';
      } else if (n.type === 'image' && n.url !== undefined && !urlAnToan(n.url, true)) {
        n.url = '#';
      }
      n.children?.forEach(duyet);
    };
    duyet(cay);
  };
}
