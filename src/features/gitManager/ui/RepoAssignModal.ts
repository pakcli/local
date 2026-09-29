import { App, Modal, Notice, Setting } from 'obsidian';
import type PakCLILocalPlugin from '../../../main';
import { GitCliService } from '../services/GitCliService';
import { ResolvedArea, RepoTargetMode, ViewMode } from '../types';
import { DEP_DEFINITIONS, checkSingleDep, detectOs } from '../../hub/depsTable';
import { ConsentModal } from '../../hub/consentModal';
import { detectPsExe, runPsCommand } from '../../hub/psRunner';

export class RepoAssignModal extends Modal {
  private plugin: PakCLILocalPlugin;
  private area: ResolvedArea;
  private onSaved?: () => void;

  private selectedMode: RepoTargetMode = 'local-only';
  private remoteUrl = '';
  private defaultBranch = 'main';
  private autoPush = false;

  private gitInstalled = false;
  private gitVersion = '';
  private ghInstalled = false;
  private ghVersion = '';
  private isAuditing = true;

  constructor(app: App, plugin: PakCLILocalPlugin, area: ResolvedArea, onSaved?: () => void) {
    super(app);
    this.plugin = plugin;
    this.area = area;
    this.onSaved = onSaved;

    // Load existing config if available
    const existing = this.plugin.settings.gitManager?.repoConfigs?.[this.area.areaFolderPath];
    if (existing) {
      this.selectedMode = existing.mode;
      this.remoteUrl = existing.remoteUrl || '';
      this.defaultBranch = existing.defaultBranch || 'main';
      this.autoPush = Boolean(existing.autoPushOnCommit);
    }
  }

  async onOpen(): Promise<void> {
    this.modalEl.addClass('git-manager-assign-modal');
    await this.auditDeps();
    this.render();
  }

  private async auditDeps(): Promise<void> {
    this.isAuditing = true;
    const os = detectOs();
    const isWin = os.platform === 'win32';

    const gitDef = DEP_DEFINITIONS.find((d) => d.name === 'git');
    const ghDef = DEP_DEFINITIONS.find((d) => d.name.toLowerCase().includes('github cli'));

    if (gitDef) {
      const res = await checkSingleDep(gitDef, isWin);
      this.gitInstalled = res.status === 'ok';
      this.gitVersion = res.version;
    }

    if (ghDef) {
      const res = await checkSingleDep(ghDef, isWin);
      this.ghInstalled = res.status === 'ok';
      this.ghVersion = res.version;
    } else {
      const ghCheck = await GitCliService.checkGhInstalled();
      this.ghInstalled = ghCheck.installed;
      this.ghVersion = ghCheck.version || '';
    }

    // Try reading remote origin URL if already a repo
    if (this.area.isGitRepo && !this.remoteUrl) {
      try {
        const root = this.area.gitRootPath || this.area.areaFolderPath;
        this.remoteUrl = await GitCliService.getRemoteUrl(root);
        if (this.remoteUrl) {
          this.selectedMode = 'github';
        }
      } catch {
        // ignore
      }
    }

    this.isAuditing = false;
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();

    // ── Header ──
    contentEl.createEl('h2', { text: '📸 Git: Manage This Area' });

    const infoBox = contentEl.createDiv({ cls: 'git-manager-assign-info' });
    const row1 = infoBox.createDiv({ cls: 'git-manager-info-row' });
    row1.createSpan({ cls: 'info-label', text: 'Target Area: ' });
    row1.createSpan({ cls: 'info-value', text: this.area.areaFolderPath });

    const row2 = infoBox.createDiv({ cls: 'git-manager-info-row' });
    row2.createSpan({ cls: 'info-label', text: 'Scope: ' });
    row2.createSpan({
      cls: 'info-value',
      text: this.area.targetType === 'file'
        ? `Containing folder of "${this.area.relativeFilePath}" (all siblings included)`
        : 'Entire folder and all subdirectories',
    });

    const row3 = infoBox.createDiv({ cls: 'git-manager-info-row' });
    row3.createSpan({ cls: 'info-label', text: 'Status: ' });
    row3.createSpan({
      cls: `info-badge ${this.area.isGitRepo ? 'status-active' : 'status-uninit'}`,
      text: this.area.isGitRepo ? '🟢 Active Git Repository' : '🟡 Not Yet Initialized',
    });

    contentEl.createEl('h4', { text: 'Select Repository Target Mode:', cls: 'git-manager-assign-heading' });

    // ═════════════════════════════════════════════════════════════════════════
    // MODE 1 CARD: Local Git Only
    // ═════════════════════════════════════════════════════════════════════════
    const isMode1Disabled = !this.gitInstalled;
    const mode1Card = contentEl.createDiv({
      cls: `git-manager-mode-card ${this.selectedMode === 'local-only' ? 'is-selected' : ''} ${isMode1Disabled ? 'is-disabled' : ''}`,
    });

    const m1Header = mode1Card.createDiv({ cls: 'mode-card-header' });
    const m1Radio = m1Header.createEl('input', { type: 'radio', attr: { name: 'targetMode' } });
    m1Radio.id = 'mode-local-only';
    m1Radio.checked = this.selectedMode === 'local-only';
    m1Radio.disabled = isMode1Disabled;

    m1Header.createEl('label', {
      text: '🔒 Mode 1: Local Git Only (Strictly Offline)',
      attr: { for: 'mode-local-only' },
      cls: 'mode-card-title',
    });

    if (!isMode1Disabled) {
      mode1Card.onclick = (e) => {
        if ((e.target as HTMLElement).tagName !== 'BUTTON') {
          this.selectedMode = 'local-only';
          this.render();
        }
      };
    }

    const m1Desc = mode1Card.createDiv({ cls: 'mode-card-desc' });
    m1Desc.createEl('p', { text: '• Strictly offline version control and snapshots (refs/snapshots/*).' });
    m1Desc.createEl('p', { text: '• Remote pushing is permanently blocked. Zero accidental cloud leaks.' });
    m1Desc.createEl('p', { text: '• Best for: Private journals, sensitive research, and offline notes.' });

    if (isMode1Disabled) {
      this.renderMissingDepBox(
        mode1Card,
        'Git is required for local versioning. It is not currently detected.',
        'Git.Git',
        'Git'
      );
    } else {
      mode1Card.createDiv({ cls: 'mode-card-ready', text: `✅ Git Ready (${this.gitVersion || 'installed'})` });
    }

    // ═════════════════════════════════════════════════════════════════════════
    // MODE 2 CARD: Git + GitHub
    // ═════════════════════════════════════════════════════════════════════════
    const isMode2Disabled = !this.gitInstalled || !this.ghInstalled;
    const mode2Card = contentEl.createDiv({
      cls: `git-manager-mode-card ${this.selectedMode === 'github' ? 'is-selected' : ''} ${isMode2Disabled ? 'is-disabled' : ''}`,
    });

    const m2Header = mode2Card.createDiv({ cls: 'mode-card-header' });
    const m2Radio = m2Header.createEl('input', { type: 'radio', attr: { name: 'targetMode' } });
    m2Radio.id = 'mode-github';
    m2Radio.checked = this.selectedMode === 'github';
    m2Radio.disabled = isMode2Disabled;

    m2Header.createEl('label', {
      text: '🌐 Mode 2: Git + GitHub (Synchronized Repository)',
      attr: { for: 'mode-github' },
      cls: 'mode-card-title',
    });

    if (!isMode2Disabled) {
      mode2Card.onclick = (e) => {
        if ((e.target as HTMLElement).tagName !== 'BUTTON' && (e.target as HTMLElement).tagName !== 'INPUT') {
          this.selectedMode = 'github';
          this.render();
        }
      };
    }

    const m2Desc = mode2Card.createDiv({ cls: 'mode-card-desc' });
    m2Desc.createEl('p', { text: '• Tracked locally AND synchronized with GitHub remote repository (origin).' });
    m2Desc.createEl('p', { text: '• Enables 1-click Push, Pull, and Remote Sync with auto-safety snapshots.' });

    if (isMode2Disabled) {
      const missingName = !this.gitInstalled ? 'Git' : 'GitHub CLI (gh)';
      const installPkg = !this.gitInstalled ? 'Git.Git' : 'GitHub.cli';
      this.renderMissingDepBox(
        mode2Card,
        `${missingName} is required for GitHub sync. It is not currently detected.`,
        installPkg,
        missingName
      );
    } else {
      mode2Card.createDiv({
        cls: 'mode-card-ready',
        text: `✅ GitHub CLI Ready (${this.ghVersion || 'installed'}) & Git Ready`,
      });

      // Config inputs for GitHub mode
      const ghInputs = mode2Card.createDiv({ cls: 'mode-card-inputs' });

      new Setting(ghInputs)
        .setName('GitHub Remote URL')
        .setDesc('HTTPS or SSH remote repository URL')
        .addText((text) => {
          text.setPlaceholder('https://github.com/username/repo.git');
          text.setValue(this.remoteUrl);
          text.inputEl.addClass('git-manager-wide-input');
          text.onChange((val) => {
            this.remoteUrl = val.trim();
          });
        });

      new Setting(ghInputs)
        .setName('Default Branch')
        .addDropdown((dd) => {
          dd.addOption('main', 'main');
          dd.addOption('master', 'master');
          dd.setValue(this.defaultBranch);
          dd.onChange((val) => {
            this.defaultBranch = val;
          });
        });

      new Setting(ghInputs)
        .setName('Auto-push on Commit')
        .setDesc('Automatically trigger git push whenever a commit is made in Mode 1')
        .addToggle((toggle) => {
          toggle.setValue(this.autoPush);
          toggle.onChange((val) => {
            this.autoPush = val;
          });
        });
    }

    // ── Bottom Action Buttons ──
    const footer = contentEl.createDiv({ cls: 'git-manager-assign-footer' });

    const cancelBtn = footer.createEl('button', { text: 'Cancel' });
    cancelBtn.onclick = () => this.close();

    const saveBtn = footer.createEl('button', {
      text: this.area.isGitRepo ? '💾 Save Mode Configuration' : '⚡ Initialize Repository',
      cls: 'mod-cta',
    });
    saveBtn.disabled = this.selectedMode === 'local-only' ? isMode1Disabled : isMode2Disabled;
    saveBtn.onclick = () => void this.submit();
  }

  private renderMissingDepBox(
    cardEl: HTMLElement,
    message: string,
    wingetPkg: string,
    toolName: string
  ): void {
    const alertBox = cardEl.createDiv({ cls: 'mode-card-alert' });
    alertBox.createDiv({ text: `⚠️ ${message}`, cls: 'alert-msg' });

    const btnRow = alertBox.createDiv({ cls: 'alert-btn-row' });

    // 1. Quick Refresh button
    const refreshBtn = btnRow.createEl('button', {
      text: '🔄 Quick Refresh',
      cls: 'git-manager-btn-sm',
    });
    refreshBtn.onclick = async () => {
      refreshBtn.setText('🔍 Checking…');
      await this.auditDeps();
      this.render();
    };

    // 2. Install button
    const installBtn = btnRow.createEl('button', {
      text: `⬇️ Install ${toolName}`,
      cls: 'git-manager-btn-sm mod-cta',
    });
    installBtn.onclick = async () => {
      await this.handleInstall(wingetPkg, toolName, installBtn);
    };

    // 3. Go to Dependency Checker button
    const gotoBtn = btnRow.createEl('button', {
      text: '⚙️ Go to Dependency Checker',
      cls: 'git-manager-btn-sm',
    });
    gotoBtn.onclick = () => {
      this.close();
      const appAny = this.app as unknown as { setting?: { open: () => void; openTabById?: (id: string) => void } };
      if (appAny.setting) {
        appAny.setting.open();
        appAny.setting.openTabById?.('pakcli-local');
      }
    };
  }

  private async handleInstall(wingetPkg: string, toolName: string, btn: HTMLButtonElement): Promise<void> {
    const psExe = detectPsExe();
    if (!psExe) {
      new Notice('❌ PowerShell executable not found on this system.');
      return;
    }

    const command = `winget install --id ${wingetPkg} -e --source winget`;
    const consent = await ConsentModal.ask(this.app, psExe, command);
    if (!consent.confirmed) return;

    btn.setText(`⏳ Installing ${toolName}…`);
    btn.disabled = true;

    try {
      const res = await runPsCommand(psExe, command);
      if (res.success) {
        new Notice(`✅ ${toolName} installed successfully!`);
        await this.auditDeps();
        this.render();
      } else {
        new Notice(`❌ Installation failed: ${res.stderr || res.stdout}`);
        btn.setText(`⬇️ Retry Install`);
        btn.disabled = false;
      }
    } catch (err) {
      new Notice(`❌ Error: ${err instanceof Error ? err.message : String(err)}`);
      btn.setText(`⬇️ Install ${toolName}`);
      btn.disabled = false;
    }
  }

  private async submit(): Promise<void> {
    const targetFolder = this.area.areaFolderPath;
    try {
      // 1. Initialize if not a git repository yet
      if (!this.area.isGitRepo) {
        await GitCliService.initRepo(targetFolder, this.defaultBranch);
        new Notice(`⚡ Initialized Git repository in ${this.area.areaFolderName}`);
      }

      // 2. Configure Remote Mode
      if (this.selectedMode === 'github' && this.remoteUrl) {
        await GitCliService.setRemoteUrl(targetFolder, this.remoteUrl);
        new Notice(`🌐 Connected GitHub remote: ${this.remoteUrl}`);
      } else if (this.selectedMode === 'local-only') {
        // Local only: remove remote origin if present to ensure zero cloud leaks
        try {
          await GitCliService.removeRemote(targetFolder);
        } catch {
          // ignore if no remote existed
        }
      }

      // 3. Save to Settings
      if (!this.plugin.settings.gitManager) {
        this.plugin.settings.gitManager = {
          watchedPaths: [],
          defaultViewMode: 'changes' as any,
          bypassConsentGiven: false,
          retentionCount: 20,
          includeUntracked: false,
          repoConfigs: {},
        };
      }

      if (!this.plugin.settings.gitManager.repoConfigs) {
        this.plugin.settings.gitManager.repoConfigs = {};
      }

      this.plugin.settings.gitManager.repoConfigs[targetFolder] = {
        path: targetFolder,
        mode: this.selectedMode,
        remoteUrl: this.remoteUrl || undefined,
        defaultBranch: this.defaultBranch,
        autoPushOnCommit: this.autoPush,
        lastSyncTime: new Date().toISOString(),
      };

      // Add to watchedPaths if not present
      if (!this.plugin.settings.gitManager.watchedPaths.includes(targetFolder)) {
        this.plugin.settings.gitManager.watchedPaths.push(targetFolder);
      }

      await this.plugin.saveSettings();
      new Notice(`✅ Configuration saved for "${this.area.areaFolderName}" (${this.selectedMode})`);

      this.close();
      if (this.onSaved) this.onSaved();
    } catch (err) {
      new Notice(`❌ Failed to configure repository: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
