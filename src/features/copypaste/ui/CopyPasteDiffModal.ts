import { App, Modal, Notice, setIcon } from 'obsidian';
import { CopyPasteManager } from '../CopyPasteManager';
import { TargetFilterRule, DiffPairItem } from '../types';
import { renderDiffViewer } from '../../scriptSync/diffViewer';

export class CopyPasteDiffModal extends Modal {
    private manager: CopyPasteManager;
    private rule: TargetFilterRule;
    private onApplied?: () => void;

    private items: DiffPairItem[] = [];
    private selectedItem: DiffPairItem | null = null;
    private searchQuery: string = '';
    private isSwapped: boolean = false;
    private isLoading: boolean = true;

    constructor(
        app: App,
        manager: CopyPasteManager,
        rule: TargetFilterRule,
        onApplied?: () => void
    ) {
        super(app);
        this.manager = manager;
        this.rule = rule;
        this.onApplied = onApplied;
    }

    async onOpen(): Promise<void> {
        this.modalEl.addClass('copypaste-diff-modal-window');
        const { contentEl } = this;
        contentEl.empty();

        const loadingDiv = contentEl.createDiv({ cls: 'copypaste-diff-loading', text: '⏳ Comparing Source and Vault files...' });

        try {
            this.items = await this.manager.compareRuleFiles(this.rule);
            this.isLoading = false;
            loadingDiv.remove();

            if (this.items.length > 0) {
                // Auto-select first modified file, or first file
                const firstModified = this.items.find((i) => i.status === 'modified');
                this.selectedItem = firstModified || this.items[0] || null;
            }

            this.renderLayout();
        } catch (err: any) {
            loadingDiv.setText(`Error comparing files: ${err?.message || err}`);
        }
    }

    onClose(): void {
        this.contentEl.empty();
    }

    private renderLayout(): void {
        const { contentEl } = this;
        contentEl.empty();

        // 1. Top Header Bar
        const header = contentEl.createDiv({ cls: 'copypaste-diff-header' });

        const headerInfo = header.createDiv({ cls: 'copypaste-diff-header-info' });
        headerInfo.createEl('h3', { text: '⚖️ 2-Way Diff & File Sync' });
        headerInfo.createEl('p', {
            cls: 'setting-item-description',
            text: `Source: "${this.rule.targetPath || 'None'}" ⟷ Vault: "${this.rule.targetVaultDir || '/'}"`
        });

        const headerActions = header.createDiv({ cls: 'copypaste-diff-header-actions' });

        const modifiedCount = this.items.filter((i) => i.status === 'modified').length;

        if (modifiedCount > 0) {
            const pushAllVaultBtn = headerActions.createEl('button', {
                cls: 'mod-cta copypaste-diff-btn',
                text: `➔ Push All Modified to Vault (${modifiedCount})`
            });
            pushAllVaultBtn.addEventListener('click', async () => {
                await this.applyBatchModified('vault');
            });

            const pushAllSourceBtn = headerActions.createEl('button', {
                cls: 'copypaste-diff-btn',
                text: `⬅ Push All Modified to Source (${modifiedCount})`
            });
            pushAllSourceBtn.addEventListener('click', async () => {
                await this.applyBatchModified('source');
            });
        }

        // 2. Main Body: Split View (Sidebar + Diff Pane)
        const body = contentEl.createDiv({ cls: 'copypaste-diff-body' });

        // Left Sidebar: File List & Search
        const sidebar = body.createDiv({ cls: 'copypaste-diff-sidebar' });
        this.renderSidebar(sidebar);

        // Right Pane: Diff View
        const diffPane = body.createDiv({ cls: 'copypaste-diff-pane' });
        this.renderDiffPane(diffPane);
    }

    private renderSidebar(container: HTMLElement): void {
        container.empty();

        const searchWrapper = container.createDiv({ cls: 'copypaste-diff-search-wrapper' });
        const searchInput = searchWrapper.createEl('input', {
            type: 'text',
            cls: 'copypaste-diff-search-input',
            value: this.searchQuery,
            attr: { placeholder: 'Filter files...' }
        });
        searchInput.addEventListener('input', () => {
            this.searchQuery = searchInput.value.toLowerCase().trim();
            this.renderFileList(listContainer);
        });

        const listContainer = container.createDiv({ cls: 'copypaste-diff-file-list' });
        this.renderFileList(listContainer);
    }

    private renderFileList(container: HTMLElement): void {
        container.empty();

        const filtered = this.items.filter((item) => {
            if (!this.searchQuery) return true;
            return (
                item.relativePath.toLowerCase().includes(this.searchQuery) ||
                item.fileName.toLowerCase().includes(this.searchQuery)
            );
        });

        if (filtered.length === 0) {
            container.createDiv({
                cls: 'copypaste-diff-empty-list',
                text: this.items.length === 0 ? 'No matching files found between Source and Vault.' : 'No files match search.'
            });
            return;
        }

        filtered.forEach((item) => {
            const isSelected = this.selectedItem?.relativePath === item.relativePath;
            const itemEl = container.createDiv({
                cls: `copypaste-diff-file-item ${isSelected ? 'is-selected' : ''}`
            });

            const titleRow = itemEl.createDiv({ cls: 'copypaste-diff-file-title-row' });
            titleRow.createSpan({ cls: 'copypaste-diff-file-name', text: item.fileName });

            // Status Badge
            const badge = titleRow.createSpan({
                cls: `copypaste-diff-status-badge mod-${item.status}`
            });
            badge.setText(
                item.status === 'modified'
                    ? 'MODIFIED'
                    : item.status === 'only_source'
                    ? 'ONLY SOURCE'
                    : item.status === 'only_vault'
                    ? 'ONLY VAULT'
                    : 'IDENTICAL'
            );

            itemEl.createDiv({ cls: 'copypaste-diff-file-subpath', text: item.relativePath });

            itemEl.addEventListener('click', () => {
                if (this.selectedItem?.relativePath !== item.relativePath) {
                    this.selectedItem = item;
                    this.renderLayout();
                }
            });
        });
    }

    private renderDiffPane(container: HTMLElement): void {
        container.empty();

        if (!this.selectedItem) {
            container.createDiv({
                cls: 'copypaste-diff-placeholder',
                text: 'Select a file from the list to compare.'
            });
            return;
        }

        const item = this.selectedItem;

        // Pane Header
        const paneHeader = container.createDiv({ cls: 'copypaste-diff-pane-header' });
        const titleArea = paneHeader.createDiv({ cls: 'copypaste-diff-pane-title-area' });
        titleArea.createEl('h4', { text: item.relativePath });

        const badge = titleArea.createSpan({ cls: `copypaste-diff-status-badge mod-${item.status}` });
        badge.setText(
            item.status === 'modified'
                ? 'Modified Content'
                : item.status === 'only_source'
                ? 'Only Exists in Source'
                : item.status === 'only_vault'
                ? 'Only Exists in Vault'
                : 'Identical Files'
        );

        // Diff Container
        const diffViewerContainer = container.createDiv({ cls: 'copypaste-diff-content-container' });

        const leftText = this.isSwapped ? (item.vaultContent || '') : (item.sourceContent || '');
        const rightText = this.isSwapped ? (item.sourceContent || '') : (item.vaultContent || '');

        const leftLabel = this.isSwapped ? `Vault (${this.rule.targetVaultDir || 'Vault'})` : `Source (${this.rule.targetPath || 'Disk'})`;
        const rightLabel = this.isSwapped ? `Source (${this.rule.targetPath || 'Disk'})` : `Vault (${this.rule.targetVaultDir || 'Vault'})`;

        const applyRightLabel = this.isSwapped
            ? '⬅ Apply Vault to Source'
            : '➔ Apply Source to Vault';

        const applyLeftLabel = this.isSwapped
            ? '➔ Apply Source to Vault'
            : '⬅ Apply Vault to Source';

        renderDiffViewer(diffViewerContainer, {
            leftText,
            rightText,
            leftLabel,
            rightLabel,
            isSwapped: this.isSwapped,
            applyLeftLabel,
            applyRightLabel,
            onSwap: () => {
                this.isSwapped = !this.isSwapped;
                this.renderDiffPane(container);
            },
            onApplyToRight: async () => {
                if (!this.isSwapped) {
                    await this.manager.applyDiffToFile(item.vaultAbsPath, item.sourceContent || '', true);
                    item.vaultContent = item.sourceContent;
                    item.vaultExists = true;
                    item.status = 'identical';
                    new Notice(`✓ Pushed to Vault: "${item.relativePath}"`);
                } else {
                    await this.manager.applyDiffToFile(item.sourceAbsPath, item.vaultContent || '', false);
                    item.sourceContent = item.vaultContent;
                    item.sourceExists = true;
                    item.status = 'identical';
                    new Notice(`✓ Pushed to Source: "${item.relativePath}"`);
                }
                this.onApplied?.();
                this.renderLayout();
            },
            onApplyToLeft: async () => {
                if (!this.isSwapped) {
                    await this.manager.applyDiffToFile(item.sourceAbsPath, item.vaultContent || '', false);
                    item.sourceContent = item.vaultContent;
                    item.sourceExists = true;
                    item.status = 'identical';
                    new Notice(`✓ Pulled to Source: "${item.relativePath}"`);
                } else {
                    await this.manager.applyDiffToFile(item.vaultAbsPath, item.sourceContent || '', true);
                    item.vaultContent = item.sourceContent;
                    item.vaultExists = true;
                    item.status = 'identical';
                    new Notice(`✓ Pushed to Vault: "${item.relativePath}"`);
                }
                this.onApplied?.();
                this.renderLayout();
            }
        });
    }

    private async applyBatchModified(target: 'vault' | 'source'): Promise<void> {
        const modifiedItems = this.items.filter((i) => i.status === 'modified');
        if (modifiedItems.length === 0) return;

        let successCount = 0;
        for (const item of modifiedItems) {
            try {
                if (target === 'vault') {
                    await this.manager.applyDiffToFile(item.vaultAbsPath, item.sourceContent || '', true);
                    item.vaultContent = item.sourceContent;
                    item.status = 'identical';
                } else {
                    await this.manager.applyDiffToFile(item.sourceAbsPath, item.vaultContent || '', false);
                    item.sourceContent = item.vaultContent;
                    item.status = 'identical';
                }
                successCount++;
            } catch (e) {
                console.error(`Failed to sync item ${item.relativePath}`, e);
            }
        }

        new Notice(
            target === 'vault'
                ? `✓ Pushed ${successCount} modified file(s) to Vault`
                : `✓ Pushed ${successCount} modified file(s) to Source`
        );
        this.onApplied?.();
        this.renderLayout();
    }
}
