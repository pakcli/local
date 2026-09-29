import { App, TAbstractFile, TFile, TFolder } from 'obsidian';
import { PathUtils, getNodeFs } from '../../../utils/nodeHelpers';
import { ResolvedArea } from '../types';

export class AreaResolver {
  /**
   * Synchronously resolves the target area (folder or file containing folder) according to the Area Containment Rule.
   * Runs synchronously using Node.js fs.existsSync to allow immediate rendering in Obsidian's file-menu context menu.
   */
  static resolve(app: App, target: TAbstractFile): ResolvedArea {
    const adapter = app.vault.adapter as { getBasePath?: () => string };
    const vaultRoot = typeof adapter.getBasePath === 'function' ? adapter.getBasePath() : '';
    const fs = getNodeFs();

    const isGitDir = (dirPath: string): boolean => {
      if (!fs) return false;
      try {
        const gitPath = PathUtils.join(dirPath, '.git');
        return fs.existsSync(gitPath);
      } catch {
        return false;
      }
    };

    const findGitRoot = (startPath: string): string | undefined => {
      let current = PathUtils.normalize(startPath);
      const normalizedVaultRoot = PathUtils.normalize(vaultRoot);
      while (current) {
        if (isGitDir(current)) {
          return current;
        }
        if (
          current.toLowerCase() === normalizedVaultRoot.toLowerCase() ||
          current === '/' ||
          /^[a-zA-Z]:[/\\]?$/.test(current)
        ) {
          break;
        }
        const parent = PathUtils.dirname(current);
        if (parent === current) break;
        current = parent;
      }
      return undefined;
    };

    if (target instanceof TFolder) {
      const absPath = PathUtils.normalize(PathUtils.join(vaultRoot, target.path));
      const isDirectRepo = isGitDir(absPath);
      let gitRootPath = isDirectRepo ? absPath : undefined;

      if (!isDirectRepo) {
        const ancestor = findGitRoot(absPath);
        if (ancestor) gitRootPath = PathUtils.normalize(ancestor);
      }

      return {
        targetType: 'folder',
        absPath,
        areaFolderPath: absPath,
        areaFolderName: target.name || PathUtils.basename(absPath) || 'Vault Root',
        isGitRepo: isDirectRepo || Boolean(gitRootPath),
        gitRootPath,
      };
    } else if (target instanceof TFile) {
      const absPath = PathUtils.normalize(PathUtils.join(vaultRoot, target.path));
      const parentVaultPath = target.parent ? target.parent.path : '';
      const areaFolderPath = PathUtils.normalize(PathUtils.join(vaultRoot, parentVaultPath));
      const areaFolderName = target.parent?.name || PathUtils.basename(areaFolderPath) || 'Vault Root';

      const isDirectRepo = isGitDir(areaFolderPath);
      let gitRootPath = isDirectRepo ? areaFolderPath : undefined;

      if (!isDirectRepo) {
        const ancestor = findGitRoot(areaFolderPath);
        if (ancestor) gitRootPath = PathUtils.normalize(ancestor);
      }

      const effectiveRoot = gitRootPath || areaFolderPath;
      const relativeFilePath = PathUtils.relative(effectiveRoot, absPath).replace(/\\/g, '/');

      return {
        targetType: 'file',
        absPath,
        areaFolderPath,
        areaFolderName,
        isGitRepo: Boolean(gitRootPath),
        gitRootPath,
        relativeFilePath,
      };
    }

    // Default fallback
    const fallbackPath = PathUtils.normalize(vaultRoot);
    const isRootGit = isGitDir(fallbackPath);
    return {
      targetType: 'folder',
      absPath: fallbackPath,
      areaFolderPath: fallbackPath,
      areaFolderName: 'Vault Root',
      isGitRepo: isRootGit,
      gitRootPath: isRootGit ? fallbackPath : undefined,
    };
  }
}
