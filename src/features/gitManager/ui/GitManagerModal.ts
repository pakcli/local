import { App, Modal, Notice } from 'obsidian';
import type PakCLILocalPlugin from '../../../main';
import { VaultRepoScanner } from '../services/VaultRepoScanner';
import { DiffAiFormatter } from '../services/DiffAiFormatter';
import { GitCliService } from '../services/GitCliService';
import { SnapshotEngine } from '../services/SnapshotEngine';
import { RepoInfo, ViewMode, RepoStatus } from '../types';
import { WorkingChangesView } from './WorkingChangesView';
import { StashSnapshotView } from './StashSnapshotView';
import { HistoryView } from './HistoryView';
import { SnapshotModal } from './SnapshotModal';
import { RepoAssignModal } from './RepoAssignModal';

export class GitManagerModal extends Modal {
  private plugin: PakCLILocalPlugin;
  private repos: RepoInfo[] = [];
  private selectedRepo: RepoInfo | null = null;
  private activeMode: ViewMode = ViewMode.Changes;
  private isLoading = true;

  private keydownHandler?: (e: KeyboardEvent) => void;

  constructor(app: App, plugin: PakCLILocalPlugin, initialRepoPath?: string) {
    super(app);
    this.plugin = plugin;
    if (this.plugin.settings.gitManager?.defaultViewMode) {
      this.activeMode = this.plugin.settings.gitManager.defaultViewMode;
    }
    this.modalEl.addClass('git-manager-main-modal');
  }

  async onOpen(): Promise<void> {
    this.setupKeyboardShortcuts();
    await this.refresh(true);
  }

  onClose(): void {
    if (this.keydownHandler) {
      window.removeEventListener('keydown', this.keydownHandler);
    }
    this.contentEl.empty();
  }

  private setupKeyboardShortcuts(): void {
    this.keydownHandler = (e: KeyboardEvent) => {
      // Don't intercept when user is typing in an input or textarea
      const target = e.target as HTMLElement;
      const isInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');

      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'C' || e.key === 'c')) {
        e.preventDefault();
        if (this.selectedRepo) {
          void DiffAiFormatter.exportWorkingDiffToClipboard(
            this.selectedRepo.name,
            this.selectedRepo.absPath,
            this.selectedRepo.currentBranch
          );
        }
        return;
      }

      if (e.altKey && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        this.openSnapshotModal();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && (e.key === 'r' || e.key === 'R')) {
        e.preventDefault();
        void this.refresh(false);
        return;
      }

      if (!isInput) {
        if (e.key === '1') {
          e.preventDefault();
          this.switchMode(ViewMode.Changes);
        } else if (e.key === '2') {
          e.preventDefault();
          this.switchMode(ViewMode.Stash);
        } else if (e.key === '3') {
          e.preventDefault();
          this.switchMode(ViewMode.History);
        }
      }
    };

    window.addEventListener('keydown', this.keydownHandler);
  }

  async refresh(fullScan = false): Promise<void> {
    this.isLoading = true;
    this.renderLoading();

    try {
      const watched = this.plugin.settings.gitManager?.watchedPaths || [];
      this.repos = await VaultRepoScanner.scanAllRepos(this.app, watched);

      if (this.selectedRepo) {
        const found = this.repos.find((r) => r.absPath === this.selectedRepo?.absPath);
        this.selectedRepo = found || this.repos[0] || null;
      } else {
        this.selectedRepo = this.repos[0] || null;
      }
    } catch (err) {
      console.error('[GitManagerModal] Refresh failed:', err);
      new Notice(`Failed to scan Git repositories: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this.isLoading = false;
      this.render();
    }
  }

  private renderLoading(): void {
    this.contentEl.empty();
    const wrap = this.contentEl.createDiv({ cls: 'git-manager-loading-state' });
    wrap.createDiv({ cls: 'pakcli-deps-loading', text: '🔍 Scanning repositories in vault & links…' });
  }

  private render(): void {
    this.contentEl.empty();

    if (this.repos.length === 0) {
      const emptyWrap = this.contentEl.createDiv({ cls: 'git-manager-empty-screen' });
      emptyWrap.createEl('h2', { text: '📸 PakCLI Git Sentinel' });
      emptyWrap.createEl('p', {
        text: 'No Git repositories detected in this vault or watched folders.',
      });
      emptyWrap.createEl('p', {
        text: 'You can configure watched repository folders in PakCLI Settings → Git Sentinel.',
        cls: 'git-manager-modal-subtitle',
      });
      const refreshBtn = emptyWrap.createEl('button', { text: '🔄 Re-scan', cls: 'mod-cta' });
      refreshBtn.onclick = () => void this.refresh(true);
      return;
    }

    const currentRepo = this.selectedRepo || this.repos[0];

    // ── Header Bar ──
    const header = this.contentEl.createDiv({ cls: 'git-manager-modal-header' });

    // Title & Repo Selector
    const titleSection = header.createDiv({ cls: 'git-manager-header-title-section' });
    titleSection.createEl('h3', { text: '📸 Git Sentinel', cls: 'git-manager-modal-title' });

    const select = titleSection.createEl('select', { cls: 'git-manager-repo-select' });
    for (const r of this.repos) {
      const opt = select.createEl('option', {
        value: r.absPath,
        text: `${r.name} (${r.currentBranch})${r.isSymlink ? ' 🔗' : ''}`,
      });
      if (r.absPath === currentRepo.absPath) {
        opt.selected = true;
      }
    }
    select.onchange = () => {
      const next = this.repos.find((r) => r.absPath === select.value);
      if (next) {
        this.selectedRepo = next;
        this.render();
      }
    };

    // Status Badge
    const badge = titleSection.createSpan({
      cls: `git-manager-repo-badge status-${currentRepo.status}`,
    });
    badge.setText(this.formatStatusBadge(currentRepo));

    // Mode Badge (Local Only vs GitHub)
    const isGitHub = currentRepo.mode === 'github' || Boolean(currentRepo.remoteUrl);
    const modeBadge = titleSection.createSpan({
      cls: `git-manager-mode-badge ${isGitHub ? 'badge-github' : 'badge-local'}`,
    });
    const aheadText = currentRepo.aheadBehind.ahead > 0 ? ` ⬆️${currentRepo.aheadBehind.ahead}` : '';
    const behindText = currentRepo.aheadBehind.behind > 0 ? ` ⬇️${currentRepo.aheadBehind.behind}` : '';
    modeBadge.setText(isGitHub ? `🌐 GitHub${aheadText}${behindText}` : '🔒 Local Only');

    // Header Action Buttons
    const headerActions = header.createDiv({ cls: 'git-manager-header-actions' });

    // GitHub Push/Pull/Sync Buttons if mode is GitHub
    if (isGitHub) {
      const pushBtn = headerActions.createEl('button', {
        text: '⬆️ Push',
        cls: 'git-manager-btn-sm',
      });
      pushBtn.onclick = async () => {
        try {
          await SnapshotEngine.createSnapshot(currentRepo.absPath, 'safety checkpoint before push');
          new Notice('⏳ Pushing to GitHub…');
          await GitCliService.push(currentRepo.absPath);
          new Notice('✅ Successfully pushed to GitHub!');
          await this.refresh();
        } catch (err) {
          new Notice(`❌ Push failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      };

      const pullBtn = headerActions.createEl('button', {
        text: '⬇️ Pull',
        cls: 'git-manager-btn-sm',
      });
      pullBtn.onclick = async () => {
        try {
          await SnapshotEngine.createSnapshot(currentRepo.absPath, 'safety checkpoint before pull');
          new Notice('⏳ Pulling from GitHub…');
          await GitCliService.pull(currentRepo.absPath);
          new Notice('✅ Successfully pulled from GitHub!');
          await this.refresh();
        } catch (err) {
          new Notice(`❌ Pull failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      };
    }

    const modeBtn = headerActions.createEl('button', {
      text: '⚙️ Mode',
      cls: 'git-manager-btn-sm',
    });
    modeBtn.onclick = () => {
      new RepoAssignModal(this.app, this.plugin, {
        targetType: 'folder',
        absPath: currentRepo.absPath,
        areaFolderPath: currentRepo.absPath,
        areaFolderName: currentRepo.name,
        isGitRepo: true,
      }, () => void this.refresh()).open();
    };

    const refreshBtn = headerActions.createEl('button', {
      text: '🔄 Refresh (Ctrl+R)',
      cls: 'git-manager-btn-sm',
    });
    refreshBtn.onclick = () => void this.refresh();

    const snapshotBtn = headerActions.createEl('button', {
      text: '📸 Snapshot (Alt+S)',
      cls: 'git-manager-btn-sm',
    });
    snapshotBtn.onclick = () => this.openSnapshotModal();

    const diffBtn = headerActions.createEl('button', {
      text: '📋 Copy Diff (Ctrl+Shift+C)',
      cls: 'git-manager-btn-sm mod-cta',
    });
    diffBtn.onclick = () => {
      void DiffAiFormatter.exportWorkingDiffToClipboard(
        currentRepo.name,
        currentRepo.absPath,
        currentRepo.currentBranch
      );
    };

    // ── Mode Tab Navigation ──
    const navBar = this.contentEl.createDiv({ cls: 'git-manager-tab-bar' });

    const tab1 = navBar.createDiv({
      cls: `git-manager-tab ${this.activeMode === ViewMode.Changes ? 'is-active' : ''}`,
      text: '📂 Working Changes (1)',
    });
    tab1.onclick = () => this.switchMode(ViewMode.Changes);

    const tab2 = navBar.createDiv({
      cls: `git-manager-tab ${this.activeMode === ViewMode.Stash ? 'is-active' : ''}`,
      text: '📦 Stash & Snapshot (2)',
    });
    tab2.onclick = () => this.switchMode(ViewMode.Stash);

    const tab3 = navBar.createDiv({
      cls: `git-manager-tab ${this.activeMode === ViewMode.History ? 'is-active' : ''}`,
      text: '📜 History & Branching (3)',
    });
    tab3.onclick = () => this.switchMode(ViewMode.History);

    // ── View Body Container ──
    const bodyContainer = this.contentEl.createDiv({ cls: 'git-manager-body-container' });

    if (this.activeMode === ViewMode.Changes) {
      const mode1 = new WorkingChangesView(bodyContainer, currentRepo, () => void this.refresh());
      void mode1.render();
    } else if (this.activeMode === ViewMode.Stash) {
      const mode2 = new StashSnapshotView(this.app, bodyContainer, currentRepo, () => void this.refresh());
      void mode2.render();
    } else if (this.activeMode === ViewMode.History) {
      const mode3 = new HistoryView(this.app, bodyContainer, currentRepo, () => void this.refresh());
      void mode3.render();
    }
  }

  private switchMode(mode: ViewMode): void {
    if (this.activeMode !== mode) {
      this.activeMode = mode;
      this.render();
    }
  }

  private openSnapshotModal(): void {
    if (!this.selectedRepo) return;
    const incUntracked = this.plugin.settings.gitManager?.includeUntracked ?? false;
    const retention = this.plugin.settings.gitManager?.retentionCount ?? 20;

    new SnapshotModal(
      this.app,
      this.selectedRepo,
      incUntracked,
      retention,
      () => void this.refresh()
    ).open();
  }

  private formatStatusBadge(repo: RepoInfo): string {
    const dirtyTotal = repo.unstagedFiles.length + repo.untrackedFiles.length;
    switch (repo.status) {
      case RepoStatus.Clean:
        return '🟢 Clean';
      case RepoStatus.Dirty:
        return `🟡 ${dirtyTotal} Dirty`;
      case RepoStatus.Staged:
        return `🔵 ${repo.stagedFiles.length} Staged`;
      case RepoStatus.Conflict:
        return '🔴 Conflict';
      default:
        return '🟢 Ready';
    }
  }
}
