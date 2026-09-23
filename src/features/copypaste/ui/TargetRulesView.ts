/**
 * TargetRulesView.ts
 *
 * Interactive Rule Builder Dashboard for GetCopy Target Filter Rules.
 * Supports:
 * - Target Path selection with browse picker
 * - Target Path Include dropdown (all | contains | exact | exact_case) + pattern
 * - Filename dropdown (all | contains | exact | exact_case) + pattern
 * - File Format multi-select checklist (md, json, csv, js, db, docs, ...)
 * - Active condition pill badges with dismiss (x)
 * - 🔄 Rescan, 📋 Duplicate, 🗑️ Delete Rule
 * - Matched files preview accordion
 */
import { App, Notice, normalizePath, setIcon } from 'obsidian';
import { CopyPasteManager } from '../CopyPasteManager';
import { FilterMatchMode, CopyPasteSettings, TargetFilterRule } from '../types';
import { DEFAULT_FORMAT_OPTIONS, scanDirectoryForRule } from '../ruleMatcher';
import { browseFolder } from '../../symlink/dialog';
import { VaultFolderSuggest, FolderPickerModal } from '../../scriptSync/ui/FolderPicker';
import { getNodeFs, PathUtils } from '../../../utils/nodeHelpers';

export class TargetRulesView {
    private app: App;
    private manager: CopyPasteManager;
    private getSettings: () => CopyPasteSettings;
    private saveSettings: () => Promise<void>;
    private containerEl: HTMLElement;
    private expandedPreviewIds: Set<string> = new Set();
    private activeFormatPopupEl: HTMLElement | null = null;
    private outsideClickListener: ((e: MouseEvent) => void) | null = null;
    private activePopupDoc: Document | null = null;
    private scanningRuleIds: Set<string> = new Set();
    private viewMode: 'card' | 'table' = 'card';

    constructor(
        app: App,
        manager: CopyPasteManager,
        getSettings: () => CopyPasteSettings,
        saveSettings: () => Promise<void>,
        containerEl: HTMLElement
    ) {
        this.app = app;
        this.manager = manager;
        this.getSettings = getSettings;
        this.saveSettings = saveSettings;
        this.containerEl = containerEl;
    }

    render(): void {
        this.closeFormatPopup();
        this.containerEl.empty();
        this.containerEl.addClass('target-rules-dashboard');

        const settings = this.getSettings();
        if (!settings.targetRules) {
            settings.targetRules = [];
        }
        const rules = settings.targetRules;
        this.viewMode = settings.targetRulesViewMode || 'card';

        // Top Toolbar
        const topBar = this.containerEl.createDiv({ cls: 'target-rules-top-bar' });

        const infoText = topBar.createDiv({ cls: 'target-rules-info' });
        infoText.createEl('h3', { text: '🎯 Target Vault Rules' });
        infoText.createEl('p', {
            cls: 'setting-item-description',
            text: 'Define granular directory scanning rules with local source, vault destination, and multi-condition filters.'
        });

        // View Mode Switcher (Card View vs Table View)
        const viewSwitcher = topBar.createDiv({ cls: 'target-rules-view-switcher' });
        const cardViewBtn = viewSwitcher.createEl('button', {
            cls: `target-rules-view-tab ${this.viewMode === 'card' ? 'is-active' : ''}`,
            text: '🗂️ Card View'
        });
        cardViewBtn.onclick = async () => {
            if (this.viewMode !== 'card') {
                this.viewMode = 'card';
                settings.targetRulesViewMode = 'card';
                await this.saveSettings();
                this.render();
            }
        };

        const tableViewBtn = viewSwitcher.createEl('button', {
            cls: `target-rules-view-tab ${this.viewMode === 'table' ? 'is-active' : ''}`,
            text: '📊 Table View'
        });
        tableViewBtn.onclick = async () => {
            if (this.viewMode !== 'table') {
                this.viewMode = 'table';
                settings.targetRulesViewMode = 'table';
                await this.saveSettings();
                this.render();
            }
        };

        const topActions = topBar.createDiv({ cls: 'target-rules-top-actions' });

        const addRuleBtn = topActions.createEl('button', {
            cls: 'mod-cta target-rules-add-btn',
            text: '+ Add Rule'
        });
        addRuleBtn.onclick = async () => {
            await this.addNewRule();
        };

        if (rules.length > 0) {
            const rescanAllBtn = topActions.createEl('button', {
                cls: 'target-rules-rescan-all-btn',
                text: '🔄 Rescan All Rules'
            });
            rescanAllBtn.onclick = async () => {
                await this.rescanAllRules();
            };
        }

        // Empty state
        if (rules.length === 0) {
            const emptyEl = this.containerEl.createDiv({ cls: 'target-rules-empty-state' });
            emptyEl.createDiv({ cls: 'target-rules-empty-icon', text: '🎯' });
            emptyEl.createDiv({
                cls: 'target-rules-empty-msg',
                text: 'No target filter rules configured yet. Click "+ Add Rule" to create one.'
            });
            const emptyAddBtn = emptyEl.createEl('button', {
                cls: 'mod-cta',
                text: '+ Create First Filter Rule'
            });
            emptyAddBtn.onclick = async () => {
                await this.addNewRule();
            };
            return;
        }

        // Render Card View or Table View
        if (this.viewMode === 'card') {
            const listContainer = this.containerEl.createDiv({ cls: 'target-rules-list' });
            rules.forEach((rule, index) => {
                this.renderRuleCard(listContainer, rule, index);
            });
        } else {
            this.renderRulesTable(this.containerEl, rules);
        }
    }

    private renderRuleCard(container: HTMLElement, rule: TargetFilterRule, index: number): void {
        const isScanning = this.scanningRuleIds.has(rule.id);
        const isExpanded = this.expandedPreviewIds.has(rule.id);

        const card = container.createDiv({
            cls: `target-rule-card ${isScanning ? 'is-scanning' : ''}`
        });

        // ==========================================
        // 1. Target Path Row
        // ==========================================
        const pathRow = card.createDiv({ cls: 'target-rule-path-row' });

        const pathHeader = pathRow.createDiv({ cls: 'target-rule-field-header' });
        pathHeader.createSpan({ cls: 'target-rule-field-label', text: `Rule #${index + 1} Target Path:` });

        const pathInputWrapper = pathRow.createDiv({ cls: 'target-rule-path-input-wrapper' });

        const pathInput = pathInputWrapper.createEl('input', {
            type: 'text',
            cls: 'target-rule-text-input',
            value: rule.targetPath || '',
            attr: { placeholder: 'e.g. D:/projects/my-source-folder or /path/to/directory' }
        });
        pathInput.addEventListener('change', async () => {
            rule.targetPath = pathInput.value.trim();
            await this.saveSettings();
            this.render();
        });

        const browseBtn = pathInputWrapper.createEl('button', {
            cls: 'target-rule-browse-btn',
            text: 'Browse'
        });
        setIcon(browseBtn, 'folder');
        browseBtn.addEventListener('click', async () => {
            const picked = await browseFolder(rule.targetPath || '');
            if (picked) {
                rule.targetPath = picked;
                await this.saveSettings();
                this.render();
            }
        });

        // ==========================================
        // 2. Target in Vault Directory Row (Destination inside Vault)
        // ==========================================
        const vaultRow = card.createDiv({ cls: 'target-rule-path-row target-rule-vault-row' });

        const vaultHeader = vaultRow.createDiv({ cls: 'target-rule-field-header' });
        vaultHeader.createSpan({ cls: 'target-rule-field-label', text: 'Target in Vault Directory (Destination):' });

        const vaultInputWrapper = vaultRow.createDiv({ cls: 'target-rule-path-input-wrapper' });

        const vaultInput = vaultInputWrapper.createEl('input', {
            type: 'text',
            cls: 'target-rule-text-input',
            value: rule.targetVaultDir || '',
            attr: { placeholder: 'e.g. Briefs, Notes/CLI, or / (Vault Root)' }
        });

        // Attach autocomplete suggestions from existing vault folders
        new VaultFolderSuggest(this.app, vaultInput);

        vaultInput.addEventListener('change', async () => {
            rule.targetVaultDir = vaultInput.value.trim();
            await this.saveSettings();
            this.render();
        });

        const vaultPickerBtn = vaultInputWrapper.createEl('button', {
            cls: 'target-rule-browse-btn',
            text: 'Vault Folder'
        });
        setIcon(vaultPickerBtn, 'folder-symlink');
        vaultPickerBtn.addEventListener('click', () => {
            new FolderPickerModal(this.app, async (selectedFolder) => {
                rule.targetVaultDir = selectedFolder;
                await this.saveSettings();
                this.render();
            }).open();
        });

        // ==========================================
        // 3. Filter Dropdown Controls (Path, Filename, Format)
        // ==========================================
        const filtersGrid = card.createDiv({ cls: 'target-rule-filters-grid' });

        // --- Filter 1: Target Path Include ---
        const pathFilterCol = filtersGrid.createDiv({ cls: 'target-rule-filter-col' });
        pathFilterCol.createDiv({ cls: 'target-rule-sublabel', text: 'Target Path Include:' });

        const pathSelectGroup = pathFilterCol.createDiv({ cls: 'target-rule-input-group' });
        const pathModeSelect = pathSelectGroup.createEl('select', { cls: 'target-rule-select' });

        const pathOptions: { id: FilterMatchMode; label: string }[] = [
            { id: 'all', label: 'All' },
            { id: 'contains', label: 'Contains' },
            { id: 'exact', label: 'Path Exact' },
            { id: 'exact_case', label: 'Exact Case Letter' }
        ];
        pathOptions.forEach((opt) => {
            const el = pathModeSelect.createEl('option', { value: opt.id, text: opt.label });
            if (rule.pathIncludeMode === opt.id) el.selected = true;
        });

        const pathPatternInput = pathSelectGroup.createEl('input', {
            type: 'text',
            cls: 'target-rule-pattern-input',
            value: rule.pathIncludePattern || '',
            attr: { placeholder: 'Include pattern...' }
        });
        if (rule.pathIncludeMode === 'all') {
            pathPatternInput.addClass('is-hidden');
        }

        pathModeSelect.addEventListener('change', async () => {
            rule.pathIncludeMode = pathModeSelect.value as FilterMatchMode;
            if (rule.pathIncludeMode === 'all') {
                pathPatternInput.addClass('is-hidden');
            } else {
                pathPatternInput.removeClass('is-hidden');
            }
            await this.saveSettings();
            this.render();
        });

        pathPatternInput.addEventListener('change', async () => {
            rule.pathIncludePattern = pathPatternInput.value.trim();
            await this.saveSettings();
            this.render();
        });

        // --- Filter 2: Filename ---
        const filenameCol = filtersGrid.createDiv({ cls: 'target-rule-filter-col' });
        filenameCol.createDiv({ cls: 'target-rule-sublabel', text: 'Filename Filter:' });

        const filenameGroup = filenameCol.createDiv({ cls: 'target-rule-input-group' });
        const filenameSelect = filenameGroup.createEl('select', { cls: 'target-rule-select' });

        const filenameOptions: { id: FilterMatchMode; label: string }[] = [
            { id: 'all', label: 'All' },
            { id: 'contains', label: 'Contains' },
            { id: 'exact', label: 'Name Exact' },
            { id: 'exact_case', label: 'Exact Case Letter' }
        ];
        filenameOptions.forEach((opt) => {
            const el = filenameSelect.createEl('option', { value: opt.id, text: opt.label });
            if (rule.filenameMode === opt.id) el.selected = true;
        });

        const filenamePatternInput = filenameGroup.createEl('input', {
            type: 'text',
            cls: 'target-rule-pattern-input',
            value: rule.filenamePattern || '',
            attr: { placeholder: 'Filename pattern...' }
        });
        if (rule.filenameMode === 'all') {
            filenamePatternInput.addClass('is-hidden');
        }

        filenameSelect.addEventListener('change', async () => {
            rule.filenameMode = filenameSelect.value as FilterMatchMode;
            if (rule.filenameMode === 'all') {
                filenamePatternInput.addClass('is-hidden');
            } else {
                filenamePatternInput.removeClass('is-hidden');
            }
            await this.saveSettings();
            this.render();
        });

        filenamePatternInput.addEventListener('change', async () => {
            rule.filenamePattern = filenamePatternInput.value.trim();
            await this.saveSettings();
            this.render();
        });

        // --- Filter 3: File Format Checklist Dropdown ---
        const formatCol = filtersGrid.createDiv({ cls: 'target-rule-filter-col' });
        formatCol.createDiv({ cls: 'target-rule-sublabel', text: 'File Format Checklist:' });

        const formatDropdownWrapper = formatCol.createDiv({ cls: 'target-rule-format-wrapper' });

        const formatSummaryText = this.getFormatSummaryText(rule.formats);
        const formatTriggerBtn = formatDropdownWrapper.createEl('button', {
            cls: 'target-rule-format-trigger',
            text: `${formatSummaryText} ▾`
        });

        formatTriggerBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.openFormatPopup(formatTriggerBtn, rule);
        });

        // ==========================================
        // 4. Active Rule Condition Badges / Pills
        // ==========================================
        const badgesRow = card.createDiv({ cls: 'target-rule-badges-row' });

        // Vault Destination Badge
        if (rule.targetVaultDir) {
            const badge = badgesRow.createDiv({ cls: 'target-rule-condition-badge mod-vault' });
            badge.createSpan({ text: `VAULT: "${rule.targetVaultDir}"` });
            const dismiss = badge.createSpan({ cls: 'target-rule-badge-dismiss', text: '✕' });
            dismiss.addEventListener('click', async () => {
                rule.targetVaultDir = '';
                await this.saveSettings();
                this.render();
            });
        }

        // Path Badge
        if (rule.pathIncludeMode !== 'all' && rule.pathIncludePattern) {
            const badge = badgesRow.createDiv({ cls: 'target-rule-condition-badge' });
            badge.createSpan({ text: `PATH ${rule.pathIncludeMode.toUpperCase()}: "${rule.pathIncludePattern}"` });
            const dismiss = badge.createSpan({ cls: 'target-rule-badge-dismiss', text: '✕' });
            dismiss.addEventListener('click', async () => {
                rule.pathIncludeMode = 'all';
                rule.pathIncludePattern = '';
                await this.saveSettings();
                this.render();
            });
        }

        // Filename Badge
        if (rule.filenameMode !== 'all' && rule.filenamePattern) {
            const badge = badgesRow.createDiv({ cls: 'target-rule-condition-badge' });
            badge.createSpan({ text: `FILE ${rule.filenameMode.toUpperCase()}: "${rule.filenamePattern}"` });
            const dismiss = badge.createSpan({ cls: 'target-rule-badge-dismiss', text: '✕' });
            dismiss.addEventListener('click', async () => {
                rule.filenameMode = 'all';
                rule.filenamePattern = '';
                await this.saveSettings();
                this.render();
            });
        }

        // Format Badge
        if (rule.formats && rule.formats.length > 0) {
            const badge = badgesRow.createDiv({ cls: 'target-rule-condition-badge' });
            badge.createSpan({ text: `FORMATS: ${rule.formats.join(', ')}` });
            const dismiss = badge.createSpan({ cls: 'target-rule-badge-dismiss', text: '✕' });
            dismiss.addEventListener('click', async () => {
                rule.formats = [];
                await this.saveSettings();
                this.render();
            });
        }

        // ==========================================
        // 5. Action Buttons Row (Rescan, Copy to Vault, Duplicate, Delete)
        // ==========================================
        const actionsRow = card.createDiv({ cls: 'target-rule-actions-row' });

        // Left side: Rescan + Match Result Badge + Copy to Vault
        const leftActions = actionsRow.createDiv({ cls: 'target-rule-actions-left' });

        const rescanBtn = leftActions.createEl('button', {
            cls: 'target-rule-btn-rescan mod-cta',
            text: isScanning ? '⏳ Scanning...' : '🔄 Rescan'
        });
        rescanBtn.disabled = isScanning;
        rescanBtn.addEventListener('click', async () => {
            await this.rescanSingleRule(rule);
        });

        // Match count indicator (Clickable to toggle preview)
        if (rule.lastMatchedCount !== undefined) {
            const countBadge = leftActions.createDiv({
                cls: `target-rule-count-badge ${rule.lastMatchedCount > 0 ? 'has-matches' : 'no-matches'}`
            });
            countBadge.setText(
                rule.lastMatchedCount > 0
                    ? `✓ ${rule.lastMatchedCount} files matched (${isExpanded ? 'Hide' : 'View'})`
                    : '0 files matched'
            );
            if (rule.lastMatchedCount > 0) {
                countBadge.addEventListener('click', () => {
                    if (this.expandedPreviewIds.has(rule.id)) {
                        this.expandedPreviewIds.delete(rule.id);
                    } else {
                        this.expandedPreviewIds.add(rule.id);
                    }
                    this.render();
                });
            }
        }

        // Copy to Vault button (if targetVaultDir and matches exist)
        if (rule.targetVaultDir && rule.lastMatchedFiles && rule.lastMatchedFiles.length > 0) {
            const copyVaultBtn = leftActions.createEl('button', {
                cls: 'target-rule-btn-copy-vault mod-cta',
                text: '📥 Copy to Vault'
            });
            copyVaultBtn.addEventListener('click', async () => {
                await this.copyMatchedFilesToVault(rule);
            });
        }

        // Right side: Duplicate & Delete
        const rightActions = actionsRow.createDiv({ cls: 'target-rule-actions-right' });

        const duplicateBtn = rightActions.createEl('button', {
            cls: 'target-rule-btn-duplicate',
            text: '📋 Duplicate'
        });
        duplicateBtn.addEventListener('click', async () => {
            await this.duplicateRule(rule, index);
        });

        const deleteBtn = rightActions.createEl('button', {
            cls: 'target-rule-btn-delete mod-warning',
            text: '🗑️ Delete'
        });
        deleteBtn.addEventListener('click', async () => {
            await this.deleteRule(rule.id);
        });

        // ==========================================
        // 6. Matched Files Preview Accordion
        // ==========================================
        if (isExpanded && rule.lastMatchedFiles && rule.lastMatchedFiles.length > 0) {
            const previewEl = card.createDiv({ cls: 'target-rule-preview-container' });

            const previewHeader = previewEl.createDiv({ cls: 'target-rule-preview-header' });
            previewHeader.createSpan({ text: `Matched Files (${rule.lastMatchedFiles.length}):` });

            const copyAllBtn = previewHeader.createEl('button', {
                cls: 'target-rule-mini-btn mod-cta',
                text: '📋 Copy All Paths'
            });
            copyAllBtn.addEventListener('click', () => {
                const text = (rule.lastMatchedFiles || []).join('\n');
                navigator.clipboard.writeText(text);
                new Notice(`✓ Copied ${rule.lastMatchedFiles?.length} file paths to clipboard`);
            });

            if (rule.targetVaultDir) {
                const copyAllVaultBtn = previewHeader.createEl('button', {
                    cls: 'target-rule-mini-btn mod-cta',
                    text: `📥 Copy to Vault (${rule.targetVaultDir})`
                });
                copyAllVaultBtn.addEventListener('click', async () => {
                    await this.copyMatchedFilesToVault(rule);
                });
            }

            const previewList = previewEl.createDiv({ cls: 'target-rule-preview-list' });

            rule.lastMatchedFiles.forEach((fp) => {
                const itemEl = previewList.createDiv({ cls: 'target-rule-preview-item' });
                itemEl.createSpan({ cls: 'target-rule-file-path', text: fp });

                const copyItemBtn = itemEl.createEl('button', {
                    cls: 'target-rule-mini-btn',
                    attr: { title: 'Copy file path' }
                });
                setIcon(copyItemBtn, 'copy');
                copyItemBtn.addEventListener('click', () => {
                    navigator.clipboard.writeText(fp);
                    new Notice('✓ Copied file path to clipboard');
                });
            });
        }
    }

    private renderRulesTable(container: HTMLElement, rules: TargetFilterRule[]): void {
        const tableWrapper = container.createDiv({ cls: 'target-rules-table-wrapper' });
        const table = tableWrapper.createEl('table', { cls: 'target-rules-table' });

        const thead = table.createEl('thead');
        const headerRow = thead.createEl('tr');
        headerRow.createEl('th', { text: '#', cls: 'col-idx' });
        headerRow.createEl('th', { text: 'Source Target Path', cls: 'col-source' });
        headerRow.createEl('th', { text: 'Vault Destination', cls: 'col-vault' });
        headerRow.createEl('th', { text: 'Path Filter', cls: 'col-filter col-filter-path' });
        headerRow.createEl('th', { text: 'Filename Filter', cls: 'col-filter col-filter-file' });
        headerRow.createEl('th', { text: 'Formats', cls: 'col-formats' });
        headerRow.createEl('th', { text: 'Matches', cls: 'col-matches' });
        headerRow.createEl('th', { text: 'Actions', cls: 'col-actions' });

        const tbody = table.createEl('tbody');

        rules.forEach((rule, index) => {
            this.renderTableRow(tbody, rule, index);
        });
    }

    private renderTableRow(tbody: HTMLElement, rule: TargetFilterRule, index: number): void {
        const isScanning = this.scanningRuleIds.has(rule.id);
        const isExpanded = this.expandedPreviewIds.has(rule.id);

        const row = tbody.createEl('tr', { cls: `target-rule-table-row ${isScanning ? 'is-scanning' : ''}` });

        // 1. #
        row.createEl('td', { text: `${index + 1}`, cls: 'cell-idx' });

        // 2. Source Target Path
        const sourceCell = row.createEl('td', { cls: 'cell-source' });
        const sourceWrapper = sourceCell.createDiv({ cls: 'target-rule-table-input-cell' });
        const sourceInput = sourceWrapper.createEl('input', {
            type: 'text',
            cls: 'target-rule-table-input',
            value: rule.targetPath || '',
            attr: { placeholder: 'Source folder path...' }
        });
        sourceInput.addEventListener('change', async () => {
            rule.targetPath = sourceInput.value.trim();
            await this.saveSettings();
            this.render();
        });
        const browseBtn = sourceWrapper.createEl('button', {
            cls: 'target-rule-mini-btn',
            attr: { title: 'Browse folder' }
        });
        setIcon(browseBtn, 'folder');
        browseBtn.addEventListener('click', async () => {
            const picked = await browseFolder(rule.targetPath || '');
            if (picked) {
                rule.targetPath = picked;
                await this.saveSettings();
                this.render();
            }
        });

        // 3. Vault Destination
        const vaultCell = row.createEl('td', { cls: 'cell-vault' });
        const vaultWrapper = vaultCell.createDiv({ cls: 'target-rule-table-input-cell' });
        const vaultInput = vaultWrapper.createEl('input', {
            type: 'text',
            cls: 'target-rule-table-input',
            value: rule.targetVaultDir || '',
            attr: { placeholder: 'Vault folder destination...' }
        });
        new VaultFolderSuggest(this.app, vaultInput);
        vaultInput.addEventListener('change', async () => {
            rule.targetVaultDir = vaultInput.value.trim();
            await this.saveSettings();
            this.render();
        });
        const vaultFolderBtn = vaultWrapper.createEl('button', {
            cls: 'target-rule-mini-btn',
            attr: { title: 'Pick Vault Folder' }
        });
        setIcon(vaultFolderBtn, 'folder-symlink');
        vaultFolderBtn.addEventListener('click', () => {
            new FolderPickerModal(this.app, async (selectedFolder) => {
                rule.targetVaultDir = selectedFolder;
                await this.saveSettings();
                this.render();
            }).open();
        });

        // 4. Path Filter
        const pathFilterCell = row.createEl('td', { cls: 'cell-filter cell-filter-path' });
        const pathGroup = pathFilterCell.createDiv({ cls: 'target-rule-table-filter-group' });
        const pathSelect = pathGroup.createEl('select', { cls: 'target-rule-table-select' });
        const matchOptions: { id: FilterMatchMode; label: string }[] = [
            { id: 'all', label: 'All' },
            { id: 'contains', label: 'Contains' },
            { id: 'exact', label: 'Exact' },
            { id: 'exact_case', label: 'Exact Case' }
        ];
        matchOptions.forEach((opt) => {
            const optEl = pathSelect.createEl('option', { value: opt.id, text: opt.label });
            if (rule.pathIncludeMode === opt.id) optEl.selected = true;
        });
        const pathInput = pathGroup.createEl('input', {
            type: 'text',
            cls: 'target-rule-table-pattern-input',
            value: rule.pathIncludePattern || '',
            attr: { placeholder: 'Pattern...' }
        });
        if (rule.pathIncludeMode === 'all') pathInput.addClass('is-hidden');
        pathSelect.addEventListener('change', async () => {
            rule.pathIncludeMode = pathSelect.value as FilterMatchMode;
            await this.saveSettings();
            this.render();
        });
        pathInput.addEventListener('change', async () => {
            rule.pathIncludePattern = pathInput.value.trim();
            await this.saveSettings();
            this.render();
        });

        // 5. Filename Filter
        const filenameCell = row.createEl('td', { cls: 'cell-filter cell-filter-file' });
        const fileGroup = filenameCell.createDiv({ cls: 'target-rule-table-filter-group' });
        const fileSelect = fileGroup.createEl('select', { cls: 'target-rule-table-select' });
        matchOptions.forEach((opt) => {
            const optEl = fileSelect.createEl('option', { value: opt.id, text: opt.label });
            if (rule.filenameMode === opt.id) optEl.selected = true;
        });
        const fileInput = fileGroup.createEl('input', {
            type: 'text',
            cls: 'target-rule-table-pattern-input',
            value: rule.filenamePattern || '',
            attr: { placeholder: 'Filename...' }
        });
        if (rule.filenameMode === 'all') fileInput.addClass('is-hidden');
        fileSelect.addEventListener('change', async () => {
            rule.filenameMode = fileSelect.value as FilterMatchMode;
            await this.saveSettings();
            this.render();
        });
        fileInput.addEventListener('change', async () => {
            rule.filenamePattern = fileInput.value.trim();
            await this.saveSettings();
            this.render();
        });

        // 6. Formats
        const formatsCell = row.createEl('td', { cls: 'cell-formats' });
        const formatWrapper = formatsCell.createDiv({ cls: 'target-rule-format-wrapper' });
        const formatSummary = this.getFormatSummaryText(rule.formats);
        const formatTriggerBtn = formatWrapper.createEl('button', {
            cls: 'target-rule-table-format-trigger',
            text: `${formatSummary} ▾`
        });
        formatTriggerBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.openFormatPopup(formatTriggerBtn, rule);
        });

        // 7. Matches
        const matchesCell = row.createEl('td', { cls: 'cell-matches' });
        if (rule.lastMatchedCount !== undefined) {
            const countBadge = matchesCell.createDiv({
                cls: `target-rule-count-badge ${rule.lastMatchedCount > 0 ? 'has-matches' : 'no-matches'}`
            });
            countBadge.setText(
                rule.lastMatchedCount > 0
                    ? `✓ ${rule.lastMatchedCount} (${isExpanded ? 'Hide' : 'View'})`
                    : '0'
            );
            if (rule.lastMatchedCount > 0) {
                countBadge.addEventListener('click', () => {
                    if (this.expandedPreviewIds.has(rule.id)) {
                        this.expandedPreviewIds.delete(rule.id);
                    } else {
                        this.expandedPreviewIds.add(rule.id);
                    }
                    this.render();
                });
            }
        } else {
            matchesCell.createSpan({ text: '-', cls: 'text-muted' });
        }

        // 8. Actions
        const actionsCell = row.createEl('td', { cls: 'cell-actions' });
        const actionGroup = actionsCell.createDiv({ cls: 'target-rule-table-actions-group' });

        const rescanBtn = actionGroup.createEl('button', {
            cls: 'target-rule-mini-btn mod-cta',
            attr: { title: 'Rescan rule' }
        });
        setIcon(rescanBtn, 'sync');
        rescanBtn.addEventListener('click', async () => {
            await this.rescanSingleRule(rule);
        });

        if (rule.targetVaultDir && rule.lastMatchedFiles && rule.lastMatchedFiles.length > 0) {
            const copyVaultBtn = actionGroup.createEl('button', {
                cls: 'target-rule-mini-btn mod-cta',
                attr: { title: `Copy to Vault (${rule.targetVaultDir})` }
            });
            setIcon(copyVaultBtn, 'folder-down');
            copyVaultBtn.addEventListener('click', async () => {
                await this.copyMatchedFilesToVault(rule);
            });
        }

        const duplicateBtn = actionGroup.createEl('button', {
            cls: 'target-rule-mini-btn',
            attr: { title: 'Duplicate rule' }
        });
        setIcon(duplicateBtn, 'copy');
        duplicateBtn.addEventListener('click', async () => {
            await this.duplicateRule(rule, index);
        });

        const deleteBtn = actionGroup.createEl('button', {
            cls: 'target-rule-mini-btn mod-warning',
            attr: { title: 'Delete rule' }
        });
        setIcon(deleteBtn, 'trash');
        deleteBtn.addEventListener('click', async () => {
            await this.deleteRule(rule.id);
        });

        // Expanded preview row if active
        if (isExpanded && rule.lastMatchedFiles && rule.lastMatchedFiles.length > 0) {
            const previewRow = tbody.createEl('tr', { cls: 'target-rule-table-preview-row' });
            const previewCell = previewRow.createEl('td', { attr: { colspan: '8' } });

            const previewEl = previewCell.createDiv({ cls: 'target-rule-preview-container' });
            const previewHeader = previewEl.createDiv({ cls: 'target-rule-preview-header' });
            previewHeader.createSpan({ text: `Matched Files (${rule.lastMatchedFiles.length}):` });

            const copyAllBtn = previewHeader.createEl('button', {
                cls: 'target-rule-mini-btn mod-cta',
                text: '📋 Copy All Paths'
            });
            copyAllBtn.addEventListener('click', () => {
                const text = (rule.lastMatchedFiles || []).join('\n');
                navigator.clipboard.writeText(text);
                new Notice(`✓ Copied ${rule.lastMatchedFiles?.length} file paths to clipboard`);
            });

            if (rule.targetVaultDir) {
                const copyAllVaultBtn = previewHeader.createEl('button', {
                    cls: 'target-rule-mini-btn mod-cta',
                    text: `📥 Copy All to Vault (${rule.targetVaultDir})`
                });
                copyAllVaultBtn.addEventListener('click', async () => {
                    await this.copyMatchedFilesToVault(rule);
                });
            }

            const previewList = previewEl.createDiv({ cls: 'target-rule-preview-list' });
            rule.lastMatchedFiles.forEach((fp) => {
                const itemEl = previewList.createDiv({ cls: 'target-rule-preview-item' });
                itemEl.createSpan({ cls: 'target-rule-file-path', text: fp });

                const copyItemBtn = itemEl.createEl('button', {
                    cls: 'target-rule-mini-btn',
                    attr: { title: 'Copy file path' }
                });
                setIcon(copyItemBtn, 'copy');
                copyItemBtn.addEventListener('click', () => {
                    navigator.clipboard.writeText(fp);
                    new Notice('✓ Copied file path to clipboard');
                });
            });
        }
    }

    private closeFormatPopup(): void {
        if (this.outsideClickListener && this.activePopupDoc) {
            this.activePopupDoc.removeEventListener('click', this.outsideClickListener, true);
            this.outsideClickListener = null;
            this.activePopupDoc = null;
        }
        if (this.activeFormatPopupEl) {
            this.activeFormatPopupEl.remove();
            this.activeFormatPopupEl = null;
        }
    }

    private openFormatPopup(triggerBtn: HTMLElement, rule: TargetFilterRule): void {
        // If clicking the same trigger while open, just close it
        if (this.activeFormatPopupEl && (this.activeFormatPopupEl as any)._triggerRuleId === rule.id) {
            this.closeFormatPopup();
            return;
        }
        this.closeFormatPopup();

        const doc = triggerBtn.ownerDocument || document;
        const win = doc.defaultView || window;
        const popup = doc.createElement('div');
        popup.className = 'target-rule-format-popup is-floating';
        (popup as any)._triggerRuleId = rule.id;

        // Position fixed based on trigger button
        const rect = triggerBtn.getBoundingClientRect();
        popup.style.position = 'fixed';
        popup.style.zIndex = '99999';

        const popupWidth = 270;
        let left = rect.left;

        if (left + popupWidth > win.innerWidth - 16) {
            left = win.innerWidth - popupWidth - 16;
        }
        if (left < 16) {
            left = 16;
        }

        popup.style.left = `${left}px`;
        popup.style.right = 'auto';

        // Check if there is enough space below, else show above
        const spaceBelow = win.innerHeight - rect.bottom;
        if (spaceBelow < 330 && rect.top > 330) {
            popup.style.bottom = `${win.innerHeight - rect.top + 4}px`;
            popup.style.top = 'auto';
        } else {
            popup.style.top = `${rect.bottom + 4}px`;
            popup.style.bottom = 'auto';
        }

        // Attach inside modal-container or body
        const mountTarget = triggerBtn.closest('.modal-container') || triggerBtn.closest('.modal') || doc.body;
        mountTarget.appendChild(popup);
        this.activeFormatPopupEl = popup;
        this.activePopupDoc = doc;

        // Prevent clicks inside popup from bubbling to document outside-click handler
        popup.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        // Render contents into popup
        this.renderFormatPopupContent(popup, triggerBtn, rule);

        // Outside click handler (capture phase or delayed to avoid immediately catching the open click)
        win.setTimeout(() => {
            this.outsideClickListener = (e: MouseEvent) => {
                if (this.activeFormatPopupEl && !this.activeFormatPopupEl.contains(e.target as Node) && !triggerBtn.contains(e.target as Node)) {
                    this.closeFormatPopup();
                }
            };
            doc.addEventListener('click', this.outsideClickListener, true);
        }, 50);
    }

    private renderFormatPopupContent(popup: HTMLElement, triggerBtn: HTMLElement, rule: TargetFilterRule): void {
        popup.empty();

        const updateTriggerText = () => {
            const summary = this.getFormatSummaryText(rule.formats);
            triggerBtn.setText(`${summary} ▾`);
        };

        const topControls = popup.createDiv({ cls: 'target-rule-format-popup-top' });

        const allOptions = Array.from(
            new Set(
                [...DEFAULT_FORMAT_OPTIONS, ...(rule.formats || [])]
                    .map((f) => f.toLowerCase().replace(/^[\.,]+|[\.,]+$/g, ''))
                    .filter(Boolean)
            )
        );

        const selectAllBtn = topControls.createEl('button', {
            cls: 'target-rule-popup-btn',
            text: 'All'
        });
        selectAllBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            rule.formats = [...allOptions];
            await this.saveSettings();
            updateTriggerText();
            this.renderFormatPopupContent(popup, triggerBtn, rule);
        });

        const clearBtn = topControls.createEl('button', {
            cls: 'target-rule-popup-btn',
            text: 'Clear'
        });
        clearBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            rule.formats = [];
            await this.saveSettings();
            updateTriggerText();
            this.renderFormatPopupContent(popup, triggerBtn, rule);
        });

        const closeBtn = topControls.createEl('button', {
            cls: 'target-rule-popup-btn',
            text: '✕'
        });
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.closeFormatPopup();
            if (this.viewMode === 'card') {
                this.render();
            }
        });

        const checklist = popup.createDiv({ cls: 'target-rule-format-checklist' });

        allOptions.forEach((fmt) => {
            const isCustom = !DEFAULT_FORMAT_OPTIONS.includes(fmt);
            const itemRow = checklist.createDiv({ cls: 'target-rule-format-item-row' });

            const itemLabel = itemRow.createEl('label', { cls: 'target-rule-format-checkbox-label' });
            const checkbox = itemLabel.createEl('input', { type: 'checkbox' });
            checkbox.checked = (rule.formats || []).some(
                (f) => f.toLowerCase().replace(/^[\.,]+|[\.,]+$/g, '') === fmt
            );

            checkbox.addEventListener('change', async (e) => {
                e.stopPropagation();
                if (!rule.formats) rule.formats = [];
                const cleanFormats = rule.formats.map((f) => f.toLowerCase().replace(/^[\.,]+|[\.,]+$/g, ''));
                if (checkbox.checked) {
                    if (!cleanFormats.includes(fmt)) {
                        rule.formats.push(fmt);
                    }
                } else {
                    rule.formats = rule.formats.filter(
                        (f) => f.toLowerCase().replace(/^[\.,]+|[\.,]+$/g, '') !== fmt
                    );
                }
                await this.saveSettings();
                updateTriggerText();
            });

            itemLabel.createSpan({ text: `.${fmt}` });

            if (isCustom) {
                const removeCustomBtn = itemRow.createSpan({
                    cls: 'target-rule-format-remove-custom',
                    text: '✕',
                    attr: { title: `Remove .${fmt}` }
                });
                removeCustomBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    rule.formats = (rule.formats || []).filter(
                        (f) => f.toLowerCase().replace(/^[\.,]+|[\.,]+$/g, '') !== fmt
                    );
                    await this.saveSettings();
                    updateTriggerText();
                    this.renderFormatPopupContent(popup, triggerBtn, rule);
                });
            }
        });

        // Custom Format Input Section
        const customInputRow = popup.createDiv({ cls: 'target-rule-custom-format-row' });

        const customInput = customInputRow.createEl('input', {
            type: 'text',
            cls: 'target-rule-custom-format-input',
            attr: { placeholder: 'e.g. .sample, sample., py | log' }
        });

        const addCustomBtn = customInputRow.createEl('button', {
            cls: 'target-rule-custom-format-add-btn',
            text: '+ Add'
        });

        const handleAddCustom = async () => {
            const rawVal = customInput.value.trim();
            if (!rawVal) return;

            const tokens = rawVal.split(/(?:\s+or\s+|\s+and\s+|[,;|/\s]+)/i);
            const newFormats: string[] = [];

            for (const token of tokens) {
                const clean = token.trim().replace(/^[\.,\|;/\\#\s]+|[\.,\|;/\\#\s]+$/g, '').toLowerCase();
                if (clean && !newFormats.includes(clean)) {
                    newFormats.push(clean);
                }
            }

            if (newFormats.length === 0) return;

            if (!rule.formats) rule.formats = [];
            const cleanExisting = rule.formats.map((f) => f.toLowerCase().replace(/^[\.,]+|[\.,]+$/g, ''));
            const added: string[] = [];

            for (const fmt of newFormats) {
                if (!cleanExisting.includes(fmt)) {
                    rule.formats.push(fmt);
                    cleanExisting.push(fmt);
                    added.push(fmt);
                }
            }

            customInput.value = '';
            await this.saveSettings();
            updateTriggerText();
            this.renderFormatPopupContent(popup, triggerBtn, rule);

            if (added.length > 0) {
                new Notice(`✓ Added format(s): ${added.map((f) => '.' + f).join(', ')}`);
            } else {
                new Notice(`Format(s) already active: ${newFormats.map((f) => '.' + f).join(', ')}`);
            }
        };

        addCustomBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            void handleAddCustom();
        });

        customInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                void handleAddCustom();
            }
        });
    }

    private getFormatSummaryText(formats?: string[]): string {
        if (!formats || formats.length === 0) {
            return 'All Formats';
        }
        if (formats.length <= 3) {
            return formats.join(', ');
        }
        return `${formats.slice(0, 3).join(', ')} (+${formats.length - 3})`;
    }

    private async addNewRule(): Promise<void> {
        const settings = this.getSettings();
        if (!settings.targetRules) settings.targetRules = [];

        const newRule: TargetFilterRule = {
            id: `rule-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            targetPath: '',
            targetVaultDir: '',
            pathIncludeMode: 'all',
            pathIncludePattern: '',
            filenameMode: 'all',
            filenamePattern: '',
            formats: ['md', 'json', 'csv']
        };

        settings.targetRules.push(newRule);
        await this.saveSettings();
        this.render();
        new Notice('✓ Created new Target Filter Rule');
    }

    private async duplicateRule(sourceRule: TargetFilterRule, insertIndex: number): Promise<void> {
        const settings = this.getSettings();
        if (!settings.targetRules) settings.targetRules = [];

        const clonedRule: TargetFilterRule = {
            ...sourceRule,
            id: `rule-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            targetVaultDir: sourceRule.targetVaultDir || '',
            formats: [...(sourceRule.formats || [])],
            lastMatchedCount: undefined,
            lastMatchedFiles: undefined
        };

        settings.targetRules.splice(insertIndex + 1, 0, clonedRule);
        await this.saveSettings();
        this.render();
        new Notice('✓ Duplicated rule');
    }

    private async copyMatchedFilesToVault(rule: TargetFilterRule): Promise<void> {
        if (!rule.targetVaultDir) {
            new Notice('Please specify a Target in Vault Directory first.');
            return;
        }
        if (!rule.lastMatchedFiles || rule.lastMatchedFiles.length === 0) {
            new Notice('No matched files to copy. Click Rescan first.');
            return;
        }

        const fs = getNodeFs();
        if (!fs) {
            new Notice('Node filesystem is not available.');
            return;
        }

        const vaultRoot = this.manager.getVaultRoot();
        if (!vaultRoot) {
            new Notice('Could not determine Vault root path.');
            return;
        }

        const normVaultTarget = normalizePath(rule.targetVaultDir.trim());
        const targetDiskDir = PathUtils.join(vaultRoot, normVaultTarget);

        try {
            if (!fs.existsSync(targetDiskDir)) {
                fs.mkdirSync(targetDiskDir, { recursive: true });
            }

            let copiedCount = 0;
            for (const srcPath of rule.lastMatchedFiles) {
                if (fs.existsSync(srcPath)) {
                    let rel = '';
                    try {
                        const normSrc = srcPath.replace(/\\/g, '/');
                        const normTarget = (rule.targetPath || '').replace(/\\/g, '/').replace(/\/+$/, '');
                        if (normSrc.startsWith(normTarget + '/')) {
                            rel = normSrc.substring(normTarget.length + 1);
                        }
                    } catch {
                        // ignore
                    }

                    const destPath = rel
                        ? PathUtils.join(targetDiskDir, rel)
                        : PathUtils.join(targetDiskDir, PathUtils.basename(srcPath));

                    const destDir = PathUtils.dirname(destPath);
                    if (!fs.existsSync(destDir)) {
                        fs.mkdirSync(destDir, { recursive: true });
                    }

                    fs.copyFileSync(srcPath, destPath);
                    copiedCount++;
                }
            }

            new Notice(`✓ Copied ${copiedCount} file(s) into vault: "${rule.targetVaultDir}"`);
        } catch (err: any) {
            new Notice(`Copy to vault failed: ${err?.message || String(err)}`);
        }
    }

    private async deleteRule(ruleId: string): Promise<void> {
        const settings = this.getSettings();
        if (!settings.targetRules) return;

        settings.targetRules = settings.targetRules.filter((r) => r.id !== ruleId);
        this.expandedPreviewIds.delete(ruleId);
        this.closeFormatPopup();

        await this.saveSettings();
        this.render();
        new Notice('✓ Deleted rule');
    }

    private async rescanSingleRule(rule: TargetFilterRule): Promise<void> {
        if (!rule.targetPath) {
            new Notice('Please specify a Target Path first.');
            return;
        }

        this.scanningRuleIds.add(rule.id);
        this.render();

        try {
            const matches = await scanDirectoryForRule(rule);
            rule.lastMatchedCount = matches.length;
            rule.lastMatchedFiles = matches;
            await this.saveSettings();
            new Notice(`✓ Found ${matches.length} matching files`);
        } catch (err: any) {
            new Notice(`Scanning error: ${err?.message || String(err)}`);
        } finally {
            this.scanningRuleIds.delete(rule.id);
            this.render();
        }
    }

    private async rescanAllRules(): Promise<void> {
        const settings = this.getSettings();
        const rules = settings.targetRules || [];
        if (rules.length === 0) return;

        new Notice(`Rescanning ${rules.length} rules...`);
        for (const rule of rules) {
            if (rule.targetPath) {
                this.scanningRuleIds.add(rule.id);
            }
        }
        this.render();

        try {
            for (const rule of rules) {
                if (rule.targetPath) {
                    const matches = await scanDirectoryForRule(rule);
                    rule.lastMatchedCount = matches.length;
                    rule.lastMatchedFiles = matches;
                }
            }
            await this.saveSettings();
            new Notice('✓ Rescan complete for all rules');
        } finally {
            this.scanningRuleIds.clear();
            this.render();
        }
    }
}
