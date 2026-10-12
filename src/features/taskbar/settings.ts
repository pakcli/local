import { App, Setting } from 'obsidian';
import type PakCLILocalPlugin from '../../main';
import { applyTaskbarIcon, getObsidianAppearanceIconPath } from './taskbar';

export function renderTaskbarSettings(
  app: App,
  plugin: PakCLILocalPlugin,
  containerEl: HTMLElement
): void {
  containerEl.empty();

  containerEl.createEl('h3', { text: 'Per-Vault Windows Taskbar Icon' });

  const descEl = containerEl.createEl('p', {
    cls: 'setting-item-description',
    text: 'Gives this vault its own independent Windows taskbar icon and identity using Electron AUMID. Syncs seamlessly with Obsidian’s built-in Custom App Icon.'
  });
  descEl.style.marginBottom = '16px';

  // Appearance Status Banner
  const appearanceIconPath = getObsidianAppearanceIconPath();
  const bannerEl = containerEl.createEl('div', {
    cls: 'setting-item-info'
  });
  bannerEl.style.padding = '10px 14px';
  bannerEl.style.borderRadius = '6px';
  bannerEl.style.marginBottom = '18px';
  bannerEl.style.background = 'var(--background-secondary)';
  bannerEl.style.border = '1px solid var(--background-modifier-border)';

  if (appearanceIconPath) {
    bannerEl.createEl('div', {
      text: `✨ Obsidian Appearance Icon Detected: Active`,
      cls: 'setting-item-name'
    });
    const sub = bannerEl.createEl('div', {
      text: `Source: ${appearanceIconPath} (automatically converted to .ico for Windows Taskbar).`,
      cls: 'setting-item-description'
    });
    sub.style.fontSize = '0.85em';
  } else {
    bannerEl.createEl('div', {
      text: `ℹ️ No custom icon set in Obsidian Appearance yet.`,
      cls: 'setting-item-name'
    });
    const sub = bannerEl.createEl('div', {
      text: `Go to Settings → Appearance → Advanced → "Custom app icon" to choose an icon, or enter a custom path below.`,
      cls: 'setting-item-description'
    });
    sub.style.fontSize = '0.85em';
  }

  new Setting(containerEl)
    .setName('Sync with Obsidian Appearance Icon')
    .setDesc('Automatically use the icon configured in Settings → Appearance → Custom app icon. Highly recommended.')
    .addToggle((toggle) =>
      toggle
        .setValue(plugin.settings.taskbarSyncAppearance !== false)
        .onChange(async (val) => {
          plugin.settings.taskbarSyncAppearance = val;
          await plugin.saveSettings();
        })
    );

  new Setting(containerEl)
    .setName('Custom Icon Path (Override)')
    .setDesc('Optional path to a .ico or .png file. Leave blank to use Obsidian Appearance icon.')
    .addText((text) =>
      text
        .setPlaceholder('C:\\path\\to\\custom-icon.ico')
        .setValue(plugin.settings.taskbarIconPath || '')
        .onChange(async (val) => {
          plugin.settings.taskbarIconPath = val.trim();
          await plugin.saveSettings();
        })
    );

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

  new Setting(containerEl)
    .setName('Apply Taskbar Icon Now')
    .setDesc('Immediately triggers Electron BrowserWindow.setAppDetails() to update the taskbar.')
    .addButton((btn) =>
      btn
        .setButtonText('Apply Now')
        .setCta()
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
