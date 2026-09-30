import { App, Modal, Setting, TFile, setIcon, Notice, MarkdownView } from 'obsidian';
import { RawOpenerManager } from '../RawOpenerManager';
import { RawFileMode } from '../types';

export class FormatSwitchModal extends Modal {
    private manager: RawOpenerManager;
    private targetFile: TFile | null;

    constructor(app: App, manager: RawOpenerManager, targetFile: TFile | null) {
        super(app);
        this.manager = manager;
        this.targetFile = targetFile;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('raw-format-modal');

        const file = this.targetFile || this.app.workspace.getActiveFile();
        if (!file) {
            contentEl.createEl('h3', { text: '📄 Raw File Opener' });
            contentEl.createDiv({ text: 'No active file selected.' });
            return;
        }

        const ext = file.extension.toLowerCase();
        const rule = this.manager.getRule(ext);

        new Setting(contentEl)
            .setName(`📄 Format Configuration: .${ext.toUpperCase()}`)
            .setDesc(`Current File: ${file.name}`)
            .setHeading();

        const statusBox = contentEl.createDiv({ cls: 'raw-modal-status-box' });
        statusBox.createDiv({
            cls: 'raw-status-row',
            text: `Current Mode: ${rule ? (rule.mode === 'live' ? '✨ Live Preview' : rule.mode === 'source' ? '📝 Source Mode' : '📖 Reading View') : 'Default (Live Preview)'}`
        });
        statusBox.createDiv({
            cls: 'raw-status-row',
            text: `Read-Only Status: ${rule?.readOnly ? '🔒 Locked (Read-Only)' : '🔓 Editable'}`
        });

        // Mode Switching Actions
        const actionGrid = contentEl.createDiv({ cls: 'raw-modal-action-grid' });

        const modes: Array<{ id: RawFileMode; label: string; desc: string; icon: string }> = [
            { id: 'live', label: 'Live Preview', desc: 'WYSIWYG live editing experience', icon: 'sparkles' },
            { id: 'source', label: 'Source Mode', desc: 'Raw plaintext source editor', icon: 'code' },
            { id: 'reading', label: 'Reading View', desc: 'Rendered read-only view', icon: 'book-open' },
        ];

        modes.forEach(m => {
            const card = actionGrid.createDiv({
                cls: `raw-modal-card ${rule?.mode === m.id ? 'is-active' : ''}`
            });
            const topRow = card.createDiv({ cls: 'raw-modal-card-top' });
            const iconSpan = topRow.createSpan({ cls: 'raw-modal-card-icon' });
            setIcon(iconSpan, m.icon);
            topRow.createSpan({ cls: 'raw-modal-card-title', text: m.label });

            card.createDiv({ cls: 'raw-modal-card-desc', text: m.desc });

            card.onclick = async () => {
                if (rule) {
                    await this.manager.setExtensionMode(ext, m.id);
                } else {
                    await this.manager.addRule(ext, m.id, false);
                }
                const activeLeaf = this.app.workspace.getActiveViewOfType(MarkdownView)?.leaf || this.app.workspace.getLeaf();
                if (activeLeaf) {
                    await this.manager.applyModeToLeaf(activeLeaf, m.id);
                }
                new Notice(`✅ [RawOpener] .${ext} mode switched to ${m.label}!`);
                this.close();
            };
        });

        // Read-Only Toggle
        const lockSection = contentEl.createDiv({ cls: 'raw-modal-lock-section' });
        const lockBtn = lockSection.createEl('button', {
            cls: `raw-modal-toggle-lock-btn ${rule?.readOnly ? 'is-locked' : 'is-unlocked'}`,
            text: rule?.readOnly ? '🔓 Unlock (Enable Editing)' : '🔒 Lock (Set Read-Only)'
        });
        lockBtn.onclick = async () => {
            if (rule) {
                await this.manager.toggleExtensionReadOnly(ext);
            } else {
                await this.manager.addRule(ext, 'live', true);
            }
            this.close();
        };

        // Open Settings Button
        const footerEl = contentEl.createDiv({ cls: 'raw-modal-footer' });
        const settingsBtn = footerEl.createEl('button', {
            text: '⚙️ Open All Raw Formats Settings',
            cls: 'raw-modal-settings-btn'
        });
        settingsBtn.onclick = () => {
            this.close();
            (this.app as any).setting?.open();
            (this.app as any).setting?.openTabById('pakcli-local');
        };
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
