import { describe, expect, it } from 'vitest';
import { taoHangDoiBuild, type KetQuaBuild } from './hang-doi';

// Chạy giả có thể điều khiển: mỗi lần gọi trả về một promise mà test tự quyết lúc nào xong.
function chayGia() {
  const cho: Array<(kq: KetQuaBuild) => void> = [];
  let dong = 0;
  let toiDa = 0;
  let dangChay = 0;
  const chay = () => {
    dong++;
    dangChay++;
    toiDa = Math.max(toiDa, dangChay);
    return new Promise<KetQuaBuild>((resolve) => {
      cho.push((kq) => {
        dangChay--;
        resolve(kq);
      });
    });
  };
  return {
    chay,
    get soLan() {
      return dong;
    },
    get toiDa() {
      return toiDa;
    },
    xong: (kq: KetQuaBuild = { ok: true, sha: 'a'.repeat(40) }) => cho.shift()!(kq),
  };
}

const tick = () => new Promise((r) => setImmediate(r));

describe('hàng đợi build', () => {
  it('chạy một build khi có yêu cầu', async () => {
    const g = chayGia();
    const hd = taoHangDoiBuild(g.chay);
    hd.yeuCau();
    expect(g.soLan).toBe(1);
    expect(hd.trangThai().trangThai).toBe('dang-build');
    g.xong();
    await hd.doiXong();
    expect(hd.trangThai().trangThai).toBe('roi');
  });

  it('5 yêu cầu trong lúc đang build → đúng 1 build bù, không chạy chồng nhau', async () => {
    const g = chayGia();
    const hd = taoHangDoiBuild(g.chay);
    hd.yeuCau();
    hd.yeuCau();
    hd.yeuCau();
    hd.yeuCau();
    hd.yeuCau();
    expect(g.soLan).toBe(1);
    expect(hd.trangThai().dangCho).toBe(true);
    g.xong();
    await tick();
    expect(g.soLan).toBe(2);
    g.xong();
    await hd.doiXong();
    expect(g.soLan).toBe(2);
    expect(g.toiDa).toBe(1);
    expect(hd.trangThai().dangCho).toBe(false);
  });

  it('build lỗi không làm hàng đợi kẹt; lanCuoi phản ánh lần gần nhất', async () => {
    const g = chayGia();
    const hd = taoHangDoiBuild(g.chay);
    hd.yeuCau();
    g.xong({ ok: false, log: 'x' });
    await hd.doiXong();
    expect(hd.trangThai().lanCuoi?.ok).toBe(false);
    hd.yeuCau();
    expect(g.soLan).toBe(2);
    g.xong({ ok: true, sha: 'b'.repeat(40) });
    await hd.doiXong();
    expect(hd.trangThai().lanCuoi?.ok).toBe(true);
    expect(hd.trangThai().lanCuoi?.sha).toBe('b'.repeat(40));
  });

  it('chay ném exception → lanCuoi.ok là false, không unhandled rejection', async () => {
    const hd = taoHangDoiBuild(async () => {
      throw new Error('hỏng');
    });
    hd.yeuCau();
    await hd.doiXong();
    expect(hd.trangThai().lanCuoi?.ok).toBe(false);
    expect(hd.trangThai().trangThai).toBe('roi');
  });
});
