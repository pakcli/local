import { App, Menu, Notice } from 'obsidian';
import { GitCliService } from '../services/GitCliService';
import { SnapshotEngine } from '../services/SnapshotEngine';
import { RepoInfo, CommitEntry } from '../types';

export class HistoryView {
  private app: App;
  private containerEl: HTMLElement;
  private repo: RepoInfo;
  private onRefresh: () => void;

  private allCommits: CommitEntry[] = [];
  private searchQuery = '';

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
    const wrapper = this.containerEl.createDiv({ cls: 'git-manager-mode3-wrapper' });

    // Load commit history
    try {
      this.allCommits = await GitCliService.getLog(this.repo.absPath, 100);
    } catch {
      this.allCommits = [];
    }

    // Top Search Bar
    const searchBar = wrapper.createDiv({ cls: 'git-manager-mode3-search-bar' });
    const searchInput = searchBar.createEl('input', {
      type: 'text',
      cls: 'git-manager-search-input',
      placeholder: '🔍 Search commit message, author, or SHA...',
    });
    searchInput.value = this.searchQuery;
    searchInput.oninput = () => {
      this.searchQuery = searchInput.value;
      this.renderTable(tableBody);
    };

    const refreshBtn = searchBar.createEl('button', {
      text: '🔄 Refresh',
      cls: 'git-manager-btn-sm',
    });
    refreshBtn.onclick = () => this.onRefresh();

    // Data Grid Table
    const tableContainer = wrapper.createDiv({ cls: 'git-manager-history-table-container' });
    const table = tableContainer.createEl('table', { cls: 'git-manager-history-table' });

    const thead = table.createEl('thead');
    const headerRow = thead.createEl('tr');
    headerRow.createEl('th', { text: 'DATE / TIME', cls: 'col-date' });
    headerRow.createEl('th', { text: 'COMMIT', cls: 'col-sha' });
    headerRow.createEl('th', { text: 'AUTHOR', cls: 'col-author' });
    headerRow.createEl('th', { text: 'COMMIT MESSAGE (Selectable)', cls: 'col-msg' });
    headerRow.createEl('th', { text: 'ACTIONS', cls: 'col-actions' });

    const tableBody = table.createEl('tbody');
    this.renderTable(tableBody);
  }

  private renderTable(tbody: HTMLElement): void {
    tbody.empty();

    const filtered = this.allCommits.filter((c) => {
      if (!this.searchQuery.trim()) return true;
      const q = this.searchQuery.toLowerCase();
      return (
        c.message.toLowerCase().includes(q) ||
        c.author.toLowerCase().includes(q) ||
        c.sha.toLowerCase().includes(q) ||
        c.shortSha.toLowerCase().includes(q)
      );
    });

    if (filtered.length === 0) {
      const row = tbody.createEl('tr');
      const td = row.createEl('td', { attr: { colspan: '5' }, cls: 'git-manager-empty-text' });
      td.setText(this.allCommits.length === 0 ? 'No commits found in repository.' : 'No commits matching search.');
      return;
    }

    for (const commit of filtered) {
      const tr = tbody.createEl('tr');

      tr.createEl('td', { text: commit.date.slice(0, 16).replace('T', ' '), cls: 'col-date' });
      const shaTd = tr.createEl('td', { cls: 'col-sha' });
      shaTd.createEl('code', { text: commit.shortSha });

      tr.createEl('td', { text: commit.author, cls: 'col-author' });
      tr.createEl('td', { text: commit.message, cls: 'col-msg selectable-text' });

      const actionsTd = tr.createEl('td', { cls: 'col-actions' });
      const menuBtn = actionsTd.createEl('button', {
        text: '⚙️ Actions ▼',
        cls: 'git-manager-btn-xs',
      });
      menuBtn.onclick = (e) => {
        this.openBranchActionsMenu(e, commit);
      };
    }
  }

  private openBranchActionsMenu(evt: MouseEvent, commit: CommitEntry): void {
    const menu = new Menu();

    menu.addItem((item) => {
      item
        .setTitle(`🔀 Checkout (${commit.shortSha})`)
        .setIcon('git-pull-request')
        .onClick(async () => {
          try {
            await GitCliService.checkout(this.repo.absPath, commit.sha);
            new Notice(`🔀 Checked out ${commit.shortSha}`);
            this.onRefresh();
          } catch (err) {
            new Notice(`❌ Checkout failed: ${err instanceof Error ? err.message : String(err)}`);
          }
        });
    });

    menu.addItem((item) => {
      item
        .setTitle('🌿 Add New Branch From Here...')
        .setIcon('git-branch')
        .onClick(async () => {
          const branchName = prompt(`Enter new branch name from commit ${commit.shortSha}:`);
          if (!branchName || !branchName.trim()) return;
          try {
            await GitCliService.createBranch(this.repo.absPath, branchName.trim(), commit.sha);
            new Notice(`🌿 Created branch "${branchName.trim()}"`);
            this.onRefresh();
          } catch (err) {
            new Notice(`❌ Branch creation failed: ${err instanceof Error ? err.message : String(err)}`);
          }
        });
    });

    menu.addItem((item) => {
      item
        .setTitle(`🧬 Merge into ${this.repo.currentBranch}`)
        .setIcon('git-merge')
        .onClick(async () => {
          try {
            await SnapshotEngine.createSnapshot(this.repo.absPath, `safety checkpoint before merge ${commit.shortSha}`);
            await GitCliService.merge(this.repo.absPath, commit.sha);
            new Notice(`🧬 Merged ${commit.shortSha} into ${this.repo.currentBranch}`);
            this.onRefresh();
          } catch (err) {
            new Notice(`❌ Merge failed: ${err instanceof Error ? err.message : String(err)}`);
          }
        });
    });

    menu.addSeparator();

    menu.addItem((item) => {
      item
        .setTitle(`⚠️ Overwrite Current State with this Commit (Hard Reset)`)
        .setIcon('alert-triangle')
        .onClick(async () => {
          if (!confirm(`Are you sure you want to OVERWRITE your current state with commit ${commit.shortSha}?\n\nAll files in your active workspace will be reset to match this commit. A safety snapshot will be auto-saved first.`)) {
            return;
          }
          try {
            await SnapshotEngine.createSnapshot(this.repo.absPath, `safety checkpoint before reset to ${commit.shortSha}`);
            await GitCliService.resetHard(this.repo.absPath, commit.sha);
            new Notice(`⚠️ Overwrote current state with commit ${commit.shortSha}`);
            this.onRefresh();
          } catch (err) {
            new Notice(`❌ Reset failed: ${err instanceof Error ? err.message : String(err)}`);
          }
        });
    });

    menu.showAtMouseEvent(evt);
  }
}
