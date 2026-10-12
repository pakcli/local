import { App, Setting } from 'obsidian';
import type PakCLILocalPlugin from '../../main';
import {
  applyTaskbarIcon,
  getObsidianAppearanceIconPath,
  resolveVaultArtifactsIcon,
  saveAppearanceIconToArtifacts
} from './taskbar';

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
            renderTaskbarSettings(app, plugin, containerEl);
          } finally {
            btn.setDisabled(false);
          }
        })
    );

  // 3. Fallback Sync Toggle
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

  // 4. Custom Override Path
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

  // 5. Custom App ID
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

  // 6. Apply Button
  new Setting(containerEl)
    .setName('Apply Taskbar Icon Now')
    .setDesc('Immediately triggers Electron BrowserWindow.setAppDetails() to update the taskbar.')
    .addButton((btn) =>
      btn
        .setButtonText('Apply Now')
        .onClick(async () => {
          btn.setDisabled(true);
          btn.setButtonText('Applying...');
          try {
            await applyTaskbarIcon(plugin, true);
          } finally {
            btn.setDisabled(false);
            btn.setButtonText('Apply Now');
          }
        })
    );
}
