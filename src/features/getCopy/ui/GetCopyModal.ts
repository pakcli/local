import { App, Modal } from 'obsidian';
import { GetCopyManager } from '../GetCopyManager';
import { GetCopySettings } from '../types';
import { GetCopyTableView } from './GetCopyTableView';

export class GetCopyModal extends Modal {
    private manager: GetCopyManager;
    private getSettings: () => GetCopySettings;
    private saveSettings: () => Promise<void>;
    private tableView!: GetCopyTableView;

    constructor(
        app: App,
        manager: GetCopyManager,
        getSettings: () => GetCopySettings,
        saveSettings: () => Promise<void>
    ) {
        super(app);
        this.manager = manager;
        this.getSettings = getSettings;
        this.saveSettings = saveSettings;
    }

    onOpen(): void {
        this.modalEl.addClass('get-copy-modal-window');

        const { contentEl } = this;
        contentEl.empty();

        this.tableView = new GetCopyTableView(
            this.app,
            this.manager,
            this.getSettings,
            this.saveSettings,
            contentEl
        );
        this.tableView.render();
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
