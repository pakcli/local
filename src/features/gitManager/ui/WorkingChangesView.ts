import { Notice } from 'obsidian';
import { GitCliService } from '../services/GitCliService';
import { SnapshotEngine } from '../services/SnapshotEngine';
import { DiffAiFormatter } from '../services/DiffAiFormatter';
import { RepoInfo, CommitEntry } from '../types';

export class WorkingChangesView {
  private containerEl: HTMLElement;
  private repo: RepoInfo;
  private onRefresh: () => void;
  private recentCommits: CommitEntry[] = [];
  private commitInputVal = '';

  constructor(
    containerEl: HTMLElement,
    repo: RepoInfo,
    onRefresh: () => void
  ) {
    this.containerEl = containerEl;
    this.repo = repo;
    this.onRefresh = onRefresh;
  }

  async render(): Promise<void> {
    this.containerEl.empty();
    const wrapper = this.containerEl.createDiv({ cls: 'git-manager-mode1-wrapper' });

    // Fetch recent commits for left column
    try {
      this.recentCommits = await GitCliService.getLog(this.repo.absPath, 15);
    } catch {
      this.recentCommits = [];
    }

    // ── Left Column: Recent Commits ──
    const leftCol = wrapper.createDiv({ cls: 'git-manager-mode1-left' });
    leftCol.createEl('h4', { text: '📜 Recent Commits', cls: 'git-manager-col-header' });
    const commitList = leftCol.createDiv({ cls: 'git-manager-commit-mini-list' });

    if (this.recentCommits.length === 0) {
      commitList.createDiv({ cls: 'git-manager-empty-text', text: 'No recent commits found.' });
    } else {
      for (const c of this.recentCommits) {
        const item = commitList.createDiv({ cls: 'git-manager-commit-mini-item' });
        const topRow = item.createDiv({ cls: 'git-manager-commit-mini-top' });
        topRow.createSpan({ cls: 'git-manager-commit-sha', text: c.shortSha });
        topRow.createSpan({ cls: 'git-manager-commit-date', text: c.relativeDate || c.date.slice(0, 10) });
        item.createDiv({ cls: 'git-manager-commit-msg', text: c.message });
      }
    }

    // ── Right Column: Working Tree Changes (Split Top-Down) ──
    const rightCol = wrapper.createDiv({ cls: 'git-manager-mode1-right' });

    // 1. Staged Changes
    const stagedSection = rightCol.createDiv({ cls: 'git-manager-section staged-section' });
    const stagedHeader = stagedSection.createDiv({ cls: 'git-manager-section-header' });
    stagedHeader.createSpan({
      cls: 'git-manager-section-title',
      text: `🔼 STAGED CHANGES (${this.repo.stagedFiles.length})`,
    });

    if (this.repo.stagedFiles.length > 0) {
      const unstageAllBtn = stagedHeader.createEl('button', {
        text: 'Unstage All',
        cls: 'git-manager-btn-sm',
      });
      unstageAllBtn.onclick = async () => {
        await GitCliService.unstageAll(this.repo.absPath);
        this.onRefresh();
      };
    }

    const stagedList = stagedSection.createDiv({ cls: 'git-manager-file-list' });
    if (this.repo.stagedFiles.length === 0) {
      stagedList.createDiv({ cls: 'git-manager-empty-hint', text: 'No files staged for commit.' });
    } else {
      for (const f of this.repo.stagedFiles) {
        const fileRow = stagedList.createDiv({ cls: 'git-manager-file-row' });
        fileRow.createSpan({ cls: `git-manager-status-badge status-${f.status}`, text: f.status });
        fileRow.createSpan({ cls: 'git-manager-file-path', text: f.path });

        const actions = fileRow.createDiv({ cls: 'git-manager-file-actions' });
        const unstageBtn = actions.createEl('button', {
          text: '− Unstage',
          cls: 'git-manager-btn-xs',
        });
        unstageBtn.onclick = async () => {
          await GitCliService.unstageFile(this.repo.absPath, f.path);
          this.onRefresh();
        };
      }
    }

    // 2. Unstaged Changes & Untracked
    const unstagedTotal = this.repo.unstagedFiles.length + this.repo.untrackedFiles.length;
    const unstagedSection = rightCol.createDiv({ cls: 'git-manager-section unstaged-section' });
    const unstagedHeader = unstagedSection.createDiv({ cls: 'git-manager-section-header' });
    unstagedHeader.createSpan({
      cls: 'git-manager-section-title',
      text: `🔽 UNSTAGED CHANGES (${unstagedTotal})`,
    });

    if (unstagedTotal > 0) {
      const stageAllBtn = unstagedHeader.createEl('button', {
        text: 'Stage All (+)',
        cls: 'git-manager-btn-sm mod-cta',
      });
      stageAllBtn.onclick = async () => {
        await GitCliService.stageAll(this.repo.absPath);
        this.onRefresh();
      };
    }

    const unstagedList = unstagedSection.createDiv({ cls: 'git-manager-file-list' });
    const allUnstaged = [...this.repo.unstagedFiles, ...this.repo.untrackedFiles];

    if (allUnstaged.length === 0) {
      unstagedList.createDiv({ cls: 'git-manager-empty-hint', text: 'Clean working tree.' });
    } else {
      for (const f of allUnstaged) {
        const fileRow = unstagedList.createDiv({ cls: 'git-manager-file-row' });
        fileRow.createSpan({ cls: `git-manager-status-badge status-${f.status}`, text: f.status });
        fileRow.createSpan({ cls: 'git-manager-file-path', text: f.path });

        const actions = fileRow.createDiv({ cls: 'git-manager-file-actions' });
        const stageBtn = actions.createEl('button', {
          text: '+ Stage',
          cls: 'git-manager-btn-xs',
        });
        stageBtn.onclick = async () => {
          await GitCliService.stageFile(this.repo.absPath, f.path);
          this.onRefresh();
        };

        const discardBtn = actions.createEl('button', {
          text: '✕ Discard',
          cls: 'git-manager-btn-xs mod-warning',
        });
        discardBtn.onclick = async () => {
          await GitCliService.discardFile(this.repo.absPath, f.path, f.status === '?');
          this.onRefresh();
        };
      }
    }

    // 3. Commit / Snapshot Action Box
    const commitSection = rightCol.createDiv({ cls: 'git-manager-commit-box' });
    commitSection.createEl('label', {
      text: '💬 Commit / Snapshot Message:',
      cls: 'git-manager-commit-label',
    });

    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const defaultPrefix = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}_`;

    const input = commitSection.createEl('input', {
      type: 'text',
      cls: 'git-manager-commit-input',
      placeholder: defaultPrefix + 'your message',
    });
    input.value = this.commitInputVal || defaultPrefix;
    input.oninput = () => {
      this.commitInputVal = input.value;
    };

    const actionRow = commitSection.createDiv({ cls: 'git-manager-action-row' });

    // Commit button
    const commitBtn = actionRow.createEl('button', {
      text: '💾 Commit (Ctrl+Enter)',
      cls: 'git-manager-btn mod-cta',
    });
    commitBtn.disabled = this.repo.stagedFiles.length === 0;
    commitBtn.onclick = async () => {
      await this.handleCommit(input.value);
    };

    // Snapshot button
    const snapshotBtn = actionRow.createEl('button', {
      text: '📸 Snapshot (Alt+S)',
      cls: 'git-manager-btn',
    });
    snapshotBtn.onclick = async () => {
      await this.handleSnapshot(input.value);
    };

    // Copy Diff for AI
    const copyDiffBtn = actionRow.createEl('button', {
      text: '📋 Copy Diff for AI (Ctrl+Shift+C)',
      cls: 'git-manager-btn',
    });
    copyDiffBtn.onclick = async () => {
      await DiffAiFormatter.exportWorkingDiffToClipboard(
        this.repo.name,
        this.repo.absPath,
        this.repo.currentBranch
      );
    };

    // Enter shortcut on input
    input.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (this.repo.stagedFiles.length > 0) {
          void this.handleCommit(input.value);
        }
      }
    });
  }

  private async handleCommit(msg: string): Promise<void> {
    const finalMsg = msg.trim();
    if (!finalMsg) {
      new Notice('⚠️ Please enter a commit message.');
      return;
    }
    try {
      await GitCliService.commit(this.repo.absPath, finalMsg);
      new Notice(`✅ Committed: ${finalMsg}`);
      this.commitInputVal = '';
      this.onRefresh();
    } catch (err) {
      new Notice(`❌ Commit error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async handleSnapshot(msg: string): Promise<void> {
    try {
      const snap = await SnapshotEngine.createSnapshot(this.repo.absPath, msg, true);
      new Notice(`✅ Created Snapshot: ${snap.label}`);
      this.onRefresh();
    } catch (err) {
      new Notice(`❌ Snapshot error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
