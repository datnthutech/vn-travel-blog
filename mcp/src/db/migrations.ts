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
  {
    phienBan: 7,
    sql: `
      CREATE TABLE chuyen_muc (
        slug TEXT PRIMARY KEY,
        ten TEXT NOT NULL,
        mo_ta TEXT NOT NULL DEFAULT '',
        anh_bia TEXT,
        thu_tu INTEGER NOT NULL DEFAULT 0
      );
      INSERT INTO chuyen_muc (slug, ten, thu_tu) VALUES
        ('sinh-thai', 'Khu sinh thái', 0), ('an-uong', 'Ăn uống', 1), ('vui-choi', 'Vui chơi', 2),
        ('luu-tru', 'Lưu trú', 3), ('di-chuyen', 'Di chuyển', 4);
    `,
  },
  {
    phienBan: 8,
    sql: `
      CREATE TABLE trang (
        slug TEXT PRIMARY KEY,
        tieu_de TEXT NOT NULL,
        mo_ta TEXT NOT NULL DEFAULT '',
        noi_dung TEXT NOT NULL DEFAULT '',
        trang_thai TEXT NOT NULL DEFAULT 'nhap' CHECK (trang_thai IN ('nhap', 'da-dang')),
        co_dinh INTEGER NOT NULL DEFAULT 0,
        sua_luc INTEGER NOT NULL,
        nguoi_sua_cuoi_id INTEGER,
        phien_so INTEGER NOT NULL DEFAULT 1,
        nhap_tu_luu TEXT
      );
      -- Ba trang cố định giữ URL cũ, có sẵn nội dung mặc định (chủ blog sửa lại cho đúng thực tế).
      INSERT INTO trang (slug, tieu_de, mo_ta, noi_dung, trang_thai, co_dinh, sua_luc) VALUES
        ('gioi-thieu', 'Giới thiệu', 'Nhật ký du lịch thật của một gia đình nhỏ và gợi ý cho các gia đình có bé nhỏ.',
         'VNTravelTips là nhật ký du lịch của một gia đình nhỏ có con nhỏ. Mỗi bài đặt thông tin tiện lợi lên trước — đi có tiện không, tốn bao nhiêu, cần lưu ý gì với bé — rồi mới kể chuyện.' || char(10) || char(10) || 'Mọi trải nghiệm trong blog đều do gia đình tự đi và tự trả tiền, trừ khi bài có ghi nhãn “Bài hợp tác”.',
         'da-dang', 1, 0),
        ('chinh-sach-lien-ket', 'Chính sách liên kết', 'Cách VNTravelTips sử dụng liên kết giới thiệu (affiliate) và nhận hoa hồng.',
         'Một số bài có liên kết giới thiệu tới Agoda, Klook, Traveloka, Booking hoặc Shopee. Nếu bạn đặt dịch vụ qua các liên kết này, VNTravelTips có thể nhận một khoản hoa hồng nhỏ, bạn không phải trả thêm đồng nào.' || char(10) || char(10) || 'Hoa hồng không ảnh hưởng đến nhận xét: chúng tôi chỉ giới thiệu nơi gia đình đã thật sự trải nghiệm.',
         'da-dang', 1, 0),
        ('lien-he', 'Liên hệ', 'Cách liên hệ với VNTravelTips.',
         'Bạn có thắc mắc, góp ý hoặc muốn hợp tác? Hãy nhắn cho chúng tôi qua các trang mạng xã hội ở chân trang. Chúng tôi đọc mọi tin nhắn và trả lời sớm nhất có thể.',
         'da-dang', 1, 0);
      -- Lịch sử phiên bản dùng chung cho bài và trang tĩnh: bai_id cho phép rỗng, trang_slug cho trang.
      CREATE TABLE phien_ban_moi (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bai_id INTEGER REFERENCES bai(id) ON DELETE CASCADE,
        trang_slug TEXT,
        ngon_ngu TEXT NOT NULL,
        nguoi_dung_id INTEGER,
        luc INTEGER NOT NULL,
        du_lieu TEXT NOT NULL,
        noi_dung TEXT NOT NULL
      );
      INSERT INTO phien_ban_moi (id, bai_id, ngon_ngu, nguoi_dung_id, luc, du_lieu, noi_dung)
        SELECT id, bai_id, ngon_ngu, nguoi_dung_id, luc, du_lieu, noi_dung FROM phien_ban;
      DROP TABLE phien_ban;
      ALTER TABLE phien_ban_moi RENAME TO phien_ban;
    `,
  },
  {
    phienBan: 9,
    sql: `
      ALTER TABLE redirect ADD COLUMN tu_dong INTEGER NOT NULL DEFAULT 0; -- 1 = hệ thống tự thêm khi đổi slug/tỉnh
    `,
  },
  {
    phienBan: 10,
    sql: `
      CREATE TABLE loi_moi (
        token_bam TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        vai_tro TEXT NOT NULL,
        het_han_luc INTEGER NOT NULL,
        nguoi_moi_id INTEGER NOT NULL,
        tao_luc INTEGER NOT NULL,
        da_dung INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX loi_moi_email ON loi_moi(email);
    `,
  },
  {
    phienBan: 11,
    sql: `
      ALTER TABLE mail_hang_doi ADD COLUMN nhay_cam INTEGER NOT NULL DEFAULT 0; -- 1 = chứa liên kết có hiệu lực (đặt lại mật khẩu, lời mời): xoá nội dung sau khi gửi
      CREATE INDEX loi_moi_nguoi_moi ON loi_moi(nguoi_moi_id, tao_luc);
      CREATE INDEX nhat_ky_nguoi_loai ON nhat_ky(nguoi_dung_id, loai, luc);
    `,
  },
  {
    phienBan: 12,
    sql: `
      CREATE TABLE binh_luan (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bai_id INTEGER NOT NULL REFERENCES bai(id) ON DELETE CASCADE,
        ngon_ngu TEXT NOT NULL DEFAULT 'vi',
        cha_id INTEGER REFERENCES binh_luan(id) ON DELETE CASCADE,
        ten TEXT NOT NULL,
        email TEXT NOT NULL,
        noi_dung TEXT NOT NULL,
        ip_bam TEXT NOT NULL,
        trang_thai TEXT NOT NULL CHECK (trang_thai IN ('hien', 'an', 'cho-xem')),
        ly_do_cho_xem TEXT,
        nguoi_dung_id INTEGER,
        la_tac_gia INTEGER NOT NULL DEFAULT 0,
        tao_luc INTEGER NOT NULL
      );
      CREATE INDEX binh_luan_bai ON binh_luan(bai_id, ngon_ngu, trang_thai, tao_luc);
      CREATE INDEX binh_luan_ip ON binh_luan(ip_bam, tao_luc);
      CREATE TABLE chan_binh_luan (
        loai TEXT NOT NULL CHECK (loai IN ('email', 'ip')),
        gia_tri_bam TEXT NOT NULL,
        PRIMARY KEY (loai, gia_tri_bam)
      );
      ALTER TABLE nguoi_dung ADD COLUMN nhan_mail_binh_luan INTEGER NOT NULL DEFAULT 1;
    `,
  },
  {
    phienBan: 13,
    sql: `
      CREATE TABLE nguoi_dang_ky (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        ngon_ngu TEXT NOT NULL DEFAULT 'vi',
        trang_thai TEXT NOT NULL CHECK (trang_thai IN ('cho-xac-nhan', 'da-xac-nhan', 'da-huy')),
        token_xac_nhan_bam TEXT NOT NULL,
        token_huy TEXT NOT NULL,
        tao_luc INTEGER NOT NULL,
        xac_nhan_luc INTEGER,
        huy_luc INTEGER,
        gui_xac_nhan_cuoi_luc INTEGER NOT NULL
      );
      CREATE INDEX nguoi_dang_ky_token_xn ON nguoi_dang_ky(token_xac_nhan_bam);
      CREATE UNIQUE INDEX nguoi_dang_ky_token_huy ON nguoi_dang_ky(token_huy);
      CREATE TABLE ban_tin (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tieu_de TEXT NOT NULL,
        noi_dung TEXT NOT NULL,
        ngon_ngu TEXT NOT NULL DEFAULT 'vi',
        loai TEXT NOT NULL CHECK (loai IN ('tu-soan', 'bai-moi')),
        bai_id INTEGER REFERENCES bai(id) ON DELETE SET NULL,
        trang_thai TEXT NOT NULL DEFAULT 'nhap' CHECK (trang_thai IN ('nhap', 'dang-gui', 'da-gui')),
        tao_luc INTEGER NOT NULL,
        gui_luc INTEGER,
        nguoi_gui_id INTEGER
      );
      CREATE TABLE ban_tin_gui (
        ban_tin_id INTEGER NOT NULL REFERENCES ban_tin(id) ON DELETE CASCADE,
        nguoi_dang_ky_id INTEGER NOT NULL REFERENCES nguoi_dang_ky(id) ON DELETE CASCADE,
        mail_id INTEGER,
        PRIMARY KEY (ban_tin_id, nguoi_dang_ky_id)
      );
      CREATE INDEX ban_tin_gui_mail ON ban_tin_gui(mail_id);
    `,
  },
  {
    phienBan: 14,
    sql: `
      CREATE TABLE ngon_ngu (
        ma TEXT PRIMARY KEY,
        ten TEXT NOT NULL,
        bat INTEGER NOT NULL DEFAULT 1,
        thu_tu INTEGER NOT NULL DEFAULT 0
      );
      INSERT INTO ngon_ngu (ma, ten, bat, thu_tu) VALUES ('vi', 'Tiếng Việt', 1, 0);
      ALTER TABLE ban_dich ADD COLUMN ban_goc_bam TEXT;
      ALTER TABLE ban_dich ADD COLUMN da_kiem_tra INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE ban_dich ADD COLUMN ghi_chu_kiem_tra TEXT;
      ALTER TABLE ban_dich ADD COLUMN nguoi_kiem_tra_id INTEGER;
      ALTER TABLE ban_dich ADD COLUMN kiem_tra_luc INTEGER;
      CREATE TABLE dich_cau_truc (
        loai TEXT NOT NULL CHECK (loai IN ('chuyen-muc', 'tinh', 'trang', 'menu', 'site', 'giao-dien')),
        khoa TEXT NOT NULL,
        ngon_ngu TEXT NOT NULL,
        du_lieu TEXT NOT NULL,
        sua_luc INTEGER NOT NULL,
        PRIMARY KEY (loai, khoa, ngon_ngu)
      );
    `,
  },
  {
    phienBan: 15,
    sql: `
      CREATE TABLE oauth_client (
        client_id TEXT PRIMARY KEY,
        du_lieu TEXT NOT NULL,
        tao_luc INTEGER NOT NULL
      );
      CREATE TABLE oauth_token (
        token_bam TEXT PRIMARY KEY,
        loai TEXT NOT NULL CHECK (loai IN ('access', 'refresh')),
        client_id TEXT NOT NULL,
        nguoi_dung_id INTEGER NOT NULL REFERENCES nguoi_dung(id) ON DELETE CASCADE,
        het_han_luc INTEGER NOT NULL,
        scopes TEXT NOT NULL,
        resource TEXT
      );
      CREATE INDEX oauth_token_nguoi ON oauth_token(nguoi_dung_id);
    `,
  },
];
