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
  {
    phienBan: 2,
    sql: `
      CREATE TABLE nha_cung_cap_mail (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ten TEXT NOT NULL,
        host TEXT NOT NULL,
        cong INTEGER NOT NULL,
        bao_mat TEXT NOT NULL CHECK (bao_mat IN ('ssl', 'starttls')),
        tai_khoan TEXT NOT NULL,
        mat_khau_khoa TEXT, -- tên khoá trong bảng bi_mat (mật khẩu SMTP mã hoá AES-256-GCM), không phải mật khẩu
        dia_chi_gui TEXT NOT NULL,
        gioi_han_ngay INTEGER NOT NULL,
        du_phong_quan_trong INTEGER NOT NULL DEFAULT 30,
        thu_tu INTEGER NOT NULL DEFAULT 0,
        la_chinh INTEGER NOT NULL DEFAULT 0,
        bat INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE mail_hang_doi (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        loai TEXT NOT NULL,
        den TEXT NOT NULL,
        tieu_de TEXT NOT NULL,
        html TEXT NOT NULL,
        text TEXT NOT NULL,
        headers TEXT,
        tao_luc INTEGER NOT NULL,
        thu_lai INTEGER NOT NULL DEFAULT 0,
        trang_thai TEXT NOT NULL DEFAULT 'cho',
        loi_cuoi TEXT
      );
      CREATE INDEX mail_hang_doi_trang_thai ON mail_hang_doi(trang_thai, loai, id);
      CREATE TABLE mail_dem (
        nha_cung_cap_id INTEGER NOT NULL,
        ngay TEXT NOT NULL,
        so_da_gui INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (nha_cung_cap_id, ngay)
      );
      CREATE TABLE mail_nhat_ky (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        luc INTEGER NOT NULL,
        mail_id INTEGER,
        nha_cung_cap_id INTEGER,
        den TEXT,
        loai TEXT,
        ket_qua TEXT NOT NULL,
        loi TEXT
      );
      CREATE TABLE mail_tam_bo_qua (
        nha_cung_cap_id INTEGER PRIMARY KEY,
        den_luc INTEGER NOT NULL DEFAULT 0,
        so_loi_lien_tiep INTEGER NOT NULL DEFAULT 0
      );
    `,
  },
  {
    phienBan: 3,
    sql: `
      ALTER TABLE phien ADD COLUMN cho_totp INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE nguoi_dung ADD COLUMN totp_tam TEXT;
      ALTER TABLE nguoi_dung ADD COLUMN totp_buoc_cuoi INTEGER NOT NULL DEFAULT 0;
    `,
  },
  {
    phienBan: 4,
    sql: `
      ALTER TABLE ban_dich ADD COLUMN phien_so INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE ban_dich ADD COLUMN nhap_tu_luu TEXT;
      ALTER TABLE ban_dich ADD COLUMN phien_ban_cuoi_luc INTEGER;
    `,
  },
  {
    phienBan: 5,
    sql: `
      ALTER TABLE ban_dich ADD COLUMN hen_gio_nguoi_id INTEGER; -- người đặt hẹn giờ (sẽ là người đăng khi tới hạn)
    `,
  },
  {
    phienBan: 6,
    sql: `
      CREATE TABLE anh (
        ma TEXT PRIMARY KEY,
        ten_goc TEXT NOT NULL DEFAULT '',
        rong INTEGER NOT NULL,
        cao INTEGER NOT NULL,
        byte INTEGER NOT NULL DEFAULT 0,
        tai_len_luc INTEGER NOT NULL,
        nguoi_dung_id INTEGER,
        alt_mac_dinh TEXT NOT NULL DEFAULT ''
      );
    `,
  },
];
