import { App, Modal, Setting, TextComponent, ToggleComponent, Notice, normalizePath } from 'obsidian';
import { GetCopyManager } from '../GetCopyManager';
import { browseFolder, browseFile } from '../../symlink/dialog';

export class AddPipelineModal extends Modal {
    private manager: GetCopyManager;
    private onAdded: () => void;
    private externalDirInput!: TextComponent;
    private vaultDirInput!: TextComponent;
    private nameInput!: TextComponent;
    private sourceSetting!: Setting;
    private scopeSetting!: Setting;
    private scopeToggle!: ToggleComponent;
    private scanOnAwake = true;
    private readAllSiblings = true;

    constructor(app: App, manager: GetCopyManager, onAdded: () => void) {
        super(app);
        this.manager = manager;
        this.onAdded = onAdded;
    }

    onOpen(): void {
        this.modalEl.addClass('get-copy-add-modal');
        this.titleEl.setText('📁 Add Get-Copy pipeline');
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('p', {
            cls: 'setting-item-description get-copy-modal-desc',
            text: 'Define an external directory or file to pull/copy into your Obsidian vault pipeline.',
        });

        // 1. Pipeline Name (Optional)
        new Setting(contentEl)
            .setName('Pipeline name (optional)')
            .setDesc('A friendly label or alias for this copy pipeline.')
            .addText((text) => {
                this.nameInput = text;
                text.setPlaceholder('e.g. My External Project Docs');
            });

        // 2. Read All Siblings vs Focus on Single File Toggle
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
                            if (!this.nameInput.getValue().trim()) {
                                const parts = picked.replace(/\\/g, '/').split('/').filter(Boolean);
                                if (parts.length > 0) {
                                    this.nameInput.setValue(parts[parts.length - 1]);
                                }
                            }
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
                            if (!this.nameInput.getValue().trim()) {
                                const parts = picked.replace(/\\/g, '/').split('/').filter(Boolean);
                                if (parts.length > 0) {
                                    this.nameInput.setValue(parts[parts.length - 1]);
                                }
                            }
                        }
                    });
            });

        // 4. Vault Directory
        new Setting(contentEl)
            .setName('Vault directory (destination)')
            .setDesc('Folder path relative to vault root where files will be copied.')
            .addText((text) => {
                this.vaultDirInput = text;
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

        // 6. Submit / Cancel Buttons
        const buttonRow = contentEl.createDiv({ cls: 'get-copy-modal-actions' });

        const cancelBtn = buttonRow.createEl('button', { text: 'Cancel' });
        cancelBtn.onclick = () => this.close();

        const submitBtn = buttonRow.createEl('button', {
            text: 'Create Pipeline',
            cls: 'mod-cta',
        });
        submitBtn.onclick = async () => {
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

            try {
                await this.manager.addPipeline(
                    externalDir,
                    normalizePath(vaultDir),
                    this.scanOnAwake,
                    this.readAllSiblings,
                    name
                );
                new Notice('✅ Created Get-Copy pipeline!');
                this.close();
                this.onAdded();
            } catch (err: any) {
                new Notice(`❌ Failed to create pipeline: ${err?.message || err}`);
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
