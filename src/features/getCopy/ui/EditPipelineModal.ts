import { App, Modal, Setting, TextComponent, ToggleComponent, Notice, normalizePath } from 'obsidian';
import { GetCopyManager } from '../GetCopyManager';
import { GetCopyPipelineItem } from '../types';
import { browseFolder, browseFile } from '../../symlink/dialog';

export class EditPipelineModal extends Modal {
    private manager: GetCopyManager;
    private item: GetCopyPipelineItem;
    private onSaved: () => void;
    private nameInput!: TextComponent;
    private externalDirInput!: TextComponent;
    private vaultDirInput!: TextComponent;
    private sourceSetting!: Setting;
    private scopeSetting!: Setting;
    private scopeToggle!: ToggleComponent;
    private readAllSiblings: boolean;
    private scanOnAwake: boolean;

    constructor(
        app: App,
        manager: GetCopyManager,
        item: GetCopyPipelineItem,
        onSaved: () => void
    ) {
        super(app);
        this.manager = manager;
        this.item = item;
        this.onSaved = onSaved;
        this.readAllSiblings = item.readAllSiblings !== false;
        this.scanOnAwake = item.scanOnAwake;
    }

    onOpen(): void {
        this.modalEl.addClass('get-copy-edit-modal');
        this.titleEl.setText(`⚙️ Settings: ${this.item.name || 'Pipeline'}`);
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('p', {
            cls: 'setting-item-description get-copy-modal-desc',
            text: 'Configure mapping, scope mode, and auto-sync options for this pipeline.',
        });

        // 1. Pipeline Name
        new Setting(contentEl)
            .setName('Pipeline name')
            .setDesc('Friendly label or alias for this copy pipeline.')
            .addText((text) => {
                this.nameInput = text;
                text.setValue(this.item.name || '');
                text.setPlaceholder('e.g. My External Project Docs');
            });

        // 2. Read All Siblings Toggle
        this.scopeSetting = new Setting(contentEl)
            .setName('Read all siblings')
            .setDesc(
                this.readAllSiblings
                    ? 'Copies all sibling files and subfolders in the external directory.'
                    : 'Focuses on copying one single file into the vault.'
            )
            .addToggle((toggle) => {
                this.scopeToggle = toggle;
                toggle.setValue(this.readAllSiblings);
                toggle.onChange((val) => {
                    this.readAllSiblings = val;
                    this.scopeSetting.setDesc(
                        val
                            ? 'Copies all sibling files and subfolders in the external directory.'
                            : 'Focuses on copying one single file into the vault.'
                    );
                    this.updateSourceSettingUI();
                });
            });

        // 3. External Source (Folder or Single File)
        this.sourceSetting = new Setting(contentEl)
            .setName(this.readAllSiblings ? 'External source (folder)' : 'External source (file)')
            .setDesc(
                this.readAllSiblings
                    ? 'Select external folder itself to copy all siblings from disk.'
                    : 'Select a single file instance to copy into the vault.'
            )
            .addText((text) => {
                this.externalDirInput = text;
                text.setValue(this.item.externalDir || '');
                text.setPlaceholder(
                    this.readAllSiblings ? 'D:/projects/my-source-folder' : 'D:/projects/my-source-folder/notes.md'
                );
            })
            .addButton((btn) => {
                btn.setButtonText('Folder')
                    .setIcon('folder')
                    .setTooltip('Browse and select folder itself')
                    .onClick(async () => {
                        const currentVal = this.externalDirInput.getValue().trim();
                        const picked = await browseFolder(currentVal);
                        if (picked) {
                            this.externalDirInput.setValue(picked);
                            this.readAllSiblings = true;
                            if (this.scopeToggle) this.scopeToggle.setValue(true);
                            if (this.scopeSetting) {
                                this.scopeSetting.setDesc('Copies all sibling files and subfolders in the external directory.');
                            }
                            this.updateSourceSettingUI();
                        }
                    });
            })
            .addButton((btn) => {
                btn.setButtonText('File')
                    .setIcon('file-text')
                    .setTooltip('Browse and select single file instance')
                    .onClick(async () => {
                        const currentVal = this.externalDirInput.getValue().trim();
                        const picked = await browseFile(currentVal);
                        if (picked) {
                            this.externalDirInput.setValue(picked);
                            this.readAllSiblings = false;
                            if (this.scopeToggle) this.scopeToggle.setValue(false);
                            if (this.scopeSetting) {
                                this.scopeSetting.setDesc('Focuses on copying one single file into the vault.');
                            }
                            this.updateSourceSettingUI();
                        }
                    });
            });

        // 4. Vault Directory
        new Setting(contentEl)
            .setName('Vault directory (destination)')
            .setDesc('Folder path relative to vault root where files will be copied.')
            .addText((text) => {
                this.vaultDirInput = text;
                text.setValue(this.item.vaultDir || '');
                text.setPlaceholder('imported/my-folder');
            });

        // 5. Scan on Awake
        new Setting(contentEl)
            .setName('Scan on Obsidian awake')
            .setDesc('Automatically sync this pipeline when Obsidian opens if not scanned today.')
            .addToggle((toggle) => {
                toggle.setValue(this.scanOnAwake);
                toggle.onChange((val) => {
                    this.scanOnAwake = val;
                });
            });

        // 6. Reveal in Explorer Helper
        new Setting(contentEl)
            .setName('Open external path')
            .setDesc('Reveal source folder or file in your system file manager (Explorer / Finder).')
            .addButton((btn) => {
                btn.setButtonText('Reveal in Explorer')
                    .setIcon('folder-open')
                    .onClick(() => {
                        const path = this.externalDirInput.getValue().trim();
                        if (!path) {
                            new Notice('No path specified.');
                            return;
                        }
                        try {
                            const req = (window as unknown as { require?: (m: string) => unknown }).require;
                            if (typeof req === 'function') {
                                const electron = req('electron') as any;
                                if (electron?.shell?.openPath) {
                                    electron.shell.openPath(path);
                                    return;
                                }
                            }
                        } catch {
                            // ignore
                        }
                        new Notice(`External path: ${path}`);
                    });
            });

        // 7. Buttons: Cancel & Save
        const buttonRow = contentEl.createDiv({ cls: 'get-copy-modal-actions' });

        const cancelBtn = buttonRow.createEl('button', { text: 'Cancel' });
        cancelBtn.onclick = () => this.close();

        const saveBtn = buttonRow.createEl('button', {
            text: 'Save Settings',
            cls: 'mod-cta',
        });
        saveBtn.onclick = async () => {
            const externalDir = this.externalDirInput.getValue().trim();
            const vaultDir = this.vaultDirInput.getValue().trim();
            const name = this.nameInput.getValue().trim();

            if (!externalDir) {
                new Notice(
                    this.readAllSiblings
                        ? '⚠️ Please specify an external source folder.'
                        : '⚠️ Please specify an external source file.'
                );
                return;
            }
            if (!vaultDir) {
                new Notice('⚠️ Please specify a destination vault directory.');
                return;
            }

            this.item.name = name || this.item.name;
            this.item.externalDir = externalDir;
            this.item.vaultDir = normalizePath(vaultDir);
            this.item.readAllSiblings = this.readAllSiblings;
            this.item.scanOnAwake = this.scanOnAwake;

            try {
                await this.manager.updatePipeline(this.item);
                new Notice(`✅ Updated settings for "${this.item.name}".`);
                this.close();
                this.onSaved();
            } catch (err: any) {
                new Notice(`❌ Failed to update settings: ${err?.message || err}`);
            }
        };
    }

    private updateSourceSettingUI(): void {
        if (!this.sourceSetting) return;

        this.sourceSetting.setName(
            this.readAllSiblings ? 'External source (folder)' : 'External source (file)'
        );
        this.sourceSetting.setDesc(
            this.readAllSiblings
                ? 'Select external folder itself to copy all siblings from disk.'
                : 'Select a single file instance to copy into the vault.'
        );

        if (this.externalDirInput) {
            this.externalDirInput.setPlaceholder(
                this.readAllSiblings ? 'D:/projects/my-source-folder' : 'D:/projects/my-source-folder/notes.md'
            );
        }
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
