// Lớp bọc mỏng quanh Octokit để MCP đọc/ghi bài trong repo GitHub (nguồn sự thật của bài viết).
// Hai quy tắc an toàn:
//  1) Ghi file luôn kèm sha cũ → nếu file đã đổi từ lúc đọc thì báo XungDot, KHÔNG ghi đè.
//  2) Mọi lỗi từ GitHub được chuyển thành LoiGithub với thông báo chung — không bao giờ chuyển tiếp văn bản lỗi gốc,
//     vì nó có thể chứa token.
import type { Octokit } from '@octokit/rest';

export class LoiGithub extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = 'LoiGithub';
  }
}
export class XungDot extends LoiGithub {
  constructor() {
    super('File đã thay đổi từ lúc đọc (có người hoặc /admin vừa sửa). Hãy đọc lại bài rồi thử lại.', 409);
    this.name = 'XungDot';
  }
}

type OctokitToiThieu = Pick<Octokit, 'rest'>;

const status = (e: unknown): number | undefined => (e as { status?: number })?.status;

function chuyenLoi(e: unknown, viec: string): never {
  const s = status(e);
  if (s === 409 || s === 422) throw new XungDot();
  throw new LoiGithub(`GitHub báo lỗi khi ${viec}${s ? ` (mã ${s})` : ''}.`, s);
}

export class GithubClient {
  private owner: string;
  private repo: string;

  constructor(
    private octokit: OctokitToiThieu,
    repoDayDu: string,
    private nhanh = 'main',
  ) {
    [this.owner, this.repo] = repoDayDu.split('/');
  }

  async docFile(path: string): Promise<{ noiDung: string; sha: string } | null> {
    try {
      const { data } = await this.octokit.rest.repos.getContent({ owner: this.owner, repo: this.repo, path, ref: this.nhanh });
      if (Array.isArray(data) || data.type !== 'file') return null;
      return { noiDung: Buffer.from(data.content, 'base64').toString('utf8'), sha: data.sha };
    } catch (e) {
      if (status(e) === 404) return null;
      return chuyenLoi(e, `đọc ${path}`);
    }
  }

  async ghiFile(path: string, noiDung: string, thongDiep: string, shaCu?: string): Promise<{ commitSha: string }> {
    try {
      const { data } = await this.octokit.rest.repos.createOrUpdateFileContents({
        owner: this.owner,
        repo: this.repo,
        path,
        message: thongDiep,
        content: Buffer.from(noiDung, 'utf8').toString('base64'),
        branch: this.nhanh,
        ...(shaCu ? { sha: shaCu } : {}),
      });
      return { commitSha: data.commit.sha! };
    } catch (e) {
      return chuyenLoi(e, `ghi ${path}`);
    }
  }

  // Ghi NHIỀU file trong MỘT commit (vd sửa bài + thêm redirect phải đi cùng nhau, nếu không URL cũ sẽ chết).
  // Chống ghi đè: mỗi file kèm shaCu (bản đã đọc). File đã đổi → XungDot. File mới (không shaCu) mà đã tồn tại → XungDot.
  // Cập nhật nhánh KHÔNG force: nếu có ai commit chen vào giữa chừng, GitHub từ chối → XungDot.
  async ghiNhieuFile(
    files: { path: string; noiDung: string; shaCu?: string }[],
    thongDiep: string,
  ): Promise<{ commitSha: string }> {
    for (const f of files) {
      const hienTai = await this.docFile(f.path);
      if ((hienTai?.sha ?? undefined) !== f.shaCu) throw new XungDot();
    }
    try {
      const ref = `heads/${this.nhanh}`;
      const g = this.octokit.rest.git;
      const goc = { owner: this.owner, repo: this.repo };
      const head = (await g.getRef({ ...goc, ref })).data.object.sha;
      const treeGoc = (await g.getCommit({ ...goc, commit_sha: head })).data.tree.sha;
      const tree = await g.createTree({
        ...goc,
        base_tree: treeGoc,
        tree: files.map((f) => ({ path: f.path, mode: '100644' as const, type: 'blob' as const, content: f.noiDung })),
      });
      const commit = await g.createCommit({ ...goc, message: thongDiep, tree: tree.data.sha, parents: [head] });
      await g.updateRef({ ...goc, ref, sha: commit.data.sha, force: false });
      return { commitSha: commit.data.sha };
    } catch (e) {
      return chuyenLoi(e, 'ghi nhiều file');
    }
  }

  // Đường dẫn các file (không gồm thư mục con) trong một thư mục; thư mục chưa có → [].
  async liet(thuMuc: string): Promise<string[]> {
    try {
      const { data } = await this.octokit.rest.repos.getContent({ owner: this.owner, repo: this.repo, path: thuMuc, ref: this.nhanh });
      return Array.isArray(data) ? data.filter((x) => x.type === 'file').map((x) => x.path) : [];
    } catch (e) {
      if (status(e) === 404) return [];
      return chuyenLoi(e, `liệt kê ${thuMuc}`);
    }
  }

  async shaMoiNhat(): Promise<string> {
    try {
      const { data } = await this.octokit.rest.repos.getBranch({ owner: this.owner, repo: this.repo, branch: this.nhanh });
      return data.commit.sha;
    } catch (e) {
      return chuyenLoi(e, 'đọc commit mới nhất');
    }
  }
}
