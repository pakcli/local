import { App, Plugin } from 'obsidian';
import { CopyPasteManager } from './CopyPasteManager';
import { CopyPasteSettings } from './types';
import { CopyPasteTableView } from './ui/CopyPasteTableView';

export function renderCopyPasteSettings(
    app: App,
    plugin: Plugin,
    manager: CopyPasteManager,
    getSettings: () => CopyPasteSettings,
    saveSettings: () => Promise<void>,
    containerEl: HTMLElement
): void {
    const view = new CopyPasteTableView(app, manager, getSettings, saveSettings, containerEl);
    view.render();
}

// Backward compatibility alias
export const renderGetCopySettings = renderCopyPasteSettings;
