import { App, Plugin } from 'obsidian';
import { GetCopyManager } from './GetCopyManager';
import { GetCopySettings } from './types';
import { GetCopyTableView } from './ui/GetCopyTableView';

export function renderGetCopySettings(
    app: App,
    plugin: Plugin,
    manager: GetCopyManager,
    getSettings: () => GetCopySettings,
    saveSettings: () => Promise<void>,
    containerEl: HTMLElement
): void {
    const view = new GetCopyTableView(app, manager, getSettings, saveSettings, containerEl);
    view.render();
}
