import { App, Modal, Notice } from 'obsidian';
import { GitCliService } from '../services/GitCliService';
import { DiffAiFormatter } from '../services/DiffAiFormatter';
import { CommitEntry } from '../types';

export class FileHistoryModal extends Modal {
  private repoPath: string;
  private filePath: string;
  private commits: CommitEntry[] = [];
  private selectedCommit: CommitEntry | null = null;
  private currentDiff = '';

  constructor(app: App, repoPath: string, filePath: string) {
    super(app);
    this.repoPath = repoPath;
    this.filePath = filePath;
  }

  async onOpen(): Promise<void> {
    this.modalEl.addClass('git-manager-file-history-modal');
    this.contentEl.empty();
    this.contentEl.createEl('h2', { text: `📜 File History: ${this.filePath}` });

    try {
      this.commits = await GitCliService.getFileLog(this.repoPath, this.filePath);
      if (this.commits.length > 0) {
        this.selectedCommit = this.commits[0];
      }
    } catch {
      this.commits = [];
    }

    await this.render();
  }

  private async render(): Promise<void> {
    const { contentEl } = this;
    // Clear everything except h2
    while (contentEl.children.length > 1) {
      contentEl.removeChild(contentEl.lastChild!);
    }

    if (this.commits.length === 0) {
      contentEl.createDiv({ cls: 'git-manager-empty-text', text: 'No commit history found for this file.' });
      return;
    }

    const wrapper = contentEl.createDiv({ cls: 'git-manager-file-history-wrapper' });

    // ── Left: Commit List ──
    const leftCol = wrapper.createDiv({ cls: 'file-history-left' });
    leftCol.createEl('h4', { text: `Commits (${this.commits.length})`, cls: 'git-manager-col-header' });

    const list = leftCol.createDiv({ cls: 'file-history-list' });
    for (const c of this.commits) {
      const isSel = this.selectedCommit?.sha === c.sha;
      const item = list.createDiv({ cls: `file-history-item ${isSel ? 'is-selected' : ''}` });
      item.onclick = async () => {
        this.selectedCommit = c;
        await this.render();
      };

      const top = item.createDiv({ cls: 'item-top' });
      top.createSpan({ cls: 'sha', text: c.shortSha });
      top.createSpan({ cls: 'date', text: c.relativeDate || c.date.slice(0, 10) });

      item.createDiv({ cls: 'msg', text: c.message });
      item.createDiv({ cls: 'author', text: c.author });
    }

    // ── Right: Diff Viewer ──
    const rightCol = wrapper.createDiv({ cls: 'file-history-right' });
    rightCol.createEl('h4', {
      text: `Diff at ${this.selectedCommit?.shortSha || 'Commit'}`,
      cls: 'git-manager-col-header',
    });

    if (this.selectedCommit) {
      try {
        const res = await GitCliService.exec(this.repoPath, [
          'show',
          this.selectedCommit.sha,
          '--',
          this.filePath,
        ]);
        this.currentDiff = res.stdout;
      } catch (err) {
        this.currentDiff = `Error loading diff: ${err instanceof Error ? err.message : String(err)}`;
      }
    } else {
      this.currentDiff = '';
    }

    const diffContainer = rightCol.createDiv({ cls: 'git-manager-diff-content' });
    if (!this.currentDiff) {
      diffContainer.createDiv({ cls: 'git-manager-empty-text', text: 'No diff to display.' });
    } else {
      const pre = diffContainer.createEl('pre', { cls: 'git-manager-diff-pre' });
      const lines = this.currentDiff.split(/\r?\n/);
      for (const line of lines) {
        const lineDiv = pre.createDiv({ cls: 'git-manager-diff-line' });
        if (line.startsWith('+') && !line.startsWith('+++')) lineDiv.addClass('diff-added');
        else if (line.startsWith('-') && !line.startsWith('---')) lineDiv.addClass('diff-removed');
        else if (line.startsWith('@@')) lineDiv.addClass('diff-hunk');
        lineDiv.setText(line);
      }
    }

    const actions = rightCol.createDiv({ cls: 'git-manager-col-actions' });
    if (this.currentDiff) {
      const copyBtn = actions.createEl('button', {
        text: '📋 Copy File Diff for AI',
        cls: 'git-manager-btn-sm',
      });
      copyBtn.onclick = async () => {
        const text = DiffAiFormatter.formatAiDiff(
          'File History',
          this.repoPath,
          this.selectedCommit?.shortSha || 'commit',
          this.currentDiff,
          `File: ${this.filePath}`
        );
        await DiffAiFormatter.copyTextToClipboard(text, `📋 Copied diff for ${this.filePath}!`);
      };
    }
  }
}
