// Danh sách migration SQLite. KHÔNG sửa migration đã có; giai đoạn sau chỉ thêm migration mới vào cuối.
export interface Migration {
  phienBan: number;
  sql: string;
}

export const MIGRATIONS: Migration[] = [
  {
    phienBan: 1,
    sql: `
      CREATE TABLE nguoi_dung (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        ten TEXT NOT NULL,
        vai_tro TEXT NOT NULL,
        mat_khau_bam TEXT NOT NULL,
        totp_bi_mat TEXT,
        bi_khoa INTEGER NOT NULL DEFAULT 0,
        tao_luc INTEGER NOT NULL
      );
      CREATE TABLE phien (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token_bam TEXT NOT NULL UNIQUE,
        nguoi_dung_id INTEGER NOT NULL REFERENCES nguoi_dung(id) ON DELETE CASCADE,
        ghi_nho INTEGER NOT NULL DEFAULT 0,
        ip TEXT,
        thiet_bi TEXT,
        tao_luc INTEGER NOT NULL,
        dung_cuoi_luc INTEGER NOT NULL,
        het_han_luc INTEGER NOT NULL
      );
      CREATE TABLE ma_du_phong (
        nguoi_dung_id INTEGER NOT NULL REFERENCES nguoi_dung(id) ON DELETE CASCADE,
        ma_bam TEXT NOT NULL,
        da_dung INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE dang_nhap_thu (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ip TEXT NOT NULL,
        email TEXT NOT NULL,
        thanh_cong INTEGER NOT NULL,
        luc INTEGER NOT NULL
      );
      CREATE INDEX dang_nhap_thu_ip ON dang_nhap_thu(ip, luc);
      CREATE INDEX dang_nhap_thu_email ON dang_nhap_thu(email, luc);
      CREATE TABLE chan_ip (
        ip TEXT PRIMARY KEY,
        den_luc INTEGER NOT NULL,
        so_lan_chan INTEGER NOT NULL
      );
      CREATE TABLE nhat_ky (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        luc INTEGER NOT NULL,
        nguoi_dung_id INTEGER,
        loai TEXT NOT NULL,
        ip TEXT,
        chi_tiet TEXT
      );
      CREATE TABLE dat_lai_mat_khau (
        token_bam TEXT PRIMARY KEY,
        nguoi_dung_id INTEGER NOT NULL REFERENCES nguoi_dung(id) ON DELETE CASCADE,
        het_han_luc INTEGER NOT NULL,
        da_dung INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE bai (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tinh TEXT,
        loai TEXT NOT NULL,
        tac_gia_id INTEGER,
        nguoi_sua_cuoi_id INTEGER,
        nguoi_dang_id INTEGER,
        tao_luc INTEGER NOT NULL,
        sua_luc INTEGER NOT NULL,
        xoa_luc INTEGER
      );
      CREATE TABLE ban_dich (
        bai_id INTEGER NOT NULL REFERENCES bai(id) ON DELETE CASCADE,
        ngon_ngu TEXT NOT NULL,
        slug TEXT NOT NULL,
        trang_thai TEXT NOT NULL,
        hen_gio INTEGER,
        du_lieu TEXT NOT NULL,
        noi_dung TEXT NOT NULL,
        dang_luc INTEGER,
        sua_luc INTEGER NOT NULL,
        PRIMARY KEY (bai_id, ngon_ngu),
        UNIQUE (ngon_ngu, slug)
      );
      CREATE TABLE phien_ban (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bai_id INTEGER NOT NULL REFERENCES bai(id) ON DELETE CASCADE,
        ngon_ngu TEXT NOT NULL,
        nguoi_dung_id INTEGER,
        luc INTEGER NOT NULL,
        du_lieu TEXT NOT NULL,
        noi_dung TEXT NOT NULL
      );
      CREATE TABLE tinh (slug TEXT PRIMARY KEY, du_lieu TEXT NOT NULL);
      CREATE TABLE redirect (tu TEXT PRIMARY KEY, den TEXT NOT NULL);
      CREATE TABLE cai_dat (khoa TEXT PRIMARY KEY, gia_tri TEXT NOT NULL);
      CREATE TABLE bi_mat (khoa TEXT PRIMARY KEY, gia_tri_ma_hoa TEXT NOT NULL);
    `,
  },
];
