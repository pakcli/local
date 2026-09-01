import { App, Plugin, Setting, Notice } from 'obsidian';
import { SyncManager } from './SyncManager';
import { FolderSyncSettings } from './types';
import { ScanSyncModal } from './ui/ScanSyncModal';
import { PendingChangesModal } from './ui/PendingChangesModal';
import { VaultFolderSuggest, FolderPickerModal } from './ui/FolderPicker';
import { getNodeFs } from '../../utils/nodeHelpers';

export function renderScriptSyncSettings(
    app: App,
    plugin: Plugin,
    syncManager: SyncManager,
    getSettings: () => any,
    saveSettings: () => Promise<void>,
    containerEl: HTMLElement
): void {
    const settings = getSettings();

    // 1. Header Overview & Actions
    new Setting(containerEl)
        .setName('ScriptSync Engine')
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
    const mdSetting = new Setting(containerEl)
        .setName('Markdown Notes Folder (Manager Directory)')
        .setDesc('Vault-relative folder containing markdown notes with codeblocks. Leave empty to scan the entire vault root.')
        .addText((text) => {
            text.setPlaceholder('e.g. scripts or Notes/Automation (empty = Vault Root)')
                .setValue(settings.managerRootFolder || '')
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
        .setDesc('Absolute path or folder on disk where raw script files (.ps1, .py, .sh, .bat) are exported and synced.')
        .addText((text) => {
            text.setPlaceholder('e.g. D:\Scripts or C:\Users\Name\Projects\scripts')
                .setValue(settings.cliRootFolder || '')
                .onChange(async (val) => {
                    settings.cliRootFolder = val.trim();
                    await saveSettings();
                });
        });

    // 3. Automation & Watcher Preferences
    new Setting(containerEl)
        .setName('Automation & File Watcher')
        .setHeading();

    new Setting(containerEl)
        .setName('Auto-Watch External CLI Directory')
        .setDesc('Automatically detect when external script files on disk are modified outside Obsidian.')
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

    new Setting(containerEl)
        .setName('Supported Script Languages')
        .setDesc('ScriptSync tracks and compiles: PowerShell (.ps1), Python (.py), Bash (.sh), and Batch (.bat/.cmd).');
}
