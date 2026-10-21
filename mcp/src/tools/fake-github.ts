// GitHub GIẢ có trạng thái, chỉ dùng trong test: giữ file trong bộ nhớ, tính sha theo phiên bản,
// phát hiện xung đột như GithubClient thật, và ghi lại mỗi lần ghi (để test đếm commit).
import { XungDot, type GithubClient } from '../github/client';

export interface LanGhi {
  loai: 'ghiFile' | 'ghiNhieuFile';
  paths: string[];
  thongDiep: string;
}

export class FakeGithub {
  private files = new Map<string, { noiDung: string; v: number }>();
  private v = 0;
  lanGhi: LanGhi[] = [];
  head = 'head0';

  constructor(khoiTao: Record<string, string> = {}) {
    for (const [p, nd] of Object.entries(khoiTao)) this.files.set(p, { noiDung: nd, v: ++this.v });
  }

  doc(path: string): string | undefined {
    return this.files.get(path)?.noiDung;
  }

  private sha(path: string) {
    const f = this.files.get(path);
    return f ? `sha-${f.v}` : undefined;
  }

  private commit() {
    this.head = `head${this.lanGhi.length}`;
    return this.head;
  }

  async docFile(path: string) {
    const f = this.files.get(path);
    return f ? { noiDung: f.noiDung, sha: this.sha(path)! } : null;
  }

  async liet(thuMuc: string) {
    return [...this.files.keys()].filter((p) => p.startsWith(thuMuc + '/') && !p.slice(thuMuc.length + 1).includes('/'));
  }

  async ghiFile(path: string, noiDung: string, thongDiep: string, shaCu?: string) {
    if (this.sha(path) !== shaCu) throw new XungDot();
    this.files.set(path, { noiDung, v: ++this.v });
    this.lanGhi.push({ loai: 'ghiFile', paths: [path], thongDiep });
    return { commitSha: this.commit() };
  }

  async ghiNhieuFile(files: { path: string; noiDung: string; shaCu?: string }[], thongDiep: string) {
    for (const f of files) if (this.sha(f.path) !== f.shaCu) throw new XungDot();
    for (const f of files) this.files.set(f.path, { noiDung: f.noiDung, v: ++this.v });
    this.lanGhi.push({ loai: 'ghiNhieuFile', paths: files.map((f) => f.path), thongDiep });
    return { commitSha: this.commit() };
  }

  async shaMoiNhat() {
    return this.head;
  }

  asClient(): GithubClient {
    return this as unknown as GithubClient;
  }
}
