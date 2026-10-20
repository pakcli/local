/**
 * SyncCodeblockRenderer.ts
 *
 * Renders the Two-Section Codeblock:
 *   - Section 1: Interactive Sync Controller, Diff Viewer & Script Runner
 *   - Section 2: Formatted Codeblock with Copy Button
 */
import { MarkdownRenderChild, MarkdownView, Notice, TFile } from 'obsidian';
import { SyncManager } from '../SyncManager';
import { renderDiffViewer } from '../diffViewer';
import { ConfirmModal } from '../../../uiComponents';

export class SyncCodeblockRenderer extends MarkdownRenderChild {
    private syncManager: SyncManager;
    private source: string;
    private language: string;
    private plugin: any;
    private noteFile: TFile | null = null;

    private isDiffOpen = false;
    private diffContainerEl: HTMLElement | null = null;
    private outputContainerEl: HTMLElement | null = null;

    private activeCancel: (() => void) | null = null;
    private keydownHandler: ((e: KeyboardEvent) => void) | null = null;

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

    onunload(): void {
        if (this.activeCancel) {
            this.activeCancel();
            this.activeCancel = null;
        }
        if (this.keydownHandler) {
            window.removeEventListener('keydown', this.keydownHandler, true);
            this.keydownHandler = null;
        }
    }

    private isLivePreviewMode(): boolean {
        // 1. Direct DOM check (if attached)
        if (this.containerEl.closest('.markdown-source-view, .cm-editor, .cm-content, .cm-embed-block')) {
            return true;
        }

        // 2. Active MarkdownView check
        const activeView = this.plugin?.app?.workspace?.getActiveViewOfType(MarkdownView);
        if (activeView && typeof activeView.getMode === 'function') {
            return activeView.getMode() === 'source';
        }

        // 3. Fallback: match by file path across workspace leaves
        const leaves = this.plugin?.app?.workspace?.getLeavesOfType('markdown') || [];
        for (const leaf of leaves) {
            const view = leaf.view as MarkdownView;
            if (view && this.noteFile && view.file?.path === this.noteFile.path) {
                if (typeof view.getMode === 'function') {
                    return view.getMode() === 'source';
                }
            }
        }

        return false;
    }

    private render(): void {
        const { containerEl } = this;
        containerEl.empty();

        const isLive = this.isLivePreviewMode();
        const isToolbarOn = Boolean(this.plugin?.settings?.liveCodeblockToolbar);
        const isExplicitlyTagged = this.language.includes(':sync') || this.language === 'sync';

        // When in Live Preview (editing) and toolbar is OFF (and not explicitly :sync):
        // Render a clean, standard code block with zero complex wrapper DOM or interactive toolbars.
        // This keeps CodeMirror height maps completely stable and allows table insertion without crash.
        if (isLive && !isToolbarOn && !isExplicitlyTagged) {
            const baseLang = this.language.split(':')[0] || this.language;
            const pre = containerEl.createEl('pre', { cls: `language-${baseLang}` });
            const code = pre.createEl('code', { cls: `language-${baseLang}` });
            code.setText(this.source);
            return;
        }

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

        const isSyncTagged = this.language.includes(':sync');
        const baseLang = this.language.split(':')[0] || this.language;

        leftMeta.createSpan({ cls: 'pakcli-lang-badge', text: baseLang.toUpperCase() });
        const statusBadge = leftMeta.createSpan({
            cls: 'pakcli-status-badge',
            text: isSyncTagged ? '⚡ :sync' : '⚡ Script'
        });
        if (isSyncTagged) {
            statusBadge.style.background = 'var(--interactive-accent)';
            statusBadge.style.color = 'var(--text-on-accent)';
        }

        const actions = titleRow.createDiv({ cls: 'pakcli-sync-actions' });

        // Diff Viewer Button
        if (this.noteFile) {
            const diffBtn = actions.createEl('button', { cls: 'pakcli-btn-copy', text: '👁️ Diff' });
            diffBtn.onclick = async () => {
                this.isDiffOpen = !this.isDiffOpen;
                if (this.diffContainerEl) {
                    if (this.isDiffOpen) {
                        this.diffContainerEl.setCssStyles({ display: "block" });
                        diffBtn.setText('👁️ Hide');
                        const status = await this.syncManager.getSyncStatus(this.noteFile!, this.source, baseLang);
                        if (status.cliCode) {
                            renderDiffViewer(this.diffContainerEl, status.cliCode, this.source);
                        } else {
                            this.diffContainerEl.setText(status.statusLabel);
                        }
                    } else {
                        this.diffContainerEl.setCssStyles({ display: "none" });
                        diffBtn.setText('👁️ Diff');
                    }
                }
            };
        }

        // Run Script Button with Confirmation (Default for .ps1) and Ctrl+C Cancellation
        const runBtn = actions.createEl('button', { cls: 'pakcli-btn-run', text: '▶ Run' });

        let isRunning = false;

        const stopExecution = () => {
            if (isRunning && this.activeCancel) {
                this.activeCancel();
                new Notice('⏹️ Script execution stopped (Ctrl+C)');
                runBtn.setText('⏳ Stopping...');
                runBtn.disabled = true;
            }
        };

        const doRun = async () => {
            isRunning = true;
            runBtn.disabled = false;
            runBtn.setText('⏹️ Stop (Ctrl+C)');
            runBtn.addClass('is-running');

            // Wire Ctrl+C / Escape keyboard listener during execution
            if (this.keydownHandler) {
                window.removeEventListener('keydown', this.keydownHandler, true);
            }
            this.keydownHandler = (e: KeyboardEvent) => {
                if ((e.ctrlKey && (e.key === 'c' || e.key === 'C')) || e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    stopExecution();
                }
            };
            window.addEventListener('keydown', this.keydownHandler, true);

            try {
                if (this.outputContainerEl) {
                    this.outputContainerEl.setCssStyles({ display: 'block' });
                    this.outputContainerEl.setText('⏳ Executing script via local shell...\n(Press Ctrl+C or click Stop to cancel)');
                }

                const cliPath = this.noteFile ? this.syncManager.resolveCliPath(this.noteFile.path, baseLang) : null;
                const res = await this.syncManager.runScript(
                    this.source,
                    baseLang,
                    cliPath,
                    (cancel) => {
                        this.activeCancel = cancel;
                    }
                );

                if (this.outputContainerEl) {
                    const text = res.stdout || (res.stderr ? `Error:\n${res.stderr}` : `(Exit code: ${res.exitCode})`);
                    this.outputContainerEl.setText(text);
                }
            } catch (err: any) {
                new Notice('Execution error: ' + (err?.message || String(err)));
                if (this.outputContainerEl) {
                    this.outputContainerEl.setText(`Execution error: ${err?.message || String(err)}`);
                }
            } finally {
                isRunning = false;
                this.activeCancel = null;
                if (this.keydownHandler) {
                    window.removeEventListener('keydown', this.keydownHandler, true);
                    this.keydownHandler = null;
                }
                runBtn.disabled = false;
                runBtn.removeClass('is-running');
                runBtn.setText('▶ Run');
            }
        };

        runBtn.onclick = () => {
            if (isRunning) {
                stopExecution();
                return;
            }

            const isPs = baseLang === 'powershell' || baseLang === 'ps1' || baseLang === 'pwsh';
            const shouldConfirm = isPs && (this.plugin?.settings?.confirmBeforeRunPs1 !== false);

            if (shouldConfirm) {
                const cliPath = this.noteFile ? this.syncManager.resolveCliPath(this.noteFile.path, baseLang) : null;
                const previewSnippet = this.source.trim().split('\n').slice(0, 4).join('\n');
                new ConfirmModal(this.plugin.app, {
                    title: 'Execute PowerShell Script?',
                    message: 'Do you want to run this PowerShell (.ps1) script on your machine?',
                    detail: cliPath ? `Path: ${cliPath}` : `Preview:\n${previewSnippet}${this.source.length > 100 ? '\n...' : ''}`,
                    confirmLabel: '▶ Run Script',
                    cancelLabel: 'Cancel',
                    onConfirm: () => {
                        void doRun();
                    }
                }).open();
            } else {
                void doRun();
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
        const baseLang = this.language.split(':')[0] || this.language;
        const code = pre.createEl('code', { cls: `language-${baseLang}` });
        code.textContent = this.source;
    }
}
