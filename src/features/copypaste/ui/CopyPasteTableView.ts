import { App } from 'obsidian';
import { CopyPasteManager } from '../CopyPasteManager';
import { CopyPasteSettings } from '../types';
import { TargetRulesView } from './TargetRulesView';

/**
 * CopyPasteTableView
 *
 * Dedicated dashboard for CopyPaste Manager Target Vault Rules (supporting Card View and Table View).
 */
export class CopyPasteTableView {
    private app: App;
    private manager: CopyPasteManager;
    private getSettings: () => CopyPasteSettings;
    private saveSettings: () => Promise<void>;
    private containerEl: HTMLElement;

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
        this.containerEl.empty();
        this.containerEl.addClass('get-copy-dashboard-container');

        const rulesContainer = this.containerEl.createDiv({ cls: 'get-copy-rules-wrapper' });
        new TargetRulesView(
            this.app,
            this.manager,
            this.getSettings,
            this.saveSettings,
            rulesContainer
        ).render();
    }
}

// Backward compatibility alias
export const GetCopyTableView = CopyPasteTableView;
