/**
 * SyncCodeblockRenderer.ts
 *
 * Renders the Two-Section Codeblock:
 *   - Section 1: Interactive Sync Controller, Diff Viewer & Script Runner
 *   - Section 2: Formatted Codeblock with Copy Button
 *
 * Directly based on proven stable architecture from commit cad553d2241fad7afc31bb0379d8ffdb2b7c4f01.
 */
import { MarkdownRenderChild, Notice, TFile } from 'obsidian';
import { SyncManager } from '../SyncManager';
import { renderDiffViewer } from '../diffViewer';

export class SyncCodeblockRenderer extends MarkdownRenderChild {
    private syncManager: SyncManager;
    private source: string;
    private language: string;
    private plugin: any;
    private noteFile: TFile | null = null;

    private isDiffOpen = false;
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

    private getBaseLanguage(): string {
        return (this.language.split(':')[0] || this.language).trim().toLowerCase();
    }

    private shouldShowToolbar(): boolean {
        // Show toolbar if explicitly tagged with :sync OR if liveCodeblockToolbar is toggled ON
        if (this.language.includes(':sync')) return true;
        return Boolean(this.plugin?.settings?.liveCodeblockToolbar);
    }

    private render(): void {
        const { containerEl } = this;
        containerEl.empty();

        if (!this.shouldShowToolbar()) {
            const baseLang = this.getBaseLanguage();
            const pre = containerEl.createEl('pre', { cls: 'pakcli-codeblock' });
            const code = pre.createEl('code', { cls: `language-${baseLang}` });
            code.textContent = this.source;
            return;
        }

        containerEl.addClass('pakcli-codeblock-container');

        // SECTION 1: Sync Controller & Runner Header
        const section1 = containerEl.createDiv({ cls: 'pakcli-sync-header' });
        this.renderControllerHeader(section1);

        // Diff Viewer (Expandable Drawer)
        this.diffContainerEl = containerEl.createDiv({ cls: 'pakcli-diff-drawer' });
        this.diffContainerEl.setCssStyles({ display: 'none' });

        // Script Output Terminal Drawer
        this.outputContainerEl = containerEl.createDiv({ cls: 'pakcli-output-drawer' });
        this.outputContainerEl.setCssStyles({ display: 'none' });

        // SECTION 2: Codeblock View
        const section2 = containerEl.createDiv({ cls: 'pakcli-codeblock-section' });
        this.renderCodeblockBody(section2);
    }

    private getNoteFile(): TFile | null {
        if (this.noteFile) return this.noteFile;
        const app = this.plugin?.app;
        const active = app?.workspace?.getActiveFile?.();
        if (active instanceof TFile) {
            this.noteFile = active;
            return active;
        }
        return null;
    }

    private renderControllerHeader(headerEl: HTMLElement): void {
        const titleRow = headerEl.createDiv({ cls: 'pakcli-sync-title-row' });
        const leftMeta = titleRow.createDiv({ cls: 'pakcli-sync-meta' });

        const baseLang = this.getBaseLanguage();
        const isSyncTagged = this.language.includes(':sync');

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

        // Diff Viewer Button - always available
        const diffBtn = actions.createEl('button', { cls: 'pakcli-btn-copy pakcli-sync-btn', text: '👁️ Diff' });
        diffBtn.onclick = async () => {
            this.plugin?.resetScriptSyncAutoOffTimer?.();
            this.isDiffOpen = !this.isDiffOpen;
            if (this.diffContainerEl) {
                if (this.isDiffOpen) {
                    this.diffContainerEl.setCssStyles({ display: 'block' });
                    diffBtn.setText('👁️ Hide');

                    const noteFile = this.getNoteFile();
                    if (!noteFile) {
                        this.diffContainerEl.empty();
                        this.diffContainerEl.setText('⚠️ Note file reference not found. Click into the note to view diff.');
                        return;
                    }

                    try {
                        const status = await this.syncManager.getSyncStatus(noteFile, this.source, baseLang);
                        if (status && status.cliCode !== undefined) {
                            renderDiffViewer(this.diffContainerEl, {
                                leftText: status.cliCode,
                                rightText: this.source,
                                leftLabel: 'CLI Script',
                                rightLabel: 'Manager Note',
                                onApplyToLeft: async () => {
                                    await this.syncManager.executeSync(noteFile, 'manager_to_cli', this.source, baseLang);
                                    new Notice('✅ Applied Manager note to CLI script file');
                                },
                                onApplyToRight: async () => {
                                    await this.syncManager.executeSync(noteFile, 'cli_to_manager', undefined, baseLang);
                                    new Notice('✅ Applied CLI script to Manager note');
                                }
                            });
                        } else {
                            this.diffContainerEl.empty();
                            this.diffContainerEl.setText(status?.statusLabel || 'No target script file found for comparison.');
                        }
                    } catch (err: any) {
                        this.diffContainerEl.empty();
                        this.diffContainerEl.setText(`Diff error: ${err?.message || err}`);
                    }
                } else {
                    this.diffContainerEl.setCssStyles({ display: 'none' });
                    diffBtn.setText('👁️ Diff');
                }
            }
        };

        // Run Script Button
        const runBtn = actions.createEl('button', { cls: 'pakcli-btn-run pakcli-sync-btn', text: '▶ Run' });
        runBtn.onclick = async () => {
            this.plugin?.resetScriptSyncAutoOffTimer?.();
            runBtn.disabled = true;
            runBtn.setText('⏳ Running...');
            try {
                if (this.outputContainerEl) {
                    this.outputContainerEl.setCssStyles({ display: 'block' });
                    this.outputContainerEl.empty();
                    this.outputContainerEl.setText('⏳ Executing script via local shell...');
                }

                const noteFile = this.getNoteFile();
                const cliPath = noteFile ? this.syncManager.resolveCliPath(noteFile.path, baseLang) : null;
                const res = await this.syncManager.runScript(this.source, baseLang, cliPath);

                if (this.outputContainerEl) {
                    this.outputContainerEl.empty();
                    const text = res.stdout || (res.stderr ? `Error:\n${res.stderr}` : `(Exit code: ${res.exitCode})`);
                    this.outputContainerEl.setText(text);
                }
            } catch (err: any) {
                new Notice('Execution error: ' + (err?.message || String(err)));
                if (this.outputContainerEl) {
                    this.outputContainerEl.empty();
                    this.outputContainerEl.setText('Error: ' + (err?.message || String(err)));
                }
            } finally {
                runBtn.disabled = false;
                runBtn.setText('▶ Run');
            }
        };

        // Copy Button
        const copyBtn = actions.createEl('button', { cls: 'pakcli-btn-copy pakcli-sync-btn', text: '📋 Copy' });
        copyBtn.onclick = (e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(this.source);
            copyBtn.setText('✅ Copied!');
            window.setTimeout(() => copyBtn.setText('📋 Copy'), 1500);
        };
    }

    private renderCodeblockBody(section2: HTMLElement): void {
        const baseLang = this.getBaseLanguage();
        const codeBody = section2.createDiv({ cls: 'pakcli-codeblock-body' });
        // Clean pre element WITHOUT pakcli-codeblock-flowclip to prevent external panel MutationObserver interference
        const pre = codeBody.createEl('pre', { cls: 'pakcli-codeblock' });
        const code = pre.createEl('code', { cls: `language-${baseLang}` });
        code.textContent = this.source;
    }
}
