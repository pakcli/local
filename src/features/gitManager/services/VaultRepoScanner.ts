import { App } from 'obsidian';
import { getNodeFs, PathUtils } from '../../../utils/nodeHelpers';
import { detectLink } from '../../symlink/detect';
import { GitCliService } from './GitCliService';
import { SnapshotEngine } from './SnapshotEngine';
import { RepoInfo } from '../types';

export class VaultRepoScanner {
  /**
   * Scans vault and configured watched paths for all active Git repositories
   */
  static async scanAllRepos(app: App, watchedPaths: string[] = []): Promise<RepoInfo[]> {
    const fs = getNodeFs();
    const candidatePaths = new Set<string>();

    // 1. Vault root path
    const adapter = app.vault.adapter as { getBasePath?: () => string };
    const vaultRoot = typeof adapter.getBasePath === 'function' ? adapter.getBasePath() : '';

    if (vaultRoot && fs && fs.existsSync(vaultRoot)) {
      candidatePaths.add(PathUtils.normalize(vaultRoot));

      // Scan top-level entries in vault
      try {
        const entries = fs.readdirSync(vaultRoot, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name.startsWith('.')) continue;
          const fullPath = PathUtils.join(vaultRoot, entry.name);

          // Check if symlink or junction
          const linkState = detectLink(fullPath);
          if (linkState.kind === 'active' && linkState.target) {
            candidatePaths.add(PathUtils.normalize(linkState.target));
            candidatePaths.add(PathUtils.normalize(fullPath));
          } else if (entry.isDirectory()) {
            candidatePaths.add(PathUtils.normalize(fullPath));
          }
        }
      } catch (err) {
        console.warn('[VaultRepoScanner] Error reading vault root:', err);
      }
    }

    // 2. Add custom watched paths
    for (const p of watchedPaths) {
      if (p && p.trim()) {
        candidatePaths.add(PathUtils.normalize(p.trim()));
      }
    }

    // 3. Verify each candidate path with GitCliService
    const validRepoPaths: { path: string; isSymlink: boolean }[] = [];
    for (const p of candidatePaths) {
      try {
        if (!fs || !fs.existsSync(p)) continue;
        const isRepo = await GitCliService.isGitRepo(p);
        if (isRepo) {
          const link = detectLink(p);
          const isSymlink = link.kind === 'active';
          validRepoPaths.push({ path: p, isSymlink });
        }
      } catch {
        // Skip unreadable paths
      }
    }

    // 4. De-duplicate paths
    const uniqueMap = new Map<string, { path: string; isSymlink: boolean }>();
    for (const item of validRepoPaths) {
      const key = item.path.toLowerCase().replace(/\\/g, '/');
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, item);
      }
    }

    // 5. Gather rich RepoInfo for each valid repo
    const results: RepoInfo[] = [];
    for (const { path: repoPath, isSymlink } of uniqueMap.values()) {
      try {
        const name = PathUtils.basename(repoPath) || repoPath;
        const currentBranch = await GitCliService.getCurrentBranch(repoPath);
        const { status, staged, unstaged, untracked } = await GitCliService.getStatus(repoPath);
        const aheadBehind = await GitCliService.getAheadBehind(repoPath, currentBranch);
        const remoteUrl = await GitCliService.getRemoteUrl(repoPath);
        const mode = remoteUrl ? 'github' : 'local-only';
        const snapshots = await SnapshotEngine.listSnapshots(repoPath);

        results.push({
          name,
          absPath: repoPath,
          isSymlink,
          currentBranch,
          status,
          aheadBehind,
          snapshotCount: snapshots.length,
          lastSnapshot: snapshots[0]?.label,
          stagedFiles: staged,
          unstagedFiles: unstaged,
          untrackedFiles: untracked,
          mode,
          remoteUrl: remoteUrl || undefined,
        });
      } catch (err) {
        console.error(`[VaultRepoScanner] Failed to parse repo at ${repoPath}:`, err);
      }
    }

    return results;
  }
}
