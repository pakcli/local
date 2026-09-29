import { GitCliService } from './GitCliService';
import { SnapshotEntry } from '../types';
import { SNAPSHOT_REF_PREFIX, DEFAULT_RETENTION } from '../constants';

export class SnapshotEngine {
  /**
   * Generates standard formatted snapshot label: yyyy-mm-dd_hh-mm_custom message
   */
  static buildSnapshotLabel(customMsg?: string): string {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const ts = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}`;
    const cleanMsg = (customMsg || '').trim().replace(/[\r\n\t]/g, ' ');
    return cleanMsg ? `${ts}_${cleanMsg}` : `${ts}_auto checkpoint`;
  }

  /**
   * Non-destructive local snapshot using `git stash create` -> `refs/snapshots/*`
   */
  static async createSnapshot(
    repoPath: string,
    message?: string,
    includeUntracked = false,
    retentionMax = DEFAULT_RETENTION
  ): Promise<SnapshotEntry> {
    const label = this.buildSnapshotLabel(message);
    const ref = `${SNAPSHOT_REF_PREFIX}${label}`;

    let capturedSha = '';

    if (includeUntracked) {
      // Stage untracked files temporarily to ensure git stash create includes them
      await GitCliService.exec(repoPath, ['add', '-A']);
      const stashRes = await GitCliService.exec(repoPath, ['stash', 'create', label]);
      capturedSha = stashRes.stdout.trim();
      // Restore previous staging state
      await GitCliService.exec(repoPath, ['reset', 'HEAD']);
    } else {
      const stashRes = await GitCliService.exec(repoPath, ['stash', 'create', label]);
      capturedSha = stashRes.stdout.trim();
    }

    // If working tree is clean, stash create returns empty string.
    // In that case, capture HEAD commit so user still gets a milestone snapshot!
    if (!capturedSha) {
      const headRes = await GitCliService.exec(repoPath, ['rev-parse', 'HEAD']);
      capturedSha = headRes.stdout.trim();
    }

    if (!capturedSha) {
      throw new Error('Unable to create snapshot: repository has no commits or valid state.');
    }

    // Store ref directly in refs/snapshots/<label>
    const updateRes = await GitCliService.exec(repoPath, ['update-ref', ref, capturedSha]);
    if (updateRes.code !== 0) {
      throw new Error(`Failed to update snapshot ref: ${updateRes.stderr}`);
    }

    // Auto-prune older snapshots if count exceeds retention limit
    await this.pruneSnapshots(repoPath, retentionMax);

    return {
      ref,
      label,
      timestamp: new Date().toISOString(),
      sha: capturedSha,
      repoPath,
    };
  }

  /**
   * Lists all local snapshots sorted from newest to oldest
   */
  static async listSnapshots(repoPath: string): Promise<SnapshotEntry[]> {
    const format = '%(refname)|%(objectname)|%(committerdate:iso8601)|%(subject)';
    const res = await GitCliService.exec(repoPath, [
      'for-each-ref',
      '--sort=-committerdate',
      `--format=${format}`,
      SNAPSHOT_REF_PREFIX,
    ]);

    if (res.code !== 0 || !res.stdout.trim()) {
      return [];
    }

    const lines = res.stdout.split(/\r?\n/).filter(Boolean);
    const results: SnapshotEntry[] = [];

    for (const line of lines) {
      const [ref, sha, isoDate] = line.split('|');
      if (!ref) continue;
      const label = ref.replace(SNAPSHOT_REF_PREFIX, '');
      results.push({
        ref,
        label,
        timestamp: isoDate || new Date().toISOString(),
        sha: sha || '',
        repoPath,
      });
    }

    return results;
  }

  /**
   * Retrieves the list of files modified in a given snapshot
   */
  static async getSnapshotFiles(repoPath: string, shaOrRef: string): Promise<string[]> {
    // Check if the commit has a parent commit
    const parentRes = await GitCliService.exec(repoPath, ['rev-parse', `${shaOrRef}^`]);
    const hasParent = parentRes.code === 0;

    let res;
    if (hasParent) {
      res = await GitCliService.exec(repoPath, [
        'diff-tree',
        '--no-commit-id',
        '--name-only',
        '-r',
        shaOrRef,
      ]);
    } else {
      res = await GitCliService.exec(repoPath, [
        'show',
        '--pretty=',
        '--name-only',
        shaOrRef,
      ]);
    }

    if (res.code !== 0 || !res.stdout.trim()) {
      return [];
    }
    return res.stdout.split(/\r?\n/).filter(Boolean);
  }

  /**
   * Retrieves unified diff content for a snapshot (optionally filtered by file)
   */
  static async getSnapshotDiff(repoPath: string, shaOrRef: string, file?: string): Promise<string> {
    const parentRes = await GitCliService.exec(repoPath, ['rev-parse', `${shaOrRef}^`]);
    const hasParent = parentRes.code === 0;

    const args = ['diff'];
    if (hasParent) {
      args.push(`${shaOrRef}^`, shaOrRef);
    } else {
      args.push('4b825dc642cb6eb9a060e54bf8d69288fbee4904', shaOrRef); // empty tree sha
    }

    if (file) {
      args.push('--', file);
    }

    const res = await GitCliService.exec(repoPath, args);
    return res.stdout;
  }

  /**
   * Restores snapshot files into the working tree (creates an automatic safety snapshot first)
   */
  static async restoreSnapshot(repoPath: string, shaOrRef: string, files?: string[]): Promise<void> {
    // 1. Create safety snapshot first
    try {
      await this.createSnapshot(repoPath, 'safety checkpoint before restore');
    } catch {
      // Ignore if cannot checkpoint
    }

    // 2. Checkout specified files or all from snapshot commit
    const args = ['checkout', shaOrRef, '--'];
    if (files && files.length > 0) {
      args.push(...files);
    } else {
      args.push('.');
    }

    const res = await GitCliService.exec(repoPath, args);
    if (res.code !== 0) {
      throw new Error(`Failed to restore snapshot: ${res.stderr}`);
    }
  }

  /**
   * Deletes a snapshot ref
   */
  static async deleteSnapshot(repoPath: string, ref: string): Promise<void> {
    const res = await GitCliService.exec(repoPath, ['update-ref', '-d', ref]);
    if (res.code !== 0) {
      throw new Error(`Failed to delete snapshot ref ${ref}: ${res.stderr}`);
    }
  }

  /**
   * Auto-prunes older snapshots when exceeding maximum retention count
   */
  static async pruneSnapshots(repoPath: string, maxCount: number): Promise<number> {
    if (maxCount <= 0) return 0;
    const all = await this.listSnapshots(repoPath);
    if (all.length <= maxCount) return 0;

    const toDelete = all.slice(maxCount);
    let deletedCount = 0;
    for (const snap of toDelete) {
      try {
        await this.deleteSnapshot(repoPath, snap.ref);
        deletedCount++;
      } catch {
        // continue
      }
    }
    return deletedCount;
  }
}
