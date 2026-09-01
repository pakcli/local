/**
 * SyncCodeblockRenderer.ts
 *
 * Renders the Two-Section Codeblock:
 *   - Section 1: Interactive Sync Controller, Diff Viewer & Script Runner
 *   - Section 2: Formatted Codeblock with Copy Button
 */
import { FileSystemAdapter, MarkdownRenderChild, Notice, TFile } from 'obsidian';
import { PathUtils } from '../../../utils/nodeHelpers';
import { SyncManager } from '../SyncManager';
import { renderDiffViewer } from '../diffViewer';

export class SyncCodeblockRenderer extends MarkdownRenderChild {
    private syncManager: SyncManager;
    private source: string;
    private language: string;
    private plugin: any;
    private noteFile: TFile | null = null;

    private isDiffOpen = false;
    private isOutputOpen = false;
    private diffContainerEl: HTMLElement | null = null;
    private outputContainerEl: HTMLElement | null = null;

    constructor(
        containerEl: HTMLElement,
        source: string,
        language: string,
        syncManager: SyncManager,
        plugin: any,
        noteFile: TFile | null
    ) {
        super(containerEl);
        this.source = source;
        this.language = language;
        this.syncManager = syncManager;
        this.plugin = plugin;
        this.noteFile = noteFile;
    }

    onload(): void {
        this.render();
    }

    private render(): void {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.addClass('pakcli-codeblock-container');

        // SECTION 1: Sync Controller & Runner Header
        const section1 = containerEl.createDiv({ cls: 'pakcli-sync-header' });
        this.renderControllerHeader(section1);

        // Diff Viewer (Expandable Drawer)
        this.diffContainerEl = containerEl.createDiv({ cls: 'pakcli-diff-drawer' });
        this.diffContainerEl.setCssStyles({ display: "none" });

        // Script Output Terminal Drawer
        this.outputContainerEl = containerEl.createDiv({ cls: 'pakcli-output-drawer' });
        this.outputContainerEl.setCssStyles({ display: "none" });

        // SECTION 2: Codeblock View
        const section2 = containerEl.createDiv({ cls: 'pakcli-codeblock-section' });
        this.renderCodeblockBody(section2);
    }

    private renderControllerHeader(headerEl: HTMLElement): void {
        const titleRow = headerEl.createDiv({ cls: 'pakcli-sync-title-row' });
        const leftMeta = titleRow.createDiv({ cls: 'pakcli-sync-meta' });
        
        const langBadge = leftMeta.createSpan({ cls: 'pakcli-lang-badge', text: this.language.toUpperCase() });
        const statusBadge = leftMeta.createSpan({ cls: 'pakcli-status-badge', text: '⚡ Script' });

        const actions = titleRow.createDiv({ cls: 'pakcli-sync-actions' });

        // Run Script Button
        const runBtn = actions.createEl('button', { cls: 'pakcli-btn-run', text: '▶ Run' });
        runBtn.onclick = async () => {
            runBtn.disabled = true;
            runBtn.setText('⏳ Running...');
            try {
                if (this.outputContainerEl) {
                    this.outputContainerEl.setCssStyles({ display: "block" });
                    this.outputContainerEl.setText('Executing script via local shell...');
                }
            } catch (err: any) {
                new Notice('Execution error: ' + err.message);
            } finally {
                runBtn.disabled = false;
                runBtn.setText('▶ Run');
            }
        };

        // Copy Button
        const copyBtn = actions.createEl('button', { cls: 'pakcli-btn-copy', text: '📋 Copy' });
        copyBtn.onclick = () => {
            navigator.clipboard.writeText(this.source);
            copyBtn.setText('✅ Copied!');
            window.setTimeout(() => copyBtn.setText('📋 Copy'), 1500);
        };
    }

    private renderCodeblockBody(section2: HTMLElement): void {
        const codeBody = section2.createDiv({ cls: 'pakcli-codeblock-body' });
        const pre = codeBody.createEl('pre', { cls: 'pakcli-codeblock pakcli-codeblock-flowclip' });
        const code = pre.createEl('code', { cls: `language-${this.language}` });
        code.textContent = this.source;
    }
}
