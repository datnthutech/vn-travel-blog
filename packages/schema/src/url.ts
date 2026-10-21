// Địa chỉ (URL) của các trang "hub" và trang tĩnh — một nơi duy nhất để site, MCP và redirect cùng tính ra.

/** Trang tĩnh cố định giữ URL cũ; trang tĩnh khác nằm ở /trang/<slug>/. */
export const TRANG_CO_DINH = ['gioi-thieu', 'chinh-sach-lien-ket', 'lien-he'] as const;

export const urlChuyenMuc = (slug: string): string => `/chu-de/${slug}/`;
export const urlTinh = (slug: string): string => `/${slug}/`;
export const urlTrang = (slug: string): string => ((TRANG_CO_DINH as readonly string[]).includes(slug) ? `/${slug}/` : `/trang/${slug}/`);
