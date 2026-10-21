import { describe, expect, it, vi } from 'vitest';
import { GithubClient, LoiGithub, XungDot } from './client';

const TOKEN = 'ghp_RAT_BI_MAT_123';

// Giả octokit: chỉ những hàm GithubClient dùng.
function giaOctokit(over: Record<string, any> = {}) {
  return {
    rest: {
      repos: {
        getContent: vi.fn(),
        createOrUpdateFileContents: vi.fn(),
        getBranch: vi.fn(),
        ...over.repos,
      },
      actions: { listWorkflowRunsForRepo: vi.fn(), ...over.actions },
    },
  } as any;
}
const loiHttp = (status: number, message = 'x') => Object.assign(new Error(message), { status });

describe('GithubClient.docFile', () => {
  it('giải mã nội dung base64 UTF-8 và trả sha', async () => {
    const o = giaOctokit();
    o.rest.repos.getContent.mockResolvedValue({
      data: { type: 'file', sha: 'abc', content: Buffer.from('Vũng Tàu\n', 'utf8').toString('base64') + '\n' },
    });
    const c = new GithubClient(o, 'chu/repo');
    expect(await c.docFile('a.md')).toEqual({ noiDung: 'Vũng Tàu\n', sha: 'abc' });
    expect(o.rest.repos.getContent).toHaveBeenCalledWith(expect.objectContaining({ owner: 'chu', repo: 'repo', path: 'a.md', ref: 'main' }));
  });

  it('không có file (404) → null', async () => {
    const o = giaOctokit();
    o.rest.repos.getContent.mockRejectedValue(loiHttp(404));
    expect(await new GithubClient(o, 'chu/repo').docFile('khong.md')).toBeNull();
  });
});

describe('GithubClient.ghiFile', () => {
  it('ghi file mới, trả commitSha', async () => {
    const o = giaOctokit();
    o.rest.repos.createOrUpdateFileContents.mockResolvedValue({ data: { commit: { sha: 'c1' } } });
    const r = await new GithubClient(o, 'chu/repo').ghiFile('a.md', 'Xin chào', 'thêm bài');
    expect(r).toEqual({ commitSha: 'c1' });
    const arg = o.rest.repos.createOrUpdateFileContents.mock.calls[0][0];
    expect(Buffer.from(arg.content, 'base64').toString('utf8')).toBe('Xin chào');
    expect(arg.sha).toBeUndefined();
    expect(arg.branch).toBe('main');
  });

  it('sha cũ lệch (409/422) → XungDot, không ghi đè', async () => {
    for (const s of [409, 422]) {
      const o = giaOctokit();
      o.rest.repos.createOrUpdateFileContents.mockRejectedValue(loiHttp(s));
      await expect(new GithubClient(o, 'chu/repo').ghiFile('a.md', 'x', 'm', 'sha-cu')).rejects.toBeInstanceOf(XungDot);
    }
  });

  it('lỗi khác → LoiGithub, thông báo KHÔNG chứa token dù lỗi gốc có chứa', async () => {
    const o = giaOctokit();
    o.rest.repos.createOrUpdateFileContents.mockRejectedValue(loiHttp(500, `boom Authorization: token ${TOKEN}`));
    const err = await new GithubClient(o, 'chu/repo').ghiFile('a.md', 'x', 'm').catch((e) => e);
    expect(err).toBeInstanceOf(LoiGithub);
    expect(JSON.stringify([err.message, err.stack ?? '', String(err)])).not.toContain(TOKEN);
    expect(err.status).toBe(500);
  });
});

describe('GithubClient.liet / shaMoiNhat', () => {
  it('liet trả tên các file trong thư mục (bỏ thư mục con), thư mục chưa có → []', async () => {
    const o = giaOctokit();
    o.rest.repos.getContent.mockResolvedValueOnce({ data: [{ type: 'file', name: 'a.md', path: 'd/a.md' }, { type: 'dir', name: 'x', path: 'd/x' }] });
    const c = new GithubClient(o, 'chu/repo');
    expect(await c.liet('d')).toEqual(['d/a.md']);
    o.rest.repos.getContent.mockRejectedValueOnce(loiHttp(404));
    expect(await c.liet('khong-co')).toEqual([]);
  });

  it('shaMoiNhat lấy commit đầu nhánh main', async () => {
    const o = giaOctokit();
    o.rest.repos.getBranch.mockResolvedValue({ data: { commit: { sha: 'head1' } } });
    expect(await new GithubClient(o, 'chu/repo').shaMoiNhat()).toBe('head1');
  });

  it('không còn trangThaiWorkflow: build chạy trong container, không qua GitHub Actions', () => {
    expect('trangThaiWorkflow' in new GithubClient(giaOctokit(), 'chu/repo')).toBe(false);
  });
});
