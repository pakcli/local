import { App } from 'obsidian';
import {
  DEP_DEFINITIONS,
  checkSingleDep,
  renderDepsTable,
  DepResult,
  detectOs,
} from '../../hub/depsTable';

export class DepsPanel {
  private app: App;
  private containerEl: HTMLElement;
  private bypassConsentGiven = false;
  private depsResults: DepResult[] = [];
  private isChecking = false;

  constructor(app: App, containerEl: HTMLElement, bypassConsentGiven = false) {
    this.app = app;
    this.containerEl = containerEl;
    this.bypassConsentGiven = bypassConsentGiven;
  }

  async render(): Promise<void> {
    this.containerEl.empty();
    const panel = this.containerEl.createDiv({ cls: 'git-manager-deps-panel' });

    panel.createEl('h3', { text: '⚙️ Dependencies for Git Sentinel', cls: 'git-manager-deps-title' });
    panel.createEl('p', {
      text: 'Git Sentinel relies on Git for version control and PowerShell for automated script execution and diagnostics.',
      cls: 'git-manager-deps-desc',
    });

    const tableWrap = panel.createDiv({ cls: 'git-manager-deps-table-wrap' });

    const doCheck = async () => {
      this.isChecking = true;
      tableWrap.empty();
      tableWrap.createDiv({ cls: 'pakcli-deps-loading', text: '🔍 Checking Git and PowerShell dependencies…' });

      const gitDefs = DEP_DEFINITIONS.filter((d) =>
        ['PowerShell', 'git', 'GitHub CLI (gh)'].includes(d.name)
      );

      const os = detectOs();
      const isWin = os.platform === 'win32';

      this.depsResults = await Promise.all(
        gitDefs.map((def) => checkSingleDep(def, isWin))
      );
      this.isChecking = false;

      renderDepsTable(tableWrap, this.depsResults, () => { void doCheck(); }, {
        app: this.app,
        bypassConsentGiven: this.bypassConsentGiven,
        onConsentGiven: () => {
          this.bypassConsentGiven = true;
        },
      });
    };

    if (this.depsResults.length > 0) {
      renderDepsTable(tableWrap, this.depsResults, () => { void doCheck(); }, {
        app: this.app,
        bypassConsentGiven: this.bypassConsentGiven,
        onConsentGiven: () => {
          this.bypassConsentGiven = true;
        },
      });
    } else {
      const runWrap = tableWrap.createDiv({ cls: 'git-manager-deps-run-wrap' });
      const runBtn = runWrap.createEl('button', {
        text: '🔍 Check Git & PowerShell Dependencies',
        cls: 'mod-cta',
      });
      runBtn.onclick = () => void doCheck();
    }
  }
}
