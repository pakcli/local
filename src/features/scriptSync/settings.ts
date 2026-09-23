import { App, Plugin, Setting, Notice } from 'obsidian';
import { SyncManager } from './SyncManager';
import { FolderSyncSettings, SyncStrategy } from './types';
import { ScanSyncModal } from './ui/ScanSyncModal';
import { PendingChangesModal } from './ui/PendingChangesModal';
import { VaultFolderSuggest, FolderPickerModal } from './ui/FolderPicker';

export function renderScriptSyncSettings(
    app: App,
    plugin: Plugin,
    syncManager: SyncManager,
    getSettings: () => FolderSyncSettings,
    saveSettings: () => Promise<void>,
    containerEl: HTMLElement
): void {
    const settings = getSettings();

    // 1. Header Overview & Actions
    new Setting(containerEl)
        .setName('ScriptSync Engine v02')
        .setDesc('Two-way live synchronization between Markdown note codeblocks and external script files on disk.')
        .setHeading();

    const actionCard = containerEl.createDiv({ cls: 'pakcli-wizard-banner' });
    actionCard.createEl('p', {
        text: 'Instantly scan all notes in your vault for embedded PowerShell, Python, Bash, and CMD blocks, or review pending sync items.'
    });

    const btnRow = actionCard.createDiv({ cls: 'pakcli-banner-action-row' });
    const scanBtn = btnRow.createEl('button', { text: '🔍 Scan Vault for Script Blocks', cls: 'pakcli-btn-primary' });
    scanBtn.onclick = () => {
        new ScanSyncModal(app, syncManager, getSettings, saveSettings).open();
    };

    const pendingBtn = btnRow.createEl('button', { text: '📝 View Pending Changes', cls: 'pakcli-btn-reset' });
    pendingBtn.onclick = () => {
        new PendingChangesModal(app, syncManager, getSettings, saveSettings).open();
    };

    // 2. Directory Configurations
    new Setting(containerEl)
        .setName('Folder & Directory Mapping')
        .setHeading();

    // Markdown Root Folder Setting
    new Setting(containerEl)
        .setName('Markdown Notes Folder (Manager Directory)')
        .setDesc('Vault-relative folder containing markdown notes with codeblocks. Default: Digital Library/CLI & Commands')
        .addText((text) => {
            text.setPlaceholder('Digital Library/CLI & Commands')
                .setValue(settings.managerRootFolder ?? 'Digital Library/CLI & Commands')
                .onChange(async (val) => {
                    settings.managerRootFolder = val.trim();
                    await saveSettings();
                });
            new VaultFolderSuggest(app, text.inputEl);
        })
        .addButton((btn) => {
            btn.setButtonText('📁 Browse')
                .setTooltip('Pick vault folder')
                .onClick(() => {
                    new FolderPickerModal(app, async (chosen) => {
                        settings.managerRootFolder = chosen;
                        await saveSettings();
                        renderScriptSyncSettings(app, plugin, syncManager, getSettings, saveSettings, containerEl);
                    }).open();
                });
        });

    // External Scripts Directory Setting
    new Setting(containerEl)
        .setName('External Scripts Directory (CLI Root)')
        .setDesc('Path or folder on disk where raw script files (.ps1, .py, .sh, .bat) are exported and synced. Default: Scripts')
        .addText((text) => {
            text.setPlaceholder('Scripts or D:\\Scripts')
                .setValue(settings.cliRootFolder ?? 'Scripts')
                .onChange(async (val) => {
                    settings.cliRootFolder = val.trim();
                    await saveSettings();
                });
        });

    // 3. Selection Strategy & Automation
    new Setting(containerEl)
        .setName('Selection Strategy & Concurrency')
        .setHeading();

    new Setting(containerEl)
        .setName('Codeblock Selection Strategy')
        .setDesc('Specify how the synchronization engine selects the target codeblock when multiple blocks exist in a note.')
        .addDropdown((dropdown) => {
            dropdown
                .addOption('language_first', 'Language-Filtered First Block (Auto-Skip diff/text)')
                .addOption('explicit_tag_only', 'Explicit :sync Tag Only (e.g. ```powershell:sync)')
                .setValue(settings.syncStrategy || 'language_first')
                .onChange(async (val) => {
                    settings.syncStrategy = val as SyncStrategy;
                    await saveSettings();
                });
        });

    new Setting(containerEl)
        .setName('Auto-Watch External CLI Directory')
        .setDesc('Automatically detect when external script files on disk are modified outside Obsidian with anti-loop echo suppression.')
        .addToggle((toggle) => {
            toggle.setValue(settings.autoWatchCliFolder !== false)
                .onChange(async (val) => {
                    settings.autoWatchCliFolder = val;
                    await saveSettings();
                    if (val) {
                        syncManager.init();
                        new Notice('✅ ScriptSync external file watcher activated.');
                    } else {
                        syncManager.destroy();
                        new Notice('⏸️ ScriptSync file watcher paused.');
                    }
                });
        });

    // 4. Frontmatter & Tips Information Card
    const infoCard = containerEl.createDiv({ cls: 'pakcli-wizard-card' });
    infoCard.createEl('h4', { text: '💡 Note Frontmatter & Custom Tagging Tips' });
    const ul = infoCard.createEl('ul');
    ul.createEl('li', {
        text: 'cli_name: custom-script.ps1 — In note YAML frontmatter, overrides the disk script filename while preserving subpath mirroring.'
    });
    ul.createEl('li', {
        text: 'sync_codeblock: 2 — In note YAML frontmatter, binds synchronization to the 2nd codeblock in the note.'
    });
    ul.createEl('li', {
        text: '```powershell:sync or ```bash:sync — Explicitly tags a codeblock for synchronization, prioritizing it over diff or explanation blocks.'
    });
}
