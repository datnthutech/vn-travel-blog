// Tài khoản: băm argon2id, luật mật khẩu ≥ 12 ký tự, email không phân biệt hoa/thường, đổi mật khẩu đăng xuất mọi nơi.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { chayCli, type CliIo } from '../cli';
import { duongDanDb, moDb } from '../db/ket-noi';
import { bamMatKhau, kiemMatKhau, matKhauHopLe } from './mat-khau';
import { demQuanTriHoatDong, doiMatKhau, docMatKhauBam, taoNguoiDung, timTheoEmail } from './nguoi-dung';

const MK = 'mat-khau-dai-12-ky-tu';

describe('mat-khau', () => {
  it('băm hai lần cùng mật khẩu → hai chuỗi khác nhau, cả hai kiểm đúng; sai mật khẩu → false', async () => {
    const a = await bamMatKhau(MK);
    const b = await bamMatKhau(MK);
    expect(a).not.toBe(b);
    expect(a.startsWith('$argon2id$')).toBe(true);
    expect(await kiemMatKhau(a, MK)).toBe(true);
    expect(await kiemMatKhau(b, MK)).toBe(true);
    expect(await kiemMatKhau(a, MK + 'x')).toBe(false);
  });

  it('kiemMatKhau với chuỗi băm hỏng → false, không ném lỗi', async () => {
    expect(await kiemMatKhau('khong-phai-bam', MK)).toBe(false);
  });

  it('mật khẩu 11 ký tự → lỗi; 12 ký tự → hợp lệ', () => {
    expect(matKhauHopLe('a'.repeat(11))).toMatch(/12/);
    expect(matKhauHopLe('a'.repeat(12))).toBeNull();
  });
});

describe('nguoi-dung', () => {
  it('tạo người dùng: trả NguoiDung (không có mật khẩu), lưu băm, đọc lại theo email không phân biệt hoa/thường', async () => {
    const db = moDb(':memory:');
    const u = await taoNguoiDung(db, { email: 'A@Example.com', ten: 'An', vaiTro: 'quan-tri', matKhau: MK });
    expect(u).toEqual({ id: expect.any(Number), email: 'A@Example.com', ten: 'An', vaiTro: 'quan-tri', biKhoa: false, coTotp: false });
    expect(JSON.stringify(u)).not.toContain('argon2');
    expect((await timTheoEmail(db, 'a@example.COM'))?.id).toBe(u.id);
    expect(await kiemMatKhau(docMatKhauBam(db, u.id)!, MK)).toBe(true);
  });

  it('email trùng khác hoa/thường → lỗi; mật khẩu ngắn → lỗi', async () => {
    const db = moDb(':memory:');
    await taoNguoiDung(db, { email: 'a@x.vn', ten: 'A', vaiTro: 'writer', matKhau: MK });
    await expect(taoNguoiDung(db, { email: 'A@X.vn', ten: 'B', vaiTro: 'writer', matKhau: MK })).rejects.toThrow(/đã/);
    await expect(taoNguoiDung(db, { email: 'b@x.vn', ten: 'B', vaiTro: 'writer', matKhau: 'ngan' })).rejects.toThrow(/12/);
  });

  it('doiMatKhau xoá mọi dòng phien của người đó (và chỉ người đó)', async () => {
    const db = moDb(':memory:');
    const a = await taoNguoiDung(db, { email: 'a@x.vn', ten: 'A', vaiTro: 'writer', matKhau: MK });
    const b = await taoNguoiDung(db, { email: 'b@x.vn', ten: 'B', vaiTro: 'writer', matKhau: MK });
    const them = db.prepare('INSERT INTO phien (token_bam, nguoi_dung_id, tao_luc, dung_cuoi_luc, het_han_luc) VALUES (?,?,1,1,9)');
    them.run('t1', a.id);
    them.run('t2', a.id);
    them.run('t3', b.id);
    await doiMatKhau(db, a.id, 'mat-khau-moi-12-ky-tu');
    expect(db.prepare('SELECT count(*) AS n FROM phien WHERE nguoi_dung_id = ?').get(a.id)).toEqual({ n: 0 });
    expect(db.prepare('SELECT count(*) AS n FROM phien WHERE nguoi_dung_id = ?').get(b.id)).toEqual({ n: 1 });
    expect(await kiemMatKhau(docMatKhauBam(db, a.id)!, 'mat-khau-moi-12-ky-tu')).toBe(true);
    await expect(doiMatKhau(db, a.id, 'ngan')).rejects.toThrow(/12/);
  });

  it('demQuanTriHoatDong chỉ đếm quan-tri không bị khoá', async () => {
    const db = moDb(':memory:');
    const a = await taoNguoiDung(db, { email: 'a@x.vn', ten: 'A', vaiTro: 'quan-tri', matKhau: MK });
    await taoNguoiDung(db, { email: 'b@x.vn', ten: 'B', vaiTro: 'quan-tri', matKhau: MK });
    await taoNguoiDung(db, { email: 'c@x.vn', ten: 'C', vaiTro: 'writer', matKhau: MK });
    expect(demQuanTriHoatDong(db)).toBe(2);
    db.prepare('UPDATE nguoi_dung SET bi_khoa = 1 WHERE id = ?').run(a.id);
    expect(demQuanTriHoatDong(db)).toBe(1);
  });
});

describe('CLI tao-quan-tri / dat-lai-mat-khau', () => {
  function dung() {
    const dataDir = mkdtempSync(join(tmpdir(), 'vtt-cli-'));
    mkdirSync(join(dataDir, 'db'), { recursive: true });
    const ra: string[] = [];
    const loi: string[] = [];
    const io: CliIo = {
      dataDir, now: Date.now, hoi: async () => '', docMatKhau: async () => MK,
      in: (s) => ra.push(s), loi: (s) => loi.push(s),
    };
    return { dataDir, io, ra, loi };
  }

  it('tạo quản trị từ mật khẩu đọc qua stdin, không in mật khẩu ra stdout/stderr', async () => {
    const { io, dataDir, ra, loi } = dung();
    expect(await chayCli(['tao-quan-tri', '--email', 'chu@x.vn', '--ten', 'Chủ blog'], io)).toBe(0);
    const db = moDb(duongDanDb(dataDir));
    const u = await timTheoEmail(db, 'chu@x.vn');
    expect(u).toMatchObject({ vaiTro: 'quan-tri', ten: 'Chủ blog' });
    expect([...ra, ...loi].join('\n')).not.toContain(MK);
  });

  it('không nhận mật khẩu qua tham số; thiếu --email → lỗi', async () => {
    const { io, loi } = dung();
    expect(await chayCli(['tao-quan-tri', '--ten', 'A'], io)).not.toBe(0);
    expect(await chayCli(['tao-quan-tri', '--email', 'a@x.vn', '--ten', 'A', '--mat-khau', MK], io)).not.toBe(0);
    expect(loi.join('\n')).not.toContain(MK);
  });

  it('mật khẩu ngắn → mã thoát khác 0, báo lỗi tiếng Việt', async () => {
    const { io, loi } = dung();
    io.docMatKhau = async () => 'ngan';
    expect(await chayCli(['tao-quan-tri', '--email', 'a@x.vn', '--ten', 'A'], io)).not.toBe(0);
    expect(loi.join('\n')).toMatch(/12/);
  });

  it('dat-lai-mat-khau đổi mật khẩu và đăng xuất mọi phiên', async () => {
    const { io, dataDir } = dung();
    await chayCli(['tao-quan-tri', '--email', 'a@x.vn', '--ten', 'A'], io);
    const db = moDb(duongDanDb(dataDir));
    const u = (await timTheoEmail(db, 'a@x.vn'))!;
    db.prepare('INSERT INTO phien (token_bam, nguoi_dung_id, tao_luc, dung_cuoi_luc, het_han_luc) VALUES (?,?,1,1,9)').run('t', u.id);
    db.close();
    io.docMatKhau = async () => 'mat-khau-moi-12-ky-tu';
    expect(await chayCli(['dat-lai-mat-khau', '--email', 'a@x.vn'], io)).toBe(0);
    const db2 = moDb(duongDanDb(dataDir));
    expect(db2.prepare('SELECT count(*) AS n FROM phien').get()).toEqual({ n: 0 });
    expect(await kiemMatKhau(docMatKhauBam(db2, u.id)!, 'mat-khau-moi-12-ky-tu')).toBe(true);
    expect(await chayCli(['dat-lai-mat-khau', '--email', 'khong-co@x.vn'], io)).not.toBe(0);
  });

  it('chạy thật qua tiến trình: mật khẩu đọc từ stdin, không lộ ở stdout/stderr', () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'vtt-cli-proc-'));
    const r = spawnSync('npx', ['tsx', join(import.meta.dirname, '../cli.ts'), 'tao-quan-tri', '--email', 'p@x.vn', '--ten', 'P'], {
      input: MK + '\n', env: { ...process.env, DATA_DIR: dataDir }, encoding: 'utf8',
    });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout + r.stderr).not.toContain(MK);
    const db = moDb(duongDanDb(dataDir));
    expect(db.prepare('SELECT count(*) AS n FROM nguoi_dung').get()).toEqual({ n: 1 });
  }, 30_000);
});
