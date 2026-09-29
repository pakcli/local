import { App, Setting } from 'obsidian';
import type PakCLILocalPlugin from '../../main';
import { ViewMode } from './types';
import { DepsPanel } from './ui/DepsPanel';

export function renderGitManagerSettings(
  app: App,
  plugin: PakCLILocalPlugin,
  containerEl: HTMLElement
): void {
  containerEl.empty();
  containerEl.addClass('git-manager-settings');

  // Ensure default structure
  if (!plugin.settings.gitManager) {
    plugin.settings.gitManager = {
      watchedPaths: [],
      defaultViewMode: ViewMode.Changes,
      bypassConsentGiven: false,
      retentionCount: 20,
      includeUntracked: false,
      repoConfigs: {},
    };
  }
  const gmSettings = plugin.settings.gitManager;

  // ── Section 1: General Settings ──
  new Setting(containerEl)
    .setName('⚙️ General Configuration')
    .setHeading();

  new Setting(containerEl)
    .setName('Default View Mode')
    .setDesc('Initial view mode when opening Git Sentinel modal')
    .addDropdown((dd) => {
      dd.addOption(ViewMode.Changes, '📂 Mode 1: Working Changes & Commit');
      dd.addOption(ViewMode.Stash, '📦 Mode 2: Stash & Local Snapshot');
      dd.addOption(ViewMode.History, '📜 Mode 3: History & Branching');
      dd.setValue(gmSettings.defaultViewMode || ViewMode.Changes);
      dd.onChange(async (val) => {
        gmSettings.defaultViewMode = val as ViewMode;
        await plugin.saveSettings();
      });
    });

  new Setting(containerEl)
    .setName('Snapshot Retention Count')
    .setDesc('Maximum number of local snapshots preserved per repository before oldest are pruned')
    .addSlider((slider) => {
      slider
        .setLimits(5, 50, 5)
        .setValue(gmSettings.retentionCount || 20)
        .setDynamicTooltip()
        .onChange(async (val) => {
          gmSettings.retentionCount = val;
          await plugin.saveSettings();
        });
    });

  new Setting(containerEl)
    .setName('Include untracked files in snapshots')
    .setDesc('Automatically preserves new and untracked files when generating local snapshots')
    .addToggle((toggle) => {
      toggle.setValue(gmSettings.includeUntracked || false);
      toggle.onChange(async (val) => {
        gmSettings.includeUntracked = val;
        await plugin.saveSettings();
      });
    });

  // ── Section 2: Watched Repositories ──
  new Setting(containerEl)
    .setName('📁 Watched Repositories')
    .setDesc('Explicit directory paths to Git repositories on your system to monitor in Git Sentinel')
    .setHeading();

  const pathsContainer = containerEl.createDiv({ cls: 'git-manager-watched-paths-list' });

  const renderPaths = () => {
    pathsContainer.empty();
    if (gmSettings.watchedPaths.length === 0) {
      pathsContainer.createDiv({
        cls: 'git-manager-empty-text',
        text: 'No extra repository paths configured. Git Sentinel automatically scans vault root and direct links.',
      });
    } else {
      gmSettings.watchedPaths.forEach((p, idx) => {
        const item = pathsContainer.createDiv({ cls: 'git-manager-path-item' });
        item.createSpan({ cls: 'git-manager-path-text', text: p });
        const delBtn = item.createEl('button', { text: 'Remove', cls: 'git-manager-btn-xs' });
        delBtn.onclick = async () => {
          gmSettings.watchedPaths.splice(idx, 1);
          await plugin.saveSettings();
          renderPaths();
        };
      });
    }
  };
  renderPaths();

  let newPathInput = '';
  new Setting(containerEl)
    .setName('Add repository path')
    .setDesc('Enter full absolute path to a Git repository')
    .addText((text) => {
      text.setPlaceholder('D:\\projects\\my-repo');
      text.onChange((val) => {
        newPathInput = val.trim();
      });
    })
    .addButton((btn) => {
      btn.setButtonText('+ Add Path').setCta().onClick(async () => {
        if (!newPathInput) return;
        if (!gmSettings.watchedPaths.includes(newPathInput)) {
          gmSettings.watchedPaths.push(newPathInput);
          await plugin.saveSettings();
          renderPaths();
        }
      });
    });

  // ── Section 3: Focused Dependencies Panel ──
  const depsSection = containerEl.createDiv({ cls: 'git-manager-deps-section' });
  const depsPanel = new DepsPanel(app, depsSection, gmSettings.bypassConsentGiven);
  void depsPanel.render();
}
