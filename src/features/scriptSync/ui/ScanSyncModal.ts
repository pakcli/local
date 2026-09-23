/**
 * ScanSyncModal.ts
 *
 * Interactive Scan & Sync Dashboard Modal with Split Layout:
 *   - Left: Vault Markdown Notes with metadata and selection checkboxes
 *   - Middle: Position/Direction Swap, Sync Action, and Diff Viewers
 *   - Right: External Script Files on Disk with 3 icon-based actions:
 *       1) Open in default external system application
 *       2) Open note in Obsidian editor
 *       3) Copy script content to clipboard
 *   - Filters: All Files | Only Different | Only from Raw Script | Only from Note
 *   - Batch Select All & Sync Selected capabilities
 */
import { App, Modal, Notice, TFile, setIcon } from 'obsidian';
import { SyncManager } from '../SyncManager';
import { FolderSyncSettings, SyncStatusResult } from '../types';
import { extractTargetCodeblock, CodeBlockMatch } from '../markdownParser';
import { renderDiffViewer } from '../diffViewer';
import { getElectron, getNodeChildProcess, PathUtils } from '../../../utils/nodeHelpers';

export type FilterMode = 'all' | 'different' | 'from_raw' | 'from_note';

interface ScannedNoteItem {
    file: TFile;
    language: string;
    code: string;
    syncResult: SyncStatusResult;
    targetBlock?: CodeBlockMatch;
}

export class ScanSyncModal extends Modal {
    private syncManager: SyncManager;
    private getSettings: () => FolderSyncSettings;
    private saveSettings: () => Promise<void>;
    private scannedItems: ScannedNoteItem[] = [];
    private isScanning = false;
    private activeDiffPaths: Set<string> = new Set();
    private diffSwappedPaths: Set<string> = new Set();

    // UI state
    private filterMode: FilterMode = 'different';
    private isSwapped = false; // When true, swaps default sync direction (CLI -> Manager)
    private selectedPaths: Set<string> = new Set();

    constructor(
        app: App,
        syncManager: SyncManager,
        getSettings: () => FolderSyncSettings,
        saveSettings: () => Promise<void>
    ) {
        super(app);
        this.syncManager = syncManager;
        this.getSettings = getSettings;
        this.saveSettings = saveSettings;
    }

    async onOpen(): Promise<void> {
        this.containerEl.addClass('pakcli-scan-modal-window');
        await this.scanAndRender();
    }

    onClose(): void {
        const { contentEl } = this;
        contentEl.empty();
    }

    async scanAndRender(): Promise<void> {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: '⚡ Codeblock Sync Dashboard' });
        contentEl.createEl('p', {
            cls: 'setting-item-description',
            text: 'Split overview of Markdown notes and parallel script files on disk.'
        });

        const settings = this.getSettings();
        if (!settings.cliRootFolder) {
            contentEl.createDiv({
                cls: 'pakcli-pending-empty',
                text: '⚠️ Script Target Folder is not configured yet! Please set it in Settings → PakCLI Suite → Codeblock Sync.'
            });
            return;
        }

        const loadingEl = contentEl.createDiv({ cls: 'pakcli-scan-loading', text: '🔍 Scanning vault notes and script files...' });
        this.isScanning = true;

        this.scannedItems = [];
        this.selectedPaths.clear();

        const allFiles = this.app.vault.getMarkdownFiles();
        const managerRoot = (settings.managerRootFolder || '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');

        for (const file of allFiles) {
            const normPath = file.path.replace(/\\/g, '/');
            if (managerRoot && !normPath.startsWith(managerRoot)) {
                continue;
            }

            try {
                const content = await this.app.vault.read(file);
                const frontmatter = this.syncManager.parseFrontmatter(file, content);
                const extracted = extractTargetCodeblock(
                    content,
                    settings.languageExtensionMap,
                    frontmatter,
                    settings.syncStrategy
                );
                if (extracted && extracted.code.trim()) {
                    const syncResult = await this.syncManager.getSyncStatus(file, extracted.code, extracted.language, frontmatter);
                    this.scannedItems.push({
                        file,
                        language: extracted.language,
                        code: extracted.code,
                        syncResult,
                        targetBlock: extracted
                    });

                    // By default, pre-select items that need synchronization
                    if (syncResult.status !== 'synced') {
                        this.selectedPaths.add(file.path);
                    }
                }
            } catch {
                // Ignore vault read failure
            }
        }

        this.isScanning = false;
        loadingEl.remove();

        this.renderDashboard();
    }

    private getFilteredItems(): ScannedNoteItem[] {
        switch (this.filterMode) {
            case 'different':
                return this.scannedItems.filter(i => i.syncResult.status !== 'synced');
            case 'from_raw':
                return this.scannedItems.filter(i => i.syncResult.status === 'cli_modified' || (Boolean(i.syncResult.cliCode) && i.syncResult.status !== 'synced'));
            case 'from_note':
                return this.scannedItems.filter(i => i.syncResult.status === 'manager_modified' || i.syncResult.status === 'cli_missing' || i.syncResult.status === 'conflict');
            case 'all':
            default:
                return this.scannedItems;
        }
    }

    private renderDashboard(): void {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: '⚡ Codeblock Sync Dashboard' });

        const settings = this.getSettings();
        const targetFolderDisplay = settings.cliRootFolder || '(Not set)';

        const totalCount = this.scannedItems.length;
        const needsSyncCount = this.scannedItems.filter(i => i.syncResult.status !== 'synced').length;
        const syncedCount = totalCount - needsSyncCount;

        // Meta Bar
        const metaBar = contentEl.createDiv({ cls: 'pakcli-scan-meta-bar' });
        metaBar.createSpan({ text: `Target: ${targetFolderDisplay}  •  Total: ${totalCount}  •  Changed: ${needsSyncCount}  •  Synced: ${syncedCount}` });

        const dirTag = metaBar.createSpan({
            cls: 'pakcli-scan-lang-pill',
            text: this.isSwapped ? 'Direction: CLI ➔ Note (Pull)' : 'Direction: Note ➔ CLI (Push)'
        });
        dirTag.style.background = this.isSwapped ? 'var(--color-yellow)' : 'var(--interactive-accent)';
        dirTag.style.color = 'var(--text-on-accent)';

        if (totalCount === 0) {
            contentEl.createDiv({
                cls: 'pakcli-pending-empty',
                text: 'No notes with matching script codeblocks found in the configured folder.'
            });
            return;
        }

        // Toolbar: Radio Filter Buttons + Select All + Swap + Sync All
        const controlsBar = contentEl.createDiv({ cls: 'pakcli-scan-controls-bar' });

        // Left: Radio Filter Group
        const radioGroup = controlsBar.createDiv({ cls: 'pakcli-scan-radio-group' });

        const filters: { id: FilterMode; label: string }[] = [
            { id: 'all', label: 'All Files' },
            { id: 'different', label: `Only Different (${needsSyncCount})` },
            { id: 'from_raw', label: 'Only from Raw Script' },
            { id: 'from_note', label: 'Only from Note' },
        ];

        filters.forEach(f => {
            const labelEl = radioGroup.createEl('label', {
                cls: `pakcli-scan-radio-label ${this.filterMode === f.id ? 'active' : ''}`
            });
            const radio = labelEl.createEl('input', {
                type: 'radio',
                value: f.id
            });
            radio.name = 'pakcli-scan-filter';
            radio.checked = this.filterMode === f.id;
            radio.addEventListener('change', () => {
                this.filterMode = f.id;
                this.renderDashboard();
            });
            labelEl.createSpan({ text: f.label });
        });

        // Right: Actions Group (Select All, Swap, Sync All)
        const actionsGroup = controlsBar.createDiv({ cls: 'pakcli-scan-actions-group' });

        const displayedItems = this.getFilteredItems();
        const isAllSelected = displayedItems.length > 0 && displayedItems.every(i => this.selectedPaths.has(i.file.path));

        // Select All Checkbox
        const selectAllLabel = actionsGroup.createEl('label', { cls: 'pakcli-scan-select-all-label' });
        const selectAllCheckbox = selectAllLabel.createEl('input', { type: 'checkbox' });
        selectAllCheckbox.checked = isAllSelected;
        selectAllCheckbox.addEventListener('change', () => {
            if (selectAllCheckbox.checked) {
                displayedItems.forEach(i => this.selectedPaths.add(i.file.path));
            } else {
                displayedItems.forEach(i => this.selectedPaths.delete(i.file.path));
            }
            this.renderDashboard();
        });
        selectAllLabel.createSpan({ text: 'Select All' });

        // Swap Position / Direction Button
        const swapBtn = actionsGroup.createEl('button', {
            cls: 'pakcli-btn-reset',
            text: this.isSwapped ? '⇄ Swap (Pull)' : '⇄ Swap (Push)'
        });
        swapBtn.setAttribute('title', 'Swap default sync direction between Note ➔ CLI and CLI ➔ Note');
        swapBtn.addEventListener('click', () => {
            this.isSwapped = !this.isSwapped;
            this.renderDashboard();
        });

        // Sync All / Sync Selected Button
        const selectedCount = displayedItems.filter(i => this.selectedPaths.has(i.file.path)).length;
        const syncBtnText = selectedCount > 0 ? `⚡ Sync Selected (${selectedCount})` : `⚡ Sync Visible (${displayedItems.length})`;
        const syncAllBtn = actionsGroup.createEl('button', {
            cls: 'mod-cta',
            text: syncBtnText
        });

        syncAllBtn.addEventListener('click', async () => {
            const targetItems = selectedCount > 0
                ? displayedItems.filter(i => this.selectedPaths.has(i.file.path))
                : displayedItems;

            if (targetItems.length === 0) {
                new Notice('No items selected for sync.');
                return;
            }

            syncAllBtn.setText('⏳ Syncing...');
            syncAllBtn.setAttribute('disabled', 'true');

            let count = 0;
            for (const item of targetItems) {
                // Determine direction based on swap state or natural diff state
                let direction: 'manager_to_cli' | 'cli_to_manager' = this.isSwapped ? 'cli_to_manager' : 'manager_to_cli';
                if (!this.isSwapped && item.syncResult.status === 'cli_modified') {
                    direction = 'cli_to_manager';
                }

                const ok = await this.syncManager.executeSync(
                    item.file,
                    direction,
                    direction === 'manager_to_cli' ? item.code : undefined,
                    item.language
                );
                if (ok) count++;
            }

            new Notice(`✓ Synchronized ${count} file(s).`);
            await this.scanAndRender();
        });

        // Rescan Button
        const rescanBtn = actionsGroup.createEl('button', { text: '🔄' });
        rescanBtn.setAttribute('title', 'Rescan Vault and External Directory');
        rescanBtn.addEventListener('click', async () => {
            await this.scanAndRender();
        });

        // Empty filtered view check
        if (displayedItems.length === 0) {
            const emptyEl = contentEl.createDiv({ cls: 'pakcli-pending-empty' });
            emptyEl.createEl('p', { text: `✨ No items match the "${this.filterMode}" filter.` });
            const showAllBtn = emptyEl.createEl('button', { text: 'Show All Files' });
            showAllBtn.addEventListener('click', () => {
                this.filterMode = 'all';
                this.renderDashboard();
            });
            return;
        }

        // Split Layout Header
        const splitHeader = contentEl.createDiv({ cls: 'pakcli-scan-split-header' });
        splitHeader.createDiv({ cls: 'pakcli-header-col-left', text: 'Vault Markdown Note' });
        splitHeader.createDiv({ cls: 'pakcli-header-col-middle', text: 'Sync Status' });
        splitHeader.createDiv({ cls: 'pakcli-header-col-right', text: 'Raw Script File on Disk' });

        // Split Items List
        const listContainer = contentEl.createDiv({ cls: 'pakcli-scan-list-container' });

        displayedItems.forEach((item) => {
            const isSelected = this.selectedPaths.has(item.file.path);
            const itemCard = listContainer.createDiv({
                cls: `pakcli-scan-item-card ${isSelected ? 'is-selected' : ''}`
            });

            const splitRow = itemCard.createDiv({ cls: 'pakcli-scan-split-row' });

            // ==========================================
            // LEFT COLUMN: Vault Note Details + Checkbox
            // ==========================================
            const colNote = splitRow.createDiv({ cls: 'pakcli-scan-col-note' });

            const rowCheckbox = colNote.createEl('input', {
                type: 'checkbox',
                cls: 'pakcli-row-checkbox'
            });
            rowCheckbox.checked = isSelected;
            rowCheckbox.addEventListener('change', () => {
                if (rowCheckbox.checked) {
                    this.selectedPaths.add(item.file.path);
                    itemCard.addClass('is-selected');
                } else {
                    this.selectedPaths.delete(item.file.path);
                    itemCard.removeClass('is-selected');
                }
                // Update button label
                const newSelectedCount = displayedItems.filter(i => this.selectedPaths.has(i.file.path)).length;
                syncAllBtn.setText(newSelectedCount > 0 ? `⚡ Sync Selected (${newSelectedCount})` : `⚡ Sync Visible (${displayedItems.length})`);
            });

            const noteDetails = colNote.createDiv({ cls: 'pakcli-note-details' });

            const noteTitleRow = noteDetails.createDiv({ cls: 'pakcli-note-title-row' });
            noteTitleRow.createSpan({ cls: 'pakcli-note-title', text: item.file.basename });

            // Language Pill
            noteTitleRow.createSpan({ cls: 'pakcli-scan-lang-pill', text: item.language.toUpperCase() });

            // Codeblock Index & Tag Badge
            const blockIndex = item.syncResult.matchedBlockIndex ?? item.targetBlock?.blockIndex;
            if (blockIndex !== undefined) {
                const tagStr = item.syncResult.matchedBlockTag ? `:${item.syncResult.matchedBlockTag}` : '';
                const blockBadge = noteTitleRow.createSpan({
                    cls: 'pakcli-scan-lang-pill',
                    text: `Block #${blockIndex + 1}${tagStr}`
                });
                blockBadge.style.opacity = '0.85';
            }

            // Note Path
            noteDetails.createDiv({ cls: 'pakcli-note-path', text: item.file.path });

            // ==========================================
            // MIDDLE COLUMN: Status Badge, Swap Indicator, Single Sync & Diff
            // ==========================================
            const colMiddle = splitRow.createDiv({ cls: 'pakcli-scan-col-middle' });

            const statusBadge = colMiddle.createSpan({
                cls: `pakcli-sync-status-badge pakcli-sync-status-${item.syncResult.status}`
            });
            statusBadge.setText(this.getStatusBadgeText(item.syncResult.status));

            // Direction arrow indicator
            let directionArrow = this.isSwapped ? '⬅ Pull' : '➔ Push';
            if (item.syncResult.status === 'synced') {
                directionArrow = '✓ Synced';
            }

            const singleSyncBtn = colMiddle.createEl('button', {
                cls: 'pakcli-middle-sync-btn pakcli-btn-primary',
                text: directionArrow
            });

            singleSyncBtn.addEventListener('click', async () => {
                const direction = this.isSwapped ? 'cli_to_manager' : 'manager_to_cli';
                const ok = await this.syncManager.executeSync(
                    item.file,
                    direction,
                    direction === 'manager_to_cli' ? item.code : undefined,
                    item.language
                );
                if (ok) await this.scanAndRender();
            });

            // Diff button if disk code exists and differs
            if (item.syncResult.cliCode && item.syncResult.status !== 'synced') {
                const isDiffActive = this.activeDiffPaths.has(item.file.path);
                const diffBtn = colMiddle.createEl('button', {
                    cls: `pakcli-middle-sync-btn ${isDiffActive ? 'active' : ''}`,
                    text: isDiffActive ? 'Hide Diff' : 'Diff'
                });
                diffBtn.addEventListener('click', () => {
                    if (this.activeDiffPaths.has(item.file.path)) {
                        this.activeDiffPaths.delete(item.file.path);
                    } else {
                        this.activeDiffPaths.add(item.file.path);
                    }
                    this.renderDashboard();
                });
            }

            // ==========================================
            // RIGHT COLUMN: Script File on Disk + 4 ICON BUTTONS
            // ==========================================
            const colScript = splitRow.createDiv({ cls: 'pakcli-scan-col-script' });

            const scriptDetails = colScript.createDiv({ cls: 'pakcli-script-details' });

            const scriptTitleRow = scriptDetails.createDiv({ cls: 'pakcli-script-title-row' });
            const scriptBasename = item.syncResult.cliPath ? PathUtils.basename(item.syncResult.cliPath) : '(Not mapped)';
            scriptTitleRow.createSpan({ cls: 'pakcli-script-name', text: scriptBasename });

            if (item.syncResult.isFrontmatterOverride) {
                const fmBadge = scriptTitleRow.createSpan({
                    cls: 'pakcli-scan-lang-pill',
                    text: '🏷️ cli_name'
                });
                fmBadge.style.background = 'var(--interactive-accent)';
                fmBadge.style.color = 'var(--text-on-accent)';
            }

            scriptDetails.createDiv({ cls: 'pakcli-script-path', text: item.syncResult.cliPath || '(None)' });

            // Action Icons Container (Right side)
            const scriptActions = colScript.createDiv({ cls: 'pakcli-script-actions' });

            // 1. Open in Default External Application Button
            const openDefaultBtn = scriptActions.createEl('button', {
                cls: 'pakcli-icon-btn',
                attr: { 'aria-label': 'Open script in default system application' }
            });
            setIcon(openDefaultBtn, 'external-link');
            openDefaultBtn.setAttribute('title', 'Open script in default system application');
            openDefaultBtn.addEventListener('click', () => {
                if (item.syncResult.cliPath) {
                    this.openInDefaultApp(item.syncResult.cliPath);
                } else {
                    new Notice('Script file has not been created on disk yet.');
                }
            });

            // 2. Open Note in Obsidian Editor Button
            const openNoteBtn = scriptActions.createEl('button', {
                cls: 'pakcli-icon-btn',
                attr: { 'aria-label': 'Open markdown note in Obsidian' }
            });
            setIcon(openNoteBtn, 'file-text');
            openNoteBtn.setAttribute('title', 'Open markdown note in Obsidian');
            openNoteBtn.addEventListener('click', () => {
                void this.app.workspace.openLinkText(item.file.path, '', false);
                new Notice(`Opened ${item.file.basename}`);
            });

            // 3. Copy Script to Clipboard Button
            const copyBtn = scriptActions.createEl('button', {
                cls: 'pakcli-icon-btn',
                attr: { 'aria-label': 'Copy script content to clipboard' }
            });
            setIcon(copyBtn, 'copy');
            copyBtn.setAttribute('title', 'Copy script content to clipboard');
            copyBtn.addEventListener('click', () => {
                const codeToCopy = item.syncResult.cliCode || item.code;
                navigator.clipboard.writeText(codeToCopy);
                setIcon(copyBtn, 'check');
                new Notice(`✓ Copied ${scriptBasename}`);
                setTimeout(() => {
                    setIcon(copyBtn, 'copy');
                }, 1500);
            });

            // 4. Diff Current Changes Button
            const isDiffActive = this.activeDiffPaths.has(item.file.path);
            const diffIconBtn = scriptActions.createEl('button', {
                cls: `pakcli-icon-btn ${isDiffActive ? 'is-active' : ''}`,
                attr: { 'aria-label': 'Diff current changes' }
            });
            setIcon(diffIconBtn, 'git-compare');
            diffIconBtn.setAttribute('title', isDiffActive ? 'Hide diff' : 'Diff current changes');
            diffIconBtn.addEventListener('click', () => {
                if (this.activeDiffPaths.has(item.file.path)) {
                    this.activeDiffPaths.delete(item.file.path);
                } else {
                    this.activeDiffPaths.add(item.file.path);
                }
                this.renderDashboard();
            });

            // Diff Viewer Accordion
            if (this.activeDiffPaths.has(item.file.path)) {
                const diffEl = itemCard.createDiv({ cls: 'pakcli-scan-diff-container' });
                const isDiffSwapped = this.diffSwappedPaths.has(item.file.path);
                const noteCode = item.code;
                const cliCode = item.syncResult.cliCode || '';

                const leftText = isDiffSwapped ? cliCode : noteCode;
                const rightText = isDiffSwapped ? noteCode : cliCode;

                const noteLabel = `Note: ${item.file.basename} (${item.language})`;
                const scriptLabel = `Script: ${scriptBasename}`;

                const leftLabel = isDiffSwapped ? scriptLabel : noteLabel;
                const rightLabel = isDiffSwapped ? noteLabel : scriptLabel;

                const applyLeftLabel = isDiffSwapped ? '⬅ Apply to Script' : '⬅ Apply to Note';
                const applyRightLabel = isDiffSwapped ? '➔ Apply to Note' : '➔ Apply to Script';

                renderDiffViewer(diffEl, {
                    leftText,
                    rightText,
                    leftLabel,
                    rightLabel,
                    isSwapped: isDiffSwapped,
                    applyLeftLabel,
                    applyRightLabel,
                    onSwap: () => {
                        if (this.diffSwappedPaths.has(item.file.path)) {
                            this.diffSwappedPaths.delete(item.file.path);
                        } else {
                            this.diffSwappedPaths.add(item.file.path);
                        }
                        this.renderDashboard();
                    },
                    onApplyToLeft: async () => {
                        // Apply right side content into left target:
                        // If not swapped: Left = Note, Right = Script -> update Note from Script (cli_to_manager)
                        // If swapped: Left = Script, Right = Note -> update Script from Note (manager_to_cli)
                        const direction = isDiffSwapped ? 'manager_to_cli' : 'cli_to_manager';
                        const targetName = isDiffSwapped ? scriptBasename : item.file.basename;
                        new Notice(`Applying changes to ${targetName}...`);
                        const ok = await this.syncManager.executeSync(
                            item.file,
                            direction,
                            direction === 'manager_to_cli' ? item.code : undefined,
                            item.language
                        );
                        if (ok) {
                            new Notice(`✓ Successfully applied to ${targetName}`);
                            await this.scanAndRender();
                        }
                    },
                    onApplyToRight: async () => {
                        // Apply left side content into right target:
                        // If not swapped: Left = Note, Right = Script -> update Script from Note (manager_to_cli)
                        // If swapped: Left = Script, Right = Note -> update Note from Script (cli_to_manager)
                        const direction = isDiffSwapped ? 'cli_to_manager' : 'manager_to_cli';
                        const targetName = isDiffSwapped ? item.file.basename : scriptBasename;
                        new Notice(`Applying changes to ${targetName}...`);
                        const ok = await this.syncManager.executeSync(
                            item.file,
                            direction,
                            direction === 'manager_to_cli' ? item.code : undefined,
                            item.language
                        );
                        if (ok) {
                            new Notice(`✓ Successfully applied to ${targetName}`);
                            await this.scanAndRender();
                        }
                    }
                });
            }
        });
    }

    private openInDefaultApp(filePath: string): void {
        try {
            const electron = getElectron();
            if (electron?.shell?.openPath) {
                electron.shell.openPath(filePath);
                return;
            }
            const cp = getNodeChildProcess();
            if (cp) {
                if (process.platform === 'win32') {
                    cp.exec(`start "" "${filePath}"`);
                } else if (process.platform === 'darwin') {
                    cp.exec(`open "${filePath}"`);
                } else {
                    cp.exec(`xdg-open "${filePath}"`);
                }
            }
        } catch (err: any) {
            new Notice(`Unable to open file: ${err?.message || String(err)}`);
        }
    }

    private getStatusBadgeText(status?: string): string {
        switch (status) {
            case 'synced': return '✓ Synced';
            case 'manager_modified': return '⚡ Note Modified';
            case 'cli_modified': return '📥 Script Modified';
            case 'conflict': return '⚠️ Conflict';
            case 'cli_missing': return '📄 Not Created';
            case 'not_mapped': return '⚙️ Unmapped';
            default: return '● Pending';
        }
    }
}
