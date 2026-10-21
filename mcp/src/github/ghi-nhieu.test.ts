import { describe, expect, it, vi } from 'vitest';
import { GithubClient, XungDot } from './client';

const loiHttp = (status: number) => Object.assign(new Error('x'), { status });

function giaGit(hienTai: Record<string, string> = {}) {
  return {
    rest: {
      repos: {
        getContent: vi.fn(async ({ path }: { path: string }) => {
          if (path in hienTai) return { data: { type: 'file', sha: hienTai[path], content: Buffer.from('x').toString('base64') } };
          throw loiHttp(404);
        }),
      },
      git: {
        getRef: vi.fn().mockResolvedValue({ data: { object: { sha: 'head1' } } }),
        getCommit: vi.fn().mockResolvedValue({ data: { tree: { sha: 'tree1' } } }),
        createTree: vi.fn().mockResolvedValue({ data: { sha: 'tree2' } }),
        createCommit: vi.fn().mockResolvedValue({ data: { sha: 'commit2' } }),
        updateRef: vi.fn().mockResolvedValue({}),
      },
    },
  } as any;
}

describe('GithubClient.ghiNhieuFile (một commit, nhiều file)', () => {
  it('tạo 1 commit chứa mọi file, cha là head hiện tại, cập nhật nhánh KHÔNG force', async () => {
    const o = giaGit({ 'a.md': 'sha-a' });
    const r = await new GithubClient(o, 'chu/repo').ghiNhieuFile(
      [{ path: 'a.md', noiDung: 'Tiếng Việt', shaCu: 'sha-a' }, { path: 'b.json', noiDung: '[]' }],
      'sửa bài',
    );
    expect(r).toEqual({ commitSha: 'commit2' });
    const tree = o.rest.git.createTree.mock.calls[0][0];
    expect(tree.base_tree).toBe('tree1');
    expect(tree.tree).toEqual([
      { path: 'a.md', mode: '100644', type: 'blob', content: 'Tiếng Việt' },
      { path: 'b.json', mode: '100644', type: 'blob', content: '[]' },
    ]);
    expect(o.rest.git.createCommit.mock.calls[0][0]).toMatchObject({ message: 'sửa bài', tree: 'tree2', parents: ['head1'] });
    expect(o.rest.git.updateRef.mock.calls[0][0]).toMatchObject({ ref: 'heads/main', sha: 'commit2', force: false });
  });

  it('shaCu lệch với bản hiện tại → XungDot, không tạo commit', async () => {
    const o = giaGit({ 'a.md': 'sha-moi' });
    await expect(new GithubClient(o, 'chu/repo').ghiNhieuFile([{ path: 'a.md', noiDung: 'x', shaCu: 'sha-cu' }], 'm')).rejects.toBeInstanceOf(XungDot);
    expect(o.rest.git.createCommit).not.toHaveBeenCalled();
  });

  it('file mới (không shaCu) nhưng đã tồn tại → XungDot', async () => {
    const o = giaGit({ 'a.md': 'sha-a' });
    await expect(new GithubClient(o, 'chu/repo').ghiNhieuFile([{ path: 'a.md', noiDung: 'x' }], 'm')).rejects.toBeInstanceOf(XungDot);
  });

  it('có shaCu nhưng file đã biến mất → XungDot', async () => {
    const o = giaGit({});
    await expect(new GithubClient(o, 'chu/repo').ghiNhieuFile([{ path: 'a.md', noiDung: 'x', shaCu: 'sha-a' }], 'm')).rejects.toBeInstanceOf(XungDot);
  });

  it('nhánh đã đi tiếp lúc cập nhật (422) → XungDot', async () => {
    const o = giaGit({});
    o.rest.git.updateRef.mockRejectedValue(loiHttp(422));
    await expect(new GithubClient(o, 'chu/repo').ghiNhieuFile([{ path: 'b.json', noiDung: '[]' }], 'm')).rejects.toBeInstanceOf(XungDot);
  });
});
