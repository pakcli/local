import { App, Notice } from 'obsidian';
import type PakCLILocalPlugin from '../../main';
import {
  GIT_MANAGER_CMD_OPEN,
  GIT_MANAGER_CMD_SNAPSHOT,
  GIT_MANAGER_CMD_DIFF,
  GIT_MANAGER_CMD_DEPS,
  RIBBON_ICON,
  RIBBON_TITLE,
} from './constants';
import { GitManagerModal } from './ui/GitManagerModal';
import { SnapshotEngine } from './services/SnapshotEngine';
import { DiffAiFormatter } from './services/DiffAiFormatter';
import { VaultRepoScanner } from './services/VaultRepoScanner';
import { SnapshotModal } from './ui/SnapshotModal';
import { registerGitContextMenu } from './contextMenu';

export class GitManager {
  private app: App;
  private plugin: PakCLILocalPlugin;

  constructor(app: App, plugin: PakCLILocalPlugin) {
    this.app = app;
    this.plugin = plugin;
  }

  init(): void {
    // 1. Register Ribbon Icon
    this.plugin.addRibbonIcon(RIBBON_ICON, RIBBON_TITLE, () => {
      this.openManagerModal();
    });

    // 2. Register Plugin Commands (stable IDs)
    this.plugin.addCommand({
      id: GIT_MANAGER_CMD_OPEN,
      name: 'Git Sentinel: Open Manager',
      callback: () => this.openManagerModal(),
    });

    this.plugin.addCommand({
      id: GIT_MANAGER_CMD_SNAPSHOT,
      name: 'Git Sentinel: Snapshot Current Repo',
      callback: async () => {
        const repos = await VaultRepoScanner.scanAllRepos(
          this.app,
          this.plugin.settings.gitManager?.watchedPaths || []
        );
        if (repos.length === 0) {
          new Notice('⚠️ No Git repository found to snapshot.');
          return;
        }
        new SnapshotModal(
          this.app,
          repos[0],
          this.plugin.settings.gitManager?.includeUntracked ?? false,
          this.plugin.settings.gitManager?.retentionCount ?? 20
        ).open();
      },
    });

    this.plugin.addCommand({
      id: GIT_MANAGER_CMD_DIFF,
      name: 'Git Sentinel: Copy Diff to Clipboard',
      callback: async () => {
        const repos = await VaultRepoScanner.scanAllRepos(
          this.app,
          this.plugin.settings.gitManager?.watchedPaths || []
        );
        if (repos.length === 0) {
          new Notice('⚠️ No Git repository found.');
          return;
        }
        await DiffAiFormatter.exportWorkingDiffToClipboard(
          repos[0].name,
          repos[0].absPath,
          repos[0].currentBranch
        );
      },
    });

    this.plugin.addCommand({
      id: GIT_MANAGER_CMD_DEPS,
      name: 'Git Sentinel: Check Dependencies',
      callback: () => {
        const settingTab = (this.app as any).setting;
        if (settingTab) {
          settingTab.open();
          settingTab.openTabById?.('pakcli-local');
        }
      },
    });

    // 3. Register Right-Click File/Folder Context Menu
    registerGitContextMenu(this.plugin);
  }

  openManagerModal(): void {
    new GitManagerModal(this.app, this.plugin).open();
  }
}
