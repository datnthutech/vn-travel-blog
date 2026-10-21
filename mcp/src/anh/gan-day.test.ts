import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ghiNhanAnh, layAnhGanDay } from './gan-day';

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'vtt-gd-'));
});
afterAll(() => rm(dir, { recursive: true, force: true }));

describe('danh sách ảnh gần đây', () => {
  it('chưa có file → mảng rỗng', async () => {
    expect(await layAnhGanDay(dir, 10)).toEqual([]);
  });

  it('mới nhất trước, giới hạn số lượng', async () => {
    for (let i = 1; i <= 5; i++) await ghiNhanAnh(dir, { ma: `m${i}`, ten: `a${i}.jpg`, luc: 1000 + i });
    const r = await layAnhGanDay(dir, 3);
    expect(r.map((a) => a.ma)).toEqual(['m5', 'm4', 'm3']);
  });

  it('chỉ giữ 200 ảnh gần nhất', async () => {
    for (let i = 0; i < 205; i++) await ghiNhanAnh(dir, { ma: `n${i}`, ten: 'x.jpg', luc: 5000 + i });
    expect((await layAnhGanDay(dir, 1000)).length).toBe(200);
  });

  it('file hỏng → coi như rỗng, không ném lỗi', async () => {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(join(dir, '.gan-day.json'), '{hỏng');
    expect(await layAnhGanDay(dir, 5)).toEqual([]);
  });
});
