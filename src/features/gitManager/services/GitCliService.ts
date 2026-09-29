import { getNodeChildProcess } from '../../../utils/nodeHelpers';
import { CommitEntry, FileChangeEntry, RepoStatus } from '../types';

export interface ExecGitResult {
  stdout: string;
  stderr: string;
  code: number;
}

export class GitCliService {
  /**
   * Safely executes a git CLI command in the specified working directory
   */
  static async exec(
    repoPath: string,
    args: string[],
    options: { maxBuffer?: number; timeout?: number } = {}
  ): Promise<ExecGitResult> {
    const cp = getNodeChildProcess();
    if (!cp) {
      throw new Error('child_process is unavailable in this environment.');
    }

    const maxBuffer = options.maxBuffer || 1024 * 1024 * 8; // 8MB
    const timeout = options.timeout || 30000;

    return new Promise((resolve) => {
      cp.execFile(
        'git',
        args,
        { cwd: repoPath, maxBuffer, timeout, windowsHide: true },
        (error: any, stdout: string, stderr: string) => {
          resolve({
            stdout: stdout || '',
            stderr: stderr || '',
            code: error ? (typeof error.code === 'number' ? error.code : 1) : 0,
          });
        }
      );
    });
  }

  static async isGitRepo(absPath: string): Promise<boolean> {
    try {
      const res = await this.exec(absPath, ['rev-parse', '--is-inside-work-tree']);
      return res.code === 0 && res.stdout.trim() === 'true';
    } catch {
      return false;
    }
  }

  static async getCurrentBranch(repoPath: string): Promise<string> {
    const res = await this.exec(repoPath, ['branch', '--show-current']);
    if (res.code === 0 && res.stdout.trim()) {
      return res.stdout.trim();
    }
    // Fallback if in detached HEAD
    const revRes = await this.exec(repoPath, ['rev-parse', '--short', 'HEAD']);
    return revRes.code === 0 ? `HEAD (${revRes.stdout.trim()})` : 'unknown';
  }

  static async getAheadBehind(repoPath: string, branch: string): Promise<{ ahead: number; behind: number }> {
    if (!branch || branch.startsWith('HEAD (')) return { ahead: 0, behind: 0 };
    const res = await this.exec(repoPath, ['rev-list', '--left-right', '--count', `@{u}...HEAD`]);
    if (res.code === 0) {
      const parts = res.stdout.trim().split(/\s+/);
      if (parts.length >= 2) {
        return { behind: parseInt(parts[0], 10) || 0, ahead: parseInt(parts[1], 10) || 0 };
      }
    }
    return { ahead: 0, behind: 0 };
  }

  static async getStatus(repoPath: string): Promise<{
    status: RepoStatus;
    staged: FileChangeEntry[];
    unstaged: FileChangeEntry[];
    untracked: FileChangeEntry[];
  }> {
    const res = await this.exec(repoPath, ['status', '--porcelain=v1', '-uall']);
    if (res.code !== 0) {
      return { status: RepoStatus.Clean, staged: [], unstaged: [], untracked: [] };
    }

    const staged: FileChangeEntry[] = [];
    const unstaged: FileChangeEntry[] = [];
    const untracked: FileChangeEntry[] = [];

    const lines = res.stdout.split(/\r?\n/).filter((l) => l.length >= 3);
    let hasConflict = false;

    for (const line of lines) {
      const x = line[0];
      const y = line[1];
      const pathPart = line.slice(3).trim();

      // Check conflict
      if (x === 'U' || y === 'U' || (x === 'A' && y === 'A') || (x === 'D' && y === 'D')) {
        hasConflict = true;
      }

      if (x === '?' && y === '?') {
        untracked.push({ path: pathPart, status: '?', staged: false });
        continue;
      }

      if (x !== ' ' && x !== '?') {
        staged.push({ path: pathPart, status: x, staged: true });
      }

      if (y !== ' ' && y !== '?') {
        unstaged.push({ path: pathPart, status: y, staged: false });
      }
    }

    let status = RepoStatus.Clean;
    if (hasConflict) {
      status = RepoStatus.Conflict;
    } else if (staged.length > 0 && unstaged.length === 0 && untracked.length === 0) {
      status = RepoStatus.Staged;
    } else if (staged.length > 0 || unstaged.length > 0 || untracked.length > 0) {
      status = RepoStatus.Dirty;
    }

    return { status, staged, unstaged, untracked };
  }

  static async stageFile(repoPath: string, file: string): Promise<void> {
    await this.exec(repoPath, ['add', '--', file]);
  }

  static async unstageFile(repoPath: string, file: string): Promise<void> {
    // Try restore --staged first, fallback to reset HEAD
    const res = await this.exec(repoPath, ['restore', '--staged', '--', file]);
    if (res.code !== 0) {
      await this.exec(repoPath, ['reset', 'HEAD', '--', file]);
    }
  }

  static async stageAll(repoPath: string): Promise<void> {
    await this.exec(repoPath, ['add', '-A']);
  }

  static async unstageAll(repoPath: string): Promise<void> {
    const res = await this.exec(repoPath, ['restore', '--staged', '.']);
    if (res.code !== 0) {
      await this.exec(repoPath, ['reset', 'HEAD']);
    }
  }

  static async discardFile(repoPath: string, file: string, untracked = false): Promise<void> {
    if (untracked) {
      await this.exec(repoPath, ['clean', '-f', '--', file]);
    } else {
      const res = await this.exec(repoPath, ['restore', '--', file]);
      if (res.code !== 0) {
        await this.exec(repoPath, ['checkout', 'HEAD', '--', file]);
      }
    }
  }

  static async commit(repoPath: string, message: string): Promise<string> {
    const res = await this.exec(repoPath, ['commit', '-m', message]);
    if (res.code !== 0) {
      throw new Error(res.stderr || res.stdout || 'Commit failed.');
    }
    return res.stdout;
  }

  static async getDiff(repoPath: string, file?: string, staged = false): Promise<string> {
    const args = ['diff'];
    if (staged) args.push('--cached');
    if (file) args.push('--', file);
    const res = await this.exec(repoPath, args);
    return res.stdout;
  }

  static async getFullWorkingDiff(repoPath: string): Promise<string> {
    // Unified diff against HEAD including both staged and unstaged changes
    const res = await this.exec(repoPath, ['diff', 'HEAD']);
    if (res.code === 0 && res.stdout.trim()) {
      return res.stdout;
    }
    // If no commits yet or HEAD doesn't exist, try plain diff
    const fallback = await this.exec(repoPath, ['diff']);
    return fallback.stdout;
  }

  static async getLog(repoPath: string, maxCount = 50): Promise<CommitEntry[]> {
    const format = '%H|%h|%an|%ad|%ar|%s';
    const res = await this.exec(repoPath, [
      'log',
      `-n${maxCount}`,
      `--format=${format}`,
      '--date=iso',
    ]);
    if (res.code !== 0 || !res.stdout.trim()) return [];

    return res.stdout
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const [sha, shortSha, author, date, relativeDate, ...msgParts] = line.split('|');
        return {
          sha: sha || '',
          shortSha: shortSha || '',
          author: author || '',
          date: date || '',
          relativeDate: relativeDate || '',
          message: msgParts.join('|') || '',
        };
      });
  }

  static async checkout(repoPath: string, target: string): Promise<void> {
    const res = await this.exec(repoPath, ['checkout', target]);
    if (res.code !== 0) throw new Error(res.stderr || 'Checkout failed.');
  }

  static async createBranch(repoPath: string, branchName: string, startPoint?: string): Promise<void> {
    const args = ['checkout', '-b', branchName];
    if (startPoint) args.push(startPoint);
    const res = await this.exec(repoPath, args);
    if (res.code !== 0) throw new Error(res.stderr || 'Create branch failed.');
  }

  static async merge(repoPath: string, branchOrCommit: string): Promise<string> {
    const res = await this.exec(repoPath, ['merge', branchOrCommit]);
    if (res.code !== 0) throw new Error(res.stderr || res.stdout || 'Merge failed.');
    return res.stdout;
  }

  static async resetHard(repoPath: string, commitSha: string): Promise<void> {
    const res = await this.exec(repoPath, ['reset', '--hard', commitSha]);
    if (res.code !== 0) throw new Error(res.stderr || 'Reset failed.');
  }

  static async initRepo(targetPath: string, initialBranch = 'main'): Promise<void> {
    const res = await this.exec(targetPath, ['init', '-b', initialBranch]);
    if (res.code !== 0) {
      // Fallback for older git versions that don't support -b
      const fallback = await this.exec(targetPath, ['init']);
      if (fallback.code !== 0) throw new Error(fallback.stderr || 'git init failed');
      await this.exec(targetPath, ['checkout', '-b', initialBranch]);
    }
  }

  static async getRepoRoot(anyPath: string): Promise<string | null> {
    const res = await this.exec(anyPath, ['rev-parse', '--show-toplevel']);
    return res.code === 0 && res.stdout.trim() ? res.stdout.trim() : null;
  }

  static async getRemoteUrl(repoPath: string, remoteName = 'origin'): Promise<string> {
    const res = await this.exec(repoPath, ['remote', 'get-url', remoteName]);
    return res.code === 0 ? res.stdout.trim() : '';
  }

  static async setRemoteUrl(repoPath: string, remoteUrl: string, remoteName = 'origin'): Promise<void> {
    const existing = await this.getRemoteUrl(repoPath, remoteName);
    if (existing) {
      const res = await this.exec(repoPath, ['remote', 'set-url', remoteName, remoteUrl]);
      if (res.code !== 0) throw new Error(res.stderr || 'Failed to update remote URL');
    } else {
      const res = await this.exec(repoPath, ['remote', 'add', remoteName, remoteUrl]);
      if (res.code !== 0) throw new Error(res.stderr || 'Failed to add remote URL');
    }
  }

  static async removeRemote(repoPath: string, remoteName = 'origin'): Promise<void> {
    await this.exec(repoPath, ['remote', 'remove', remoteName]);
  }

  static async push(repoPath: string, branch?: string, remoteName = 'origin'): Promise<string> {
    const b = branch || (await this.getCurrentBranch(repoPath));
    const res = await this.exec(repoPath, ['push', '-u', remoteName, b]);
    if (res.code !== 0) throw new Error(res.stderr || res.stdout || 'git push failed');
    return res.stdout || res.stderr;
  }

  static async pull(repoPath: string, branch?: string, remoteName = 'origin'): Promise<string> {
    const b = branch || (await this.getCurrentBranch(repoPath));
    const res = await this.exec(repoPath, ['pull', '--rebase', remoteName, b]);
    if (res.code !== 0) throw new Error(res.stderr || res.stdout || 'git pull failed');
    return res.stdout || res.stderr;
  }

  static async getFileDiff(repoPath: string, filePath: string): Promise<string> {
    const res = await this.exec(repoPath, ['diff', 'HEAD', '--', filePath]);
    return res.code === 0 ? res.stdout : '';
  }

  static async getFileLog(repoPath: string, filePath: string, maxCount = 30): Promise<CommitEntry[]> {
    const format = '%H|%h|%an|%ad|%ar|%s';
    const res = await this.exec(repoPath, [
      'log',
      `-n${maxCount}`,
      '--follow',
      `--format=${format}`,
      '--date=iso',
      '--',
      filePath,
    ]);
    if (res.code !== 0 || !res.stdout.trim()) return [];

    return res.stdout
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const [sha, shortSha, author, date, relativeDate, ...msgParts] = line.split('|');
        return {
          sha: sha || '',
          shortSha: shortSha || '',
          author: author || '',
          date: date || '',
          relativeDate: relativeDate || '',
          message: msgParts.join('|') || '',
        };
      });
  }

  static async checkGhInstalled(): Promise<{ installed: boolean; version?: string }> {
    const cp = getNodeChildProcess();
    if (!cp) return { installed: false };
    return new Promise((resolve) => {
      cp.execFile('gh', ['--version'], { windowsHide: true }, (err: any, stdout: string) => {
        if (!err && stdout) {
          const match = stdout.match(/gh version\s+([^\s]+)/i);
          resolve({ installed: true, version: match ? match[1] : 'installed' });
        } else {
          resolve({ installed: false });
        }
      });
    });
  }
}
