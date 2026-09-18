import { App, Notice, Modal, setIcon, Setting, ToggleComponent } from 'obsidian';
import { GetCopyManager } from '../GetCopyManager';
import { GetCopyPipelineItem, GetCopySettings } from '../types';
import { AddPipelineModal } from './AddPipelineModal';
import { EditPipelineModal } from './EditPipelineModal';

export class GetCopyTableView {
    private app: App;
    private manager: GetCopyManager;
    private getSettings: () => GetCopySettings;
    private saveSettings: () => Promise<void>;
    private containerEl: HTMLElement;
    private activeTab: 'all' | 'notScannedToday' = 'all';
    private selectedIds: Set<string> = new Set();
    private isBatchRunning = false;
    private runningItemIds: Set<string> = new Set();

    constructor(
        app: App,
        manager: GetCopyManager,
        getSettings: () => GetCopySettings,
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
        this.containerEl.empty();
        this.containerEl.addClass('get-copy-dashboard-container');

        const settings = this.getSettings();
        const pipelines = settings.getCopyPipelines || [];
        const today = this.manager.getTodayString();

        const notScannedTodayCount = pipelines.filter((p) => !p.latestCopy || p.latestCopy !== today).length;

        // 1. Top Header & Master Controls
        const headerEl = this.containerEl.createDiv({ cls: 'get-copy-header' });
        
        const titleRow = headerEl.createDiv({ cls: 'get-copy-title-row' });
        titleRow.createEl('h2', { cls: 'get-copy-title-text', text: '📂 External to vault "Get Copy" pipelines' });

        const globalControls = headerEl.createDiv({ cls: 'get-copy-global-controls' });

        // Global master toggle for awake scan
        new Setting(globalControls)
            .setName('Scan on Obsidian awake')
            .setDesc('Enable automated startup scan for pipelines that are marked "Scan on Awake" and not scanned today.')
            .addToggle((toggle) => {
                toggle.setValue(settings.getCopyAutoScanOnAwake);
                toggle.onChange(async (val) => {
                    settings.getCopyAutoScanOnAwake = val;
                    await this.saveSettings();
                    new Notice(`Scan on awake is now ${val ? 'enabled' : 'disabled'}.`);
                });
            });

        // 2. Tabs Bar: [ All (N) ] | [ Not scanned today (N) ]
        const navRow = this.containerEl.createDiv({ cls: 'get-copy-nav-row' });
        const tabsBar = navRow.createDiv({ cls: 'get-copy-tabs' });

        const allTab = tabsBar.createDiv({
            cls: `get-copy-tab ${this.activeTab === 'all' ? 'is-active' : ''}`,
            text: `All (${pipelines.length})`,
        });
        allTab.onclick = () => {
            if (this.activeTab !== 'all') {
                this.activeTab = 'all';
                this.render();
            }
        };

        const notScannedTab = tabsBar.createDiv({
            cls: `get-copy-tab ${this.activeTab === 'notScannedToday' ? 'is-active' : ''}`,
            text: `Not scanned today (${notScannedTodayCount})`,
        });
        notScannedTab.onclick = () => {
            if (this.activeTab !== 'notScannedToday') {
                this.activeTab = 'notScannedToday';
                this.render();
            }
        };

        const addBtn = navRow.createEl('button', {
            cls: 'mod-cta get-copy-add-btn',
            text: '+ Add Directory Pipeline',
        });
        addBtn.onclick = () => {
            new AddPipelineModal(this.app, this.manager, () => this.render()).open();
        };

        // Filter items based on active tab
        const visibleItems = this.activeTab === 'all'
            ? pipelines
            : pipelines.filter((p) => !p.latestCopy || p.latestCopy !== today);

        // 3. Table Container
        const tableWrapper = this.containerEl.createDiv({ cls: 'get-copy-table-wrapper' });

        if (visibleItems.length === 0) {
            const emptyEl = tableWrapper.createDiv({ cls: 'get-copy-empty-state' });
            if (this.activeTab === 'notScannedToday') {
                emptyEl.createDiv({ cls: 'get-copy-empty-icon', text: '🎉' });
                emptyEl.createDiv({
                    cls: 'get-copy-empty-msg',
                    text: 'All configured directory pipelines have been scanned today!',
                });
            } else {
                emptyEl.createDiv({ cls: 'get-copy-empty-icon', text: '📂' });
                emptyEl.createDiv({
                    cls: 'get-copy-empty-msg',
                    text: 'No get-copy pipelines configured yet. Click "+ Add directory pipeline" to get started.',
                });
            }
        } else {
            const table = tableWrapper.createEl('table', { cls: 'get-copy-table' });
            const thead = table.createEl('thead');
            const headerRow = thead.createEl('tr');

            // Col 1: Select All Checkbox
            const thCheck = headerRow.createEl('th', { cls: 'th-checkbox' });
            const selectAllCheck = thCheck.createEl('input', { type: 'checkbox' });
            const allVisibleSelected = visibleItems.length > 0 && visibleItems.every((item) => this.selectedIds.has(item.id));
            selectAllCheck.checked = allVisibleSelected;
            selectAllCheck.onchange = () => {
                if (selectAllCheck.checked) {
                    visibleItems.forEach((i) => this.selectedIds.add(i.id));
                } else {
                    visibleItems.forEach((i) => this.selectedIds.delete(i.id));
                }
                this.render();
            };

            // Col 2: External Directory
            headerRow.createEl('th', { cls: 'th-external', text: 'External directory' });

            // Col 3: Vault Directory
            headerRow.createEl('th', { cls: 'th-vault', text: 'Vault directory' });

            // Col 4: Latest Copy
            headerRow.createEl('th', { cls: 'th-date', text: 'Latest copy' });

            // Col 5: Scan on Awake Toggle
            headerRow.createEl('th', { cls: 'th-awake', text: 'Scan on awake' });

            // Col 6: Open Setting
            headerRow.createEl('th', { cls: 'th-settings', text: 'Open setting' });

            // Col 7: Actions
            headerRow.createEl('th', { cls: 'th-actions', text: 'Actions' });

            const tbody = table.createEl('tbody');

            for (const item of visibleItems) {
                const tr = tbody.createEl('tr', {
                    cls: this.selectedIds.has(item.id) ? 'is-selected' : '',
                });

                // 1. Checkbox
                const tdCheck = tr.createEl('td', { cls: 'td-checkbox' });
                const rowCheck = tdCheck.createEl('input', { type: 'checkbox' });
                rowCheck.checked = this.selectedIds.has(item.id);
                rowCheck.onchange = () => {
                    if (rowCheck.checked) {
                        this.selectedIds.add(item.id);
                    } else {
                        this.selectedIds.delete(item.id);
                    }
                    this.render();
                };

                // 2. External Directory / File
                const tdExternal = tr.createEl('td', { cls: 'td-external' });
                const nameRow = tdExternal.createDiv({ cls: 'pipeline-name-row' });
                nameRow.createSpan({ cls: 'pipeline-name', text: item.name || 'Copy Pipeline' });

                const isSingle = item.readAllSiblings === false;
                const scopeBadge = nameRow.createSpan({
                    cls: `pipeline-scope-badge ${isSingle ? 'is-single' : 'is-siblings'}`,
                    text: isSingle ? 'Single file' : 'All siblings',
                });
                scopeBadge.title = isSingle
                    ? 'Mode: Focus on single file'
                    : 'Mode: Read all siblings in directory';

                const pathEl = tdExternal.createDiv({ cls: 'pipeline-path', text: item.externalDir });
                pathEl.title = item.externalDir;

                // 3. Vault Directory
                const tdVault = tr.createEl('td', { cls: 'td-vault' });
                const vaultPathEl = tdVault.createDiv({ cls: 'pipeline-vault-path', text: item.vaultDir || '/' });
                vaultPathEl.title = item.vaultDir || '/';

                // 4. Latest Copy YYYY-MM-DD
                const tdDate = tr.createEl('td', { cls: 'td-date' });
                const isToday = item.latestCopy === today;
                const dateBadge = tdDate.createDiv({
                    cls: `pipeline-date-badge ${isToday ? 'is-today' : (item.latestCopy ? 'is-past' : 'is-never')}`,
                });
                dateBadge.setText(item.latestCopy || 'Never');
                if (item.lastCopiedCount !== undefined && item.lastCopiedCount > 0) {
                    tdDate.createDiv({
                        cls: 'pipeline-count-sub',
                        text: `${item.lastCopiedCount} file(s)`,
                    });
                }
                if (item.lastStatus === 'error' && item.lastError) {
                    const errEl = tdDate.createDiv({ cls: 'pipeline-error-sub', text: '⚠️ Error' });
                    errEl.title = item.lastError;
                }

                // 5. Scan on Awake Toggle
                const tdAwake = tr.createEl('td', { cls: 'td-awake' });
                const toggle = new ToggleComponent(tdAwake);
                toggle.setValue(item.scanOnAwake);
                toggle.setTooltip('Toggle automated scan on Obsidian awake');
                toggle.onChange(async (val) => {
                    item.scanOnAwake = val;
                    await this.manager.updatePipeline(item);
                    new Notice(`Pipeline "${item.name}": Scan on Awake ${val ? 'enabled' : 'disabled'}.`);
                });

                // 6. Open Setting
                const tdSettings = tr.createEl('td', { cls: 'td-settings' });
                const settingBtn = tdSettings.createEl('button', {
                    cls: 'get-copy-btn-setting',
                    text: '⚙️ Setting',
                });
                settingBtn.title = 'Open settings for this pipeline';
                settingBtn.onclick = () => {
                    new EditPipelineModal(this.app, this.manager, item, () => this.render()).open();
                };

                // 7. Action Buttons
                const tdActions = tr.createEl('td', { cls: 'td-actions' });
                const isRunning = this.runningItemIds.has(item.id);

                // Rescan button
                const rescanBtn = tdActions.createEl('button', {
                    cls: 'get-copy-btn-rescan',
                    text: isRunning ? 'Copying...' : 'Rescan',
                });
                if (isRunning) {
                    rescanBtn.disabled = true;
                }
                rescanBtn.onclick = async () => {
                    this.runningItemIds.add(item.id);
                    this.render();

                    const res = await this.manager.copyPipeline(item);
                    this.runningItemIds.delete(item.id);

                    if (res.success) {
                        new Notice(`✅ Synced "${item.name || item.vaultDir}" (${res.copied} files copied).`);
                    } else {
                        new Notice(`❌ Failed to sync: ${res.error}`);
                    }
                    this.render();
                };

                // Remove Single Item button
                const deleteBtn = tdActions.createEl('button', {
                    cls: 'get-copy-btn-delete',
                    text: '✕',
                });
                deleteBtn.title = 'Remove this pipeline';
                deleteBtn.onclick = async () => {
                    await this.manager.removePipeline(item.id);
                    this.selectedIds.delete(item.id);
                    new Notice(`Removed pipeline "${item.name}".`);
                    this.render();
                };
            }
        }

        // 4. Bottom Actions Toolbar
        // "bellow the table ada batch rescan all row, remove all, select andremove selected"
        const bottomBar = this.containerEl.createDiv({ cls: 'get-copy-bottom-bar' });

        const leftGroup = bottomBar.createDiv({ cls: 'get-copy-bottom-group-left' });
        const rightGroup = bottomBar.createDiv({ cls: 'get-copy-bottom-group-right' });

        // Batch Rescan All Row
        const batchRescanBtn = leftGroup.createEl('button', {
            cls: 'mod-cta get-copy-batch-rescan-btn',
            text: this.isBatchRunning ? '⏳ Rescanning All...' : `↻ Batch Rescan All (${visibleItems.length})`,
        });
        batchRescanBtn.disabled = this.isBatchRunning || visibleItems.length === 0;
        batchRescanBtn.onclick = async () => {
            if (this.isBatchRunning || visibleItems.length === 0) return;
            this.isBatchRunning = true;
            this.render();

            const res = await this.manager.batchRescan(visibleItems);
            this.isBatchRunning = false;

            if (res.errors.length === 0) {
                new Notice(`✅ Batch rescan complete: ${res.successCount} pipelines synced (${res.totalCopied} files copied).`);
            } else {
                new Notice(`⚠️ Batch rescan finished with ${res.errors.length} error(s). ${res.successCount} succeeded.`);
            }
            this.render();
        };

        // Select & Remove Selected
        const numSelected = this.selectedIds.size;
        const removeSelectedBtn = rightGroup.createEl('button', {
            cls: 'mod-warning get-copy-remove-selected-btn',
            text: `Select & Remove Selected (${numSelected})`,
        });
        removeSelectedBtn.disabled = numSelected === 0;
        removeSelectedBtn.onclick = async () => {
            if (numSelected === 0) return;
            await this.manager.removeSelectedPipelines(Array.from(this.selectedIds));
            this.selectedIds.clear();
            new Notice(`Removed ${numSelected} pipeline(s).`);
            this.render();
        };

        // Remove All
        const removeAllBtn = rightGroup.createEl('button', {
            cls: 'mod-danger get-copy-remove-all-btn',
            text: 'Remove All',
        });
        removeAllBtn.disabled = pipelines.length === 0;
        removeAllBtn.onclick = () => {
            if (pipelines.length === 0) return;
            const confirmModal = new RemoveAllConfirmModal(this.app, async () => {
                await this.manager.removeAllPipelines();
                this.selectedIds.clear();
                new Notice('Removed all Get-Copy pipelines.');
                this.render();
            });
            confirmModal.open();
        };
    }
}

class RemoveAllConfirmModal extends Modal {
    private onConfirm: () => Promise<void>;

    constructor(app: App, onConfirm: () => Promise<void>) {
        super(app);
        this.onConfirm = onConfirm;
    }

    onOpen(): void {
        this.titleEl.setText('⚠️ Remove all pipelines');
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('p', {
            text: 'Are you sure you want to remove all configured get-copy directory pipelines? This will only remove the configuration, not any existing files.',
        });

        const btnRow = contentEl.createDiv({ cls: 'modal-button-container get-copy-confirm-actions' });

        const cancelBtn = btnRow.createEl('button', { text: 'Cancel' });
        cancelBtn.onclick = () => this.close();

        const confirmBtn = btnRow.createEl('button', {
            text: 'Yes, remove all',
            cls: 'mod-danger',
        });
        confirmBtn.onclick = async () => {
            this.close();
            await this.onConfirm();
        };
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
