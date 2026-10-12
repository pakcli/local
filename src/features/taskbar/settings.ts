import { App, Notice, Setting } from 'obsidian';
import type PakCLILocalPlugin from '../../main';
import {
  applyTaskbarIcon,
  getObsidianAppearanceIconPath,
  resolveVaultArtifactsIcon,
  saveAppearanceIconToArtifacts
} from './taskbar';
import { TaskbarSubwindowMode } from './types';

export function renderTaskbarSettings(
  app: App,
  plugin: PakCLILocalPlugin,
  containerEl: HTMLElement
): void {
  containerEl.empty();

  containerEl.createEl('h3', { text: 'Per-Vault Windows Taskbar Icon' });

  const descEl = containerEl.createEl('p', {
    cls: 'setting-item-description',
    text: 'Gives this specific vault its own isolated Windows taskbar icon and identity using Electron AUMID. Uses local vault artifacts/icon.ico for complete per-vault independence.'
  });
  descEl.style.marginBottom = '16px';

  // 1. Vault Artifacts Status Banner
  const artifactIcon = resolveVaultArtifactsIcon(plugin);
  const appearanceIconPath = getObsidianAppearanceIconPath();

  const bannerEl = containerEl.createEl('div', { cls: 'setting-item-info' });
  bannerEl.style.padding = '12px 14px';
  bannerEl.style.borderRadius = '6px';
  bannerEl.style.marginBottom = '18px';
  bannerEl.style.background = 'var(--background-secondary)';
  bannerEl.style.border = '1px solid var(--background-modifier-border)';

  if (artifactIcon) {
    bannerEl.createEl('div', {
      text: `✅ Vault Artifact Icon Active`,
      cls: 'setting-item-name'
    });
    const sub = bannerEl.createEl('div', {
      text: `Loaded from: ${artifactIcon.path}. Each vault remains 100% isolated.`,
      cls: 'setting-item-description'
    });
    sub.style.fontSize = '0.85em';
  } else {
    bannerEl.createEl('div', {
      text: `⚠️ No icon found in this vault's artifacts/ folder yet.`,
      cls: 'setting-item-name'
    });
    const sub = bannerEl.createEl('div', {
      text: `Click "Save Appearance Icon to Artifacts" below to automatically capture the icon from Settings → Appearance, or put icon.ico into your vault's artifacts/ folder.`,
      cls: 'setting-item-description'
    });
    sub.style.fontSize = '0.85em';
  }

  // 2. 1-Click Relocation Button
  new Setting(containerEl)
    .setName('Save Appearance Icon to Vault Artifacts')
    .setDesc(
      appearanceIconPath
        ? `Copies your icon (${appearanceIconPath}) into <vault>/artifacts/icon.ico and <vault>/artifacts/icon.png so this vault stays self-contained.`
        : 'Captures the active icon from Settings → Appearance and saves it into this vault’s artifacts/ folder.'
    )
    .addButton((btn) =>
      btn
        .setButtonText(artifactIcon ? 'Re-sync from Appearance' : 'Save to artifacts/icon.ico')
        .setCta()
        .onClick(async () => {
          btn.setDisabled(true);
          btn.setButtonText('Saving & Applying...');
          try {
            await saveAppearanceIconToArtifacts(plugin);
            new Notice('✨ Icon saved! Note: Restart Obsidian app to see the effect on all taskbar items.');
            renderTaskbarSettings(app, plugin, containerEl);
          } finally {
            btn.setDisabled(false);
          }
        })
    );

  // 3. Subwindows & Popouts Behavior Dropdown (3 Options)
  new Setting(containerEl)
    .setName('Sub-windows & Popouts Taskbar Behavior')
    .setDesc('Choose how child windows (such as Settings window, Popout notes) appear and collapse on the Windows Taskbar.')
    .addDropdown((dropdown) =>
      dropdown
        .addOption(
          'subwindows-collapse',
          'change other subwindows aswell + can be join collpase with main'
        )
        .addOption(
          'subwindows-separate',
          'change other subwindows aswell'
        )
        .addOption(
          'none',
          'none'
        )
        .setValue(plugin.settings.taskbarSubwindowMode || 'subwindows-collapse')
        .onChange(async (val) => {
          plugin.settings.taskbarSubwindowMode = val as TaskbarSubwindowMode;
          await plugin.saveSettings();
          await applyTaskbarIcon(plugin, false);
          new Notice('⚡ Taskbar grouping updated. Restart app to see the full effect.');
        })
    );

  // Restart Notice Banner
  const restartNoticeEl = containerEl.createEl('div', {
    cls: 'setting-item-description'
  });
  restartNoticeEl.style.padding = '8px 12px';
  restartNoticeEl.style.margin = '4px 0 16px 0';
  restartNoticeEl.style.borderRadius = '4px';
  restartNoticeEl.style.background = 'var(--background-modifier-form-field)';
  restartNoticeEl.style.borderLeft = '3px solid var(--interactive-accent)';
  restartNoticeEl.style.fontSize = '0.84em';
  restartNoticeEl.innerHTML = '<strong>ℹ️ Note:</strong> Restart Obsidian app to see the effect. Windows Taskbar binds and groups AppUserModelID when windows are first initialized.';

  // 4. Fallback Sync Toggle
  new Setting(containerEl)
    .setName('Fallback: Sync with Obsidian Appearance Icon')
    .setDesc('If artifacts/icon.ico is not present, fall back to the global Obsidian Appearance icon.')
    .addToggle((toggle) =>
      toggle
        .setValue(plugin.settings.taskbarSyncAppearance !== false)
        .onChange(async (val) => {
          plugin.settings.taskbarSyncAppearance = val;
          await plugin.saveSettings();
        })
    );

  // 5. Custom Override Path
  new Setting(containerEl)
    .setName('Custom Icon Path (Override)')
    .setDesc('Optional explicit path to a .ico or .png file. Leave blank to use vault artifacts/icon.ico.')
    .addText((text) =>
      text
        .setPlaceholder('artifacts/icon.ico')
        .setValue(plugin.settings.taskbarIconPath || '')
        .onChange(async (val) => {
          plugin.settings.taskbarIconPath = val.trim();
          await plugin.saveSettings();
        })
    );

  // 6. Custom App ID
  new Setting(containerEl)
    .setName('Custom App ID (AUMID)')
    .setDesc('Optional override for Windows AppUserModelID. Leave blank to auto-generate from vault name.')
    .addText((text) =>
      text
        .setPlaceholder(`Auto (md.obsidian.vault.${plugin.app.vault.getName().replace(/[^\\w]/g, '_')})`)
        .setValue(plugin.settings.taskbarCustomAppId || '')
        .onChange(async (val) => {
          plugin.settings.taskbarCustomAppId = val.trim();
          await plugin.saveSettings();
        })
    );

  // 7. Apply Button
  new Setting(containerEl)
    .setName('Apply Taskbar Icon Now')
    .setDesc('Immediately triggers Electron BrowserWindow.setAppDetails() on all active windows.')
    .addButton((btn) =>
      btn
        .setButtonText('Apply Now')
        .onClick(async () => {
          btn.setDisabled(true);
          btn.setButtonText('Applying...');
          try {
            await applyTaskbarIcon(plugin, true);
            new Notice('✅ Taskbar details applied. (Note: restart app to see the full effect)');
          } finally {
            btn.setDisabled(false);
            btn.setButtonText('Apply Now');
          }
        })
    );
}
