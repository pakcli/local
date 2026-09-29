import { App, Notice } from 'obsidian';
import { SnapshotEngine } from '../services/SnapshotEngine';
import { DiffAiFormatter } from '../services/DiffAiFormatter';
import { RepoInfo, SnapshotEntry } from '../types';
import { SnapshotModal } from './SnapshotModal';

export class StashSnapshotView {
  private app: App;
  private containerEl: HTMLElement;
  private repo: RepoInfo;
  private onRefresh: () => void;

  private snapshots: SnapshotEntry[] = [];
  private selectedSnap: SnapshotEntry | null = null;
  private snapFiles: string[] = [];
  private selectedFile: string | null = null;
  private currentDiff = '';

  constructor(
    app: App,
    containerEl: HTMLElement,
    repo: RepoInfo,
    onRefresh: () => void
  ) {
    this.app = app;
    this.containerEl = containerEl;
    this.repo = repo;
    this.onRefresh = onRefresh;
  }

  async render(): Promise<void> {
    this.containerEl.empty();
    const wrapper = this.containerEl.createDiv({ cls: 'git-manager-mode2-wrapper' });

    // Load snapshots
    try {
      this.snapshots = await SnapshotEngine.listSnapshots(this.repo.absPath);
      if (this.snapshots.length > 0 && !this.selectedSnap) {
        this.selectedSnap = this.snapshots[0];
      }
    } catch {
      this.snapshots = [];
    }

    // ── Column 1: History Stash / Snapshot ──
    const col1 = wrapper.createDiv({ cls: 'git-manager-mode2-col col-history' });
    col1.createEl('h4', { text: `1. Snapshots (${this.snapshots.length})`, cls: 'git-manager-col-header' });

    const snapList = col1.createDiv({ cls: 'git-manager-snap-list' });
    if (this.snapshots.length === 0) {
      snapList.createDiv({ cls: 'git-manager-empty-text', text: 'No local snapshots created yet.' });
    } else {
      for (const s of this.snapshots) {
        const isSelected = this.selectedSnap?.ref === s.ref;
        const item = snapList.createDiv({
          cls: `git-manager-snap-item ${isSelected ? 'is-selected' : ''}`,
        });
        item.onclick = async () => {
          this.selectedSnap = s;
          this.selectedFile = null;
          await this.render();
        };

        const titleRow = item.createDiv({ cls: 'git-manager-snap-title-row' });
        titleRow.createSpan({ text: isSelected ? '🔘 ' : '○ ' });
        titleRow.createSpan({ cls: 'git-manager-snap-label', text: s.label });

        const metaRow = item.createDiv({ cls: 'git-manager-snap-meta-row' });
        metaRow.createSpan({ text: s.timestamp.slice(0, 16).replace('T', ' ') });
      }
    }

    const col1Actions = col1.createDiv({ cls: 'git-manager-col-actions' });
    const newSnapBtn = col1Actions.createEl('button', {
      text: '📸 New Snapshot',
      cls: 'git-manager-btn-sm mod-cta',
    });
    newSnapBtn.onclick = () => {
      new SnapshotModal(this.app, this.repo, true, 20, () => this.onRefresh()).open();
    };

    if (this.selectedSnap) {
      const rollbackBtn = col1Actions.createEl('button', {
        text: '⏪ Rollback All',
        cls: 'git-manager-btn-sm mod-warning',
      });
      rollbackBtn.onclick = async () => {
        if (!this.selectedSnap) return;
        if (!confirm(`Are you sure you want to rollback ALL files to snapshot "${this.selectedSnap.label}"? A safety checkpoint will be saved first.`)) {
          return;
        }
        try {
          await SnapshotEngine.restoreSnapshot(this.repo.absPath, this.selectedSnap.sha);
          new Notice(`✅ Rolled back to snapshot: ${this.selectedSnap.label}`);
          this.onRefresh();
        } catch (err) {
          new Notice(`❌ Rollback failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      };

      const deleteBtn = col1Actions.createEl('button', {
        text: '🗑️ Delete',
        cls: 'git-manager-btn-sm',
      });
      deleteBtn.onclick = async () => {
        if (!this.selectedSnap) return;
        try {
          await SnapshotEngine.deleteSnapshot(this.repo.absPath, this.selectedSnap.ref);
          new Notice(`🗑️ Deleted snapshot ${this.selectedSnap.label}`);
          this.selectedSnap = null;
          this.onRefresh();
        } catch (err) {
          new Notice(`❌ Delete failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      };
    }

    // ── Column 2: Files in Snapshot ──
    const col2 = wrapper.createDiv({ cls: 'git-manager-mode2-col col-files' });
    col2.createEl('h4', { text: '2. Changes in Snapshot', cls: 'git-manager-col-header' });

    if (this.selectedSnap) {
      try {
        this.snapFiles = await SnapshotEngine.getSnapshotFiles(this.repo.absPath, this.selectedSnap.sha);
        if (this.snapFiles.length > 0 && !this.selectedFile) {
          this.selectedFile = this.snapFiles[0];
        }
      } catch {
        this.snapFiles = [];
      }
    } else {
      this.snapFiles = [];
    }

    const fileList = col2.createDiv({ cls: 'git-manager-snap-file-list' });
    if (!this.selectedSnap) {
      fileList.createDiv({ cls: 'git-manager-empty-text', text: 'Select a snapshot on the left.' });
    } else if (this.snapFiles.length === 0) {
      fileList.createDiv({ cls: 'git-manager-empty-text', text: 'No changed files in this snapshot.' });
    } else {
      for (const file of this.snapFiles) {
        const isFileSel = this.selectedFile === file;
        const item = fileList.createDiv({
          cls: `git-manager-snap-file-item ${isFileSel ? 'is-selected' : ''}`,
        });
        item.onclick = async () => {
          this.selectedFile = file;
          await this.render();
        };
        item.createSpan({ text: '📄 ' + file });
      }
    }

    const col2Actions = col2.createDiv({ cls: 'git-manager-col-actions' });
    if (this.selectedSnap && this.selectedFile) {
      const restoreFileBtn = col2Actions.createEl('button', {
        text: '↩️ Restore File Only',
        cls: 'git-manager-btn-sm',
      });
      restoreFileBtn.onclick = async () => {
        if (!this.selectedSnap || !this.selectedFile) return;
        try {
          await SnapshotEngine.restoreSnapshot(this.repo.absPath, this.selectedSnap.sha, [this.selectedFile]);
          new Notice(`✅ Restored ${this.selectedFile} from snapshot!`);
          this.onRefresh();
        } catch (err) {
          new Notice(`❌ Failed to restore file: ${err instanceof Error ? err.message : String(err)}`);
        }
      };

      const copyFileDiffBtn = col2Actions.createEl('button', {
        text: '📋 Copy File Diff',
        cls: 'git-manager-btn-sm',
      });
      copyFileDiffBtn.onclick = async () => {
        if (!this.selectedSnap || !this.selectedFile) return;
        const diff = await SnapshotEngine.getSnapshotDiff(this.repo.absPath, this.selectedSnap.sha, this.selectedFile);
        const text = DiffAiFormatter.formatAiDiff(
          this.repo.name,
          this.repo.absPath,
          this.selectedSnap.label,
          diff,
          `File: ${this.selectedFile}`
        );
        await DiffAiFormatter.copyTextToClipboard(text, `📋 Copied diff for ${this.selectedFile}!`);
      };
    }

    // ── Column 3: Diff Viewer ──
    const col3 = wrapper.createDiv({ cls: 'git-manager-mode2-col col-diff' });
    col3.createEl('h4', {
      text: `3. Diff Viewer ${this.selectedFile ? `(${this.selectedFile})` : ''}`,
      cls: 'git-manager-col-header',
    });

    if (this.selectedSnap) {
      try {
        this.currentDiff = await SnapshotEngine.getSnapshotDiff(
          this.repo.absPath,
          this.selectedSnap.sha,
          this.selectedFile || undefined
        );
      } catch (err) {
        this.currentDiff = `Error loading diff: ${err instanceof Error ? err.message : String(err)}`;
      }
    } else {
      this.currentDiff = '';
    }

    const diffContainer = col3.createDiv({ cls: 'git-manager-diff-content' });
    if (!this.currentDiff) {
      diffContainer.createDiv({ cls: 'git-manager-empty-text', text: 'No diff to display.' });
    } else {
      this.renderDiffSyntax(diffContainer, this.currentDiff);
    }

    const col3Actions = col3.createDiv({ cls: 'git-manager-col-actions' });
    if (this.currentDiff) {
      const copyRawBtn = col3Actions.createEl('button', {
        text: '📋 Copy Raw Patch',
        cls: 'git-manager-btn-sm',
      });
      copyRawBtn.onclick = async () => {
        await DiffAiFormatter.copyTextToClipboard(this.currentDiff, '📋 Copied raw diff patch!');
      };
    }
  }

  private renderDiffSyntax(container: HTMLElement, rawDiff: string): void {
    const pre = container.createEl('pre', { cls: 'git-manager-diff-pre' });
    const lines = rawDiff.split(/\r?\n/);
    for (const line of lines) {
      const lineDiv = pre.createDiv({ cls: 'git-manager-diff-line' });
      if (line.startsWith('+') && !line.startsWith('+++')) {
        lineDiv.addClass('diff-added');
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        lineDiv.addClass('diff-removed');
      } else if (line.startsWith('@@')) {
        lineDiv.addClass('diff-hunk');
      }
      lineDiv.setText(line);
    }
  }
}
