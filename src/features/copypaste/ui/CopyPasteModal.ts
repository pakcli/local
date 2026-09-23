import { App, Modal } from 'obsidian';
import { CopyPasteManager } from '../CopyPasteManager';
import { CopyPasteSettings } from '../types';
import { CopyPasteTableView } from './CopyPasteTableView';

export class CopyPasteModal extends Modal {
    private manager: CopyPasteManager;
    private getSettings: () => CopyPasteSettings;
    private saveSettings: () => Promise<void>;
    private tableView!: CopyPasteTableView;

    constructor(
        app: App,
        manager: CopyPasteManager,
        getSettings: () => CopyPasteSettings,
        saveSettings: () => Promise<void>
    ) {
        super(app);
        this.manager = manager;
        this.getSettings = getSettings;
        this.saveSettings = saveSettings;
    }

    onOpen(): void {
        this.modalEl.addClass('copypaste-modal-window');
        this.modalEl.addClass('get-copy-modal-window');

        const { contentEl } = this;
        contentEl.empty();

        this.tableView = new CopyPasteTableView(
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

// Backward compatibility alias
export const GetCopyModal = CopyPasteModal;
