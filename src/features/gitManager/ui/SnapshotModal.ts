import { App, Modal, Notice, Setting } from 'obsidian';
import { SnapshotEngine } from '../services/SnapshotEngine';
import { RepoInfo } from '../types';

export class SnapshotModal extends Modal {
  private repo: RepoInfo;
  private includeUntracked: boolean;
  private retentionCount: number;
  private onCreated?: () => void;
  private customMsg = '';

  constructor(
    app: App,
    repo: RepoInfo,
    includeUntracked: boolean,
    retentionCount: number,
    onCreated?: () => void
  ) {
    super(app);
    this.repo = repo;
    this.includeUntracked = includeUntracked;
    this.retentionCount = retentionCount;
    this.onCreated = onCreated;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('git-manager-snapshot-modal');

    contentEl.createEl('h2', { text: `📸 Create Local Git Snapshot` });
    contentEl.createEl('p', {
      text: `Repository: ${this.repo.name} (${this.repo.currentBranch})`,
      cls: 'git-manager-modal-subtitle',
    });

    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const defaultPrefix = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}_`;

    new Setting(contentEl)
      .setName('Snapshot Note / Label')
      .setDesc('Format: yyyy-mm-dd_hh-mm_your message')
      .addText((text) => {
        text.setPlaceholder(defaultPrefix + 'feature checkpoint');
        text.inputEl.value = defaultPrefix;
        text.inputEl.addClass('git-manager-wide-input');
        text.onChange((val) => {
          this.customMsg = val.startsWith(defaultPrefix)
            ? val.slice(defaultPrefix.length)
            : val;
        });
        text.inputEl.focus();
        text.inputEl.setSelectionRange(defaultPrefix.length, defaultPrefix.length);
        text.inputEl.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void this.submit();
          }
        });
      });

    new Setting(contentEl)
      .setName('Include untracked files')
      .setDesc('Temporarily stages untracked files so they are preserved in this snapshot')
      .addToggle((toggle) => {
        toggle.setValue(this.includeUntracked);
        toggle.onChange((val) => {
          this.includeUntracked = val;
        });
      });

    const buttonRow = contentEl.createDiv({ cls: 'git-manager-modal-btn-row' });
    const cancelBtn = buttonRow.createEl('button', { text: 'Cancel' });
    cancelBtn.onclick = () => this.close();

    const createBtn = buttonRow.createEl('button', {
      text: '📸 Create Snapshot',
      cls: 'mod-cta',
    });
    createBtn.onclick = () => void this.submit();
  }

  private async submit(): Promise<void> {
    try {
      const snap = await SnapshotEngine.createSnapshot(
        this.repo.absPath,
        this.customMsg,
        this.includeUntracked,
        this.retentionCount
      );
      new Notice(`✅ Created snapshot: ${snap.label}`);
      this.close();
      if (this.onCreated) this.onCreated();
    } catch (err) {
      new Notice(`❌ Failed to create snapshot: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
