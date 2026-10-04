import { App, Plugin, TFile, WorkspaceLeaf, MarkdownView, Notice, setIcon } from 'obsidian';
import { RawOpenerSettings, RawFormatRule, RawFileMode, DEFAULT_RAW_RULES } from './types';
import { getAbsoluteFileSystemPath, copyFilesToNativeOsClipboard } from '../../utils/nativeCopy';

export class RawOpenerManager {
    private app: App;
    private plugin: Plugin;
    private getSettings: () => RawOpenerSettings;
    private saveSettings: () => Promise<void>;
    private registeredExtensions: Set<string> = new Set();
    private activeBannerMap: WeakMap<HTMLElement, HTMLElement> = new WeakMap();
    private isApplyingState: boolean = false;

    constructor(
        app: App,
        plugin: Plugin,
        getSettings: () => RawOpenerSettings,
        saveSettings: () => Promise<void>
    ) {
        this.app = app;
        this.plugin = plugin;
        this.getSettings = getSettings;
        this.saveSettings = saveSettings;
    }

    public ensureDetectAllExtensionsEnabled() {
        try {
            const vault = this.app.vault as any;
            if (typeof vault.getConfig === 'function') {
                if (!vault.getConfig('showUnsupportedFiles')) {
                    if (typeof vault.setConfig === 'function') {
                        vault.setConfig('showUnsupportedFiles', true);
                        console.log('[RawOpener] Auto-enabled showUnsupportedFiles (Detect all file extensions)');
                    }
                }
            }
        } catch (e) {
            console.warn('[RawOpener] Could not set showUnsupportedFiles:', e);
        }
    }

    public init() {
        // Ensure Obsidian's native "Detect all file extensions" is ON so scripts appear in File Explorer
        this.ensureDetectAllExtensionsEnabled();

        const settings = this.getSettings();
        if (!settings.rawOpenerEnabled) return;

        // 1. Initial extension registration (per-extension so conflicts don't block other formats)
        const enabledExts = this.getEnabledExtensions();
        const viewRegistry = (this.app as any).viewRegistry;

        for (const ext of enabledExts) {
            const cleanExt = ext.toLowerCase().trim();
            if (!cleanExt || cleanExt === 'md') continue;
            try {
                this.plugin.registerExtensions([cleanExt], 'markdown');
                this.registeredExtensions.add(cleanExt);
            } catch (err) {
                try {
                    if (viewRegistry && typeof viewRegistry.registerExtensions === 'function') {
                        viewRegistry.registerExtensions([cleanExt], 'markdown');
                        this.registeredExtensions.add(cleanExt);
                    }
                } catch {
                    // Already registered or claimed
                }
            }
        }

        // 2. Register Workspace Listeners for automatic mode enforcement
        this.plugin.registerEvent(
            this.app.workspace.on('file-open', (file) => {
                if (file instanceof TFile) {
                    const leaf = this.app.workspace.getActiveViewOfType(MarkdownView)?.leaf;
                    if (leaf) {
                        void this.handleFileLeafChange(leaf, file, true);
                    }
                }
            })
        );

        this.plugin.registerEvent(
            this.app.workspace.on('active-leaf-change', (leaf) => {
                if (leaf && leaf.view instanceof MarkdownView && leaf.view.file) {
                    void this.handleFileLeafChange(leaf, leaf.view.file, false);
                }
            })
        );

        // 3. Register DOM key/paste interceptor for Read-Only protection
        this.registerReadOnlyProtection();
    }

    public destroy() {
        // Clear active banners
        const leaves = this.app.workspace.getLeavesOfType('markdown');
        for (const leaf of leaves) {
            this.removeHeaderBanner(leaf);
        }
    }

    public getEnabledExtensions(): string[] {
        const settings = this.getSettings();
        const userRules = (settings.rawRules && Array.isArray(settings.rawRules)) ? settings.rawRules : [];
        const userMap = new Map<string, RawFormatRule>();
        userRules.forEach(r => {
            if (r?.extension) {
                userMap.set(r.extension.toLowerCase().replace(/^\./, '').trim(), r);
            }
        });

        const allExts = new Set<string>();
        // 1. Check all default formats
        DEFAULT_RAW_RULES.forEach(def => {
            const ext = def.extension.toLowerCase();
            const userRule = userMap.get(ext);
            if (userRule !== undefined) {
                if (userRule.enabled) allExts.add(ext);
            } else {
                if (def.enabled) allExts.add(ext);
            }
        });

        // 2. Add any custom rules defined by user
        userRules.forEach(r => {
            if (r && r.enabled && r.extension) {
                const clean = r.extension.toLowerCase().replace(/^\./, '').trim();
                if (clean) allExts.add(clean);
            }
        });

        return Array.from(allExts);
    }

    public getRule(extension: string): RawFormatRule | undefined {
        const cleanExt = extension.toLowerCase().replace(/^\./, '').trim();
        const settings = this.getSettings();
        const userRule = settings.rawRules?.find(r => r.extension.toLowerCase() === cleanExt);
        if (userRule) return userRule;
        return DEFAULT_RAW_RULES.find(r => r.extension.toLowerCase() === cleanExt);
    }

    public async updateRule(rule: RawFormatRule): Promise<void> {
        const settings = this.getSettings();
        const cleanExt = rule.extension.toLowerCase().replace(/^\./, '').trim();
        const index = settings.rawRules.findIndex(r => r.extension.toLowerCase() === cleanExt);

        if (index >= 0) {
            settings.rawRules[index] = { ...rule, extension: cleanExt };
        } else {
            settings.rawRules.push({ ...rule, extension: cleanExt });
        }

        await this.saveSettings();
        this.syncActiveRegistrations();
        this.refreshActiveLeaves();
    }

    public async removeRule(extension: string): Promise<void> {
        const settings = this.getSettings();
        const cleanExt = extension.toLowerCase().replace(/^\./, '').trim();
        settings.rawRules = settings.rawRules.filter(r => r.extension.toLowerCase() !== cleanExt);

        await this.saveSettings();
        this.syncActiveRegistrations();
        this.refreshActiveLeaves();
    }

    public async addRule(extension: string, mode: RawFileMode = 'live', readOnly: boolean = false, description?: string): Promise<void> {
        const cleanExt = extension.toLowerCase().replace(/^\./, '').trim();
        if (!cleanExt) return;

        await this.updateRule({
            extension: cleanExt,
            enabled: true,
            mode,
            readOnly,
            description: description || `Raw .${cleanExt} File`
        });
    }

    public async toggleRuleEnabled(extension: string): Promise<void> {
        const rule = this.getRule(extension);
        if (rule) {
            rule.enabled = !rule.enabled;
            await this.updateRule(rule);
        }
    }

    public async setExtensionMode(extension: string, mode: RawFileMode): Promise<void> {
        const rule = this.getRule(extension);
        if (rule) {
            rule.mode = mode;
            await this.updateRule(rule);
        }
    }

    public async toggleExtensionReadOnly(extension: string): Promise<void> {
        const rule = this.getRule(extension);
        if (rule) {
            rule.readOnly = !rule.readOnly;
            await this.updateRule(rule);
            new Notice(`[RawOpener] .${extension} Read-Only lock is now ${rule.readOnly ? 'LOCKED 🔒' : 'UNLOCKED 🔓'}`);
        }
    }

    public syncActiveRegistrations() {
        const settings = this.getSettings();
        if (!settings.rawOpenerEnabled) {
            const registeredArr = Array.from(this.registeredExtensions);
            this.syncViewRegistry(registeredArr, []);
            this.registeredExtensions.clear();
            return;
        }

        const targetExts = this.getEnabledExtensions();
        const targetSet = new Set(targetExts);

        const toUnregister: string[] = [];
        const toRegister: string[] = [];

        this.registeredExtensions.forEach(ext => {
            if (!targetSet.has(ext)) {
                toUnregister.push(ext);
            }
        });

        targetExts.forEach(ext => {
            if (!this.registeredExtensions.has(ext)) {
                toRegister.push(ext);
            }
        });

        this.syncViewRegistry(toUnregister, toRegister);

        toUnregister.forEach(ext => this.registeredExtensions.delete(ext));
        toRegister.forEach(ext => this.registeredExtensions.add(ext));
    }

    private syncViewRegistry(toUnregister: string[], toRegister: string[]) {
        const viewRegistry = (this.app as any).viewRegistry;
        if (!viewRegistry) return;

        if (toUnregister.length > 0 && typeof viewRegistry.unregisterExtensions === 'function') {
            try {
                viewRegistry.unregisterExtensions(toUnregister);
            } catch (err) {
                console.warn('[RawOpener] Error unregistering extensions:', err);
            }
        }

        if (toRegister.length > 0 && typeof viewRegistry.registerExtensions === 'function') {
            try {
                viewRegistry.registerExtensions(toRegister, 'markdown');
            } catch (err) {
                console.warn('[RawOpener] Error registering extensions:', err);
            }
        }
    }

    public isManagedFile(file: TFile | null): boolean {
        if (!file || !file.extension) return false;
        const cleanExt = file.extension.toLowerCase().trim();
        if (cleanExt === 'md') return false;
        const settings = this.getSettings();
        if (!settings.rawOpenerEnabled) return false;
        const rule = this.getRule(cleanExt);
        if (rule) return rule.enabled;
        return this.registeredExtensions.has(cleanExt);
    }

    public getLeafMode(leaf: WorkspaceLeaf): RawFileMode {
        const view = leaf.view;
        if (!(view instanceof MarkdownView)) return 'live';
        const state = leaf.getViewState().state;
        if (state?.mode === 'preview') return 'reading';
        if (state?.source === true) return 'source';
        return 'live';
    }

    public ensureExtensionRegistered(extension: string) {
        const cleanExt = extension.toLowerCase().replace(/^\./, '').trim();
        if (!cleanExt || cleanExt === 'md') return;
        if (!this.registeredExtensions.has(cleanExt)) {
            this.registeredExtensions.add(cleanExt);
            const viewRegistry = (this.app as any).viewRegistry;
            if (viewRegistry && typeof viewRegistry.registerExtensions === 'function') {
                try {
                    viewRegistry.registerExtensions([cleanExt], 'markdown');
                } catch (e) {
                    console.warn('[RawOpener] dynamic registerExtensions error:', e);
                }
            }
        }
    }

    public async openFileInMode(file: TFile, mode: RawFileMode, newTab: boolean = false): Promise<WorkspaceLeaf | null> {
        const cleanExt = file.extension.toLowerCase().replace(/^\./, '').trim();
        this.ensureExtensionRegistered(cleanExt);

        let rule = this.getRule(cleanExt);
        if (!rule) {
            await this.addRule(cleanExt, mode, false);
            rule = this.getRule(cleanExt);
        }

        // Find existing leaf displaying this file if already open
        let targetLeaf: WorkspaceLeaf | null = null;
        const leaves = this.app.workspace.getLeavesOfType('markdown');
        for (const l of leaves) {
            if (l.view instanceof MarkdownView && l.view.file?.path === file.path) {
                targetLeaf = l;
                break;
            }
        }

        if (!targetLeaf) {
            targetLeaf = this.app.workspace.getLeaf(newTab ? 'tab' : false);
        }

        this.app.workspace.setActiveLeaf(targetLeaf, { focus: true });

        const stateMode = mode === 'reading' ? 'preview' : 'source';
        const stateSource = mode === 'source';

        this.isApplyingState = true;
        try {
            await targetLeaf.openFile(file, {
                active: true,
                state: {
                    mode: stateMode,
                    source: stateSource
                }
            });

            if (targetLeaf.view instanceof MarkdownView) {
                targetLeaf.view.containerEl.classList.add('is-raw-code-file');
                targetLeaf.view.containerEl.dataset.rawExt = cleanExt;
            }

            await this.applyModeToLeaf(targetLeaf, mode);
            const isReadOnly = rule ? rule.readOnly : this.getSettings().rawDefaultReadOnly;
            this.renderHeaderBanner(targetLeaf, file, rule, mode, isReadOnly);

            new Notice(`📄 [RawOpener] Opened ${file.name} in ${mode === 'live' ? 'Live Preview' : mode === 'source' ? 'Source Mode' : 'Reading View'}`);
            return targetLeaf;
        } catch (err) {
            console.error('[RawOpener] openFile error, attempting setViewState fallback:', err);
            try {
                await targetLeaf.setViewState({
                    type: 'markdown',
                    active: true,
                    state: {
                        file: file.path,
                        mode: stateMode,
                        source: stateSource
                    }
                });
                if (targetLeaf.view instanceof MarkdownView) {
                    targetLeaf.view.containerEl.classList.add('is-raw-code-file');
                    targetLeaf.view.containerEl.dataset.rawExt = cleanExt;
                }
                return targetLeaf;
            } catch (fallbackErr) {
                console.error('[RawOpener] Fallback setViewState failed:', fallbackErr);
                new Notice(`⚠️ Could not open ${file.name} as Raw Markdown.`);
                return null;
            }
        } finally {
            this.isApplyingState = false;
        }
    }

    public async handleFileLeafChange(leaf: WorkspaceLeaf, file: TFile, isInitialOpen: boolean = false) {
        if (this.isApplyingState) return;
        if (!this.isManagedFile(file)) {
            this.removeHeaderBanner(leaf);
            return;
        }

        const ext = file.extension.toLowerCase();
        const rule = this.getRule(ext);
        const settings = this.getSettings();

        const isReadOnly = rule ? rule.readOnly : settings.rawDefaultReadOnly;

        if (leaf.view instanceof MarkdownView) {
            leaf.view.containerEl.classList.add('is-raw-code-file');
            leaf.view.containerEl.dataset.rawExt = ext;
        }

        if (isInitialOpen) {
            const targetMode = rule?.mode || settings.rawDefaultMode || 'live';
            await this.applyModeToLeaf(leaf, targetMode);
            this.renderHeaderBanner(leaf, file, rule, targetMode, isReadOnly);
        } else {
            const currentMode = this.getLeafMode(leaf);
            this.renderHeaderBanner(leaf, file, rule, currentMode, isReadOnly);
        }
    }

    public async applyModeToLeaf(leaf: WorkspaceLeaf, mode: RawFileMode) {
        const view = leaf.view;
        if (!(view instanceof MarkdownView)) return;

        const currentState = leaf.getViewState();
        if (currentState.type !== 'markdown') return;

        let needsUpdate = false;
        const newState = { ...currentState.state };

        if (mode === 'reading') {
            if (newState.mode !== 'preview') {
                newState.mode = 'preview';
                needsUpdate = true;
            }
        } else if (mode === 'source') {
            if (newState.mode !== 'source' || newState.source !== true) {
                newState.mode = 'source';
                newState.source = true;
                needsUpdate = true;
            }
        } else {
            // Live Preview ('live')
            if (newState.mode !== 'source' || newState.source !== false) {
                newState.mode = 'source';
                newState.source = false;
                needsUpdate = true;
            }
        }

        if (needsUpdate) {
            this.isApplyingState = true;
            try {
                await leaf.setViewState({
                    ...currentState,
                    state: newState
                }, { history: false });
            } catch (err) {
                console.error('[RawOpener] Error switching leaf mode:', err);
            } finally {
                this.isApplyingState = false;
            }
        }
    }

    private renderHeaderBanner(
        leaf: WorkspaceLeaf,
        file: TFile,
        rule: RawFormatRule | undefined,
        currentMode: RawFileMode,
        isReadOnly: boolean
    ) {
        const settings = this.getSettings();
        if (!settings.rawShowHeaderBanner) {
            this.removeHeaderBanner(leaf);
            return;
        }

        const view = leaf.view;
        if (!(view instanceof MarkdownView)) return;

        const container = view.containerEl;
        let bannerEl = this.activeBannerMap.get(container);

        if (!bannerEl || !bannerEl.isConnected) {
            bannerEl = document.createElement('div');
            bannerEl.className = 'raw-opener-header-banner';
            // Insert banner right above view content
            const viewContent = container.querySelector('.view-content');
            if (viewContent) {
                container.insertBefore(bannerEl, viewContent);
            } else {
                container.prepend(bannerEl);
            }
            this.activeBannerMap.set(container, bannerEl);
        }

        bannerEl.empty();

        // 1. Extension / Format Info Tag
        const infoBadge = bannerEl.createDiv({ cls: 'raw-opener-badge info' });
        infoBadge.createSpan({ text: `.${file.extension.toLowerCase()}` });
        if (rule?.description) {
            infoBadge.setAttribute('aria-label', rule.description);
        }

        // 2. Actions Group: Copy Text & Copy File (OS)
        const actionsGroup = bannerEl.createDiv({ cls: 'raw-opener-actions-group' });

        // Copy Text Button
        const copyTextBtn = actionsGroup.createEl('button', {
            cls: 'raw-opener-action-btn',
            text: 'Copy Text'
        });
        const textIcon = document.createElement('span');
        textIcon.className = 'raw-opener-btn-icon';
        setIcon(textIcon, 'copy');
        copyTextBtn.prepend(textIcon);
        copyTextBtn.setAttribute('aria-label', 'Copy file text to clipboard');

        copyTextBtn.onclick = async (e) => {
            e.stopPropagation();
            try {
                let content = '';
                if (view.editor) {
                    content = view.editor.getValue();
                } else {
                    content = await this.app.vault.read(file);
                }
                await navigator.clipboard.writeText(content);
                new Notice(`📋 Copied text of "${file.name}" to clipboard`);
            } catch (err) {
                console.error('[RawOpener] Copy text failed:', err);
                new Notice(`⚠️ Failed to copy text: ${String(err)}`);
            }
        };

        // Copy Native OS File Button
        const copyFileBtn = actionsGroup.createEl('button', {
            cls: 'raw-opener-action-btn',
            text: 'Copy File (OS)'
        });
        const fileIcon = document.createElement('span');
        fileIcon.className = 'raw-opener-btn-icon';
        setIcon(fileIcon, 'file-down');
        copyFileBtn.prepend(fileIcon);
        copyFileBtn.setAttribute('aria-label', 'Copy file to Native OS clipboard (can paste in Explorer/Desktop/apps)');

        copyFileBtn.onclick = async (e) => {
            e.stopPropagation();
            const absPath = getAbsoluteFileSystemPath(this.app, file);
            await copyFilesToNativeOsClipboard([absPath], `"${file.name}"`);
        };

        // 4. Read-Only Lock Status & Toggle
        const lockContainer = bannerEl.createDiv({ cls: 'raw-opener-lock-wrapper' });
        const lockBtn = lockContainer.createEl('button', {
            cls: `raw-opener-lock-btn ${isReadOnly ? 'is-locked' : 'is-unlocked'}`
        });

        const lockIcon = document.createElement('span');
        lockIcon.className = 'raw-opener-lock-icon';
        setIcon(lockIcon, isReadOnly ? 'lock' : 'unlock');
        lockBtn.appendChild(lockIcon);
        lockBtn.appendChild(document.createTextNode(isReadOnly ? ' Read-Only' : ' Editable'));
        lockBtn.setAttribute(
            'aria-label',
            isReadOnly ? 'Locked: Click to enable editing' : 'Editable: Click to lock read-only'
        );

        lockBtn.onclick = async (e) => {
            e.stopPropagation();
            if (rule) {
                await this.toggleExtensionReadOnly(file.extension);
            } else {
                await this.addRule(file.extension, currentMode, !isReadOnly);
            }
            this.renderHeaderBanner(leaf, file, this.getRule(file.extension), currentMode, !isReadOnly);
        };
    }

    private removeHeaderBanner(leaf: WorkspaceLeaf) {
        const view = leaf.view;
        if (view instanceof MarkdownView) {
            view.containerEl.classList.remove('is-raw-code-file');
            delete view.containerEl.dataset.rawExt;
            const banner = this.activeBannerMap.get(view.containerEl);
            if (banner && banner.parentNode) {
                banner.parentNode.removeChild(banner);
                this.activeBannerMap.delete(view.containerEl);
            }
        }
    }

    private refreshActiveLeaves() {
        const leaves = this.app.workspace.getLeavesOfType('markdown');
        for (const leaf of leaves) {
            if (leaf.view instanceof MarkdownView && leaf.view.file) {
                void this.handleFileLeafChange(leaf, leaf.view.file);
            }
        }
    }

    private registerReadOnlyProtection() {
        // Intercept keyboard typing / modification events on active editor when Read-Only is active
        this.plugin.registerDomEvent(
            window,
            'keydown',
            (evt: KeyboardEvent) => {
                const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (!activeView || !activeView.file) return;

                if (!this.isManagedFile(activeView.file)) return;

                const rule = this.getRule(activeView.file.extension);
                const isReadOnly = rule ? rule.readOnly : this.getSettings().rawDefaultReadOnly;

                if (!isReadOnly) return;

                // Check if target is inside the active editor
                const target = evt.target as HTMLElement | null;
                if (!target || !activeView.containerEl.contains(target)) return;

                // Allow navigational and standard read shortcuts:
                // Arrows, PageUp/Down, Home, End, Tab navigation, Escape, Ctrl+C (copy), Ctrl+F (find), Ctrl+A (select all), Ctrl+P (command)
                const isModifierKey = evt.ctrlKey || evt.metaKey;
                const key = evt.key.toLowerCase();

                const allowedReadOnlyKeys = [
                    'arrowup', 'arrowdown', 'arrowleft', 'arrowright',
                    'pageup', 'pagedown', 'home', 'end', 'escape', 'tab',
                    'capslock', 'shift', 'control', 'alt', 'meta'
                ];

                if (allowedReadOnlyKeys.includes(key)) {
                    return;
                }

                if (isModifierKey && (key === 'c' || key === 'f' || key === 'a' || key === 'p' || key === 'g')) {
                    return;
                }

                // Prevent editing action
                evt.preventDefault();
                evt.stopPropagation();
                new Notice(`🔒 [RawOpener] .${activeView.file.extension.toUpperCase()} is in Read-Only Mode. Unlock at the top banner to edit.`, 2500);
            },
            true
        );

        // Intercept paste event
        this.plugin.registerDomEvent(
            window,
            'paste',
            (evt: ClipboardEvent) => {
                const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (!activeView || !activeView.file) return;

                if (!this.isManagedFile(activeView.file)) return;

                const rule = this.getRule(activeView.file.extension);
                const isReadOnly = rule ? rule.readOnly : this.getSettings().rawDefaultReadOnly;

                if (!isReadOnly) return;

                const target = evt.target as HTMLElement | null;
                if (target && activeView.containerEl.contains(target)) {
                    evt.preventDefault();
                    evt.stopPropagation();
                    new Notice('🔒 [RawOpener] Paste blocked: File is in Read-Only Mode.', 2500);
                }
            },
            true
        );

        // Intercept cut event
        this.plugin.registerDomEvent(
            window,
            'cut',
            (evt: ClipboardEvent) => {
                const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (!activeView || !activeView.file) return;

                if (!this.isManagedFile(activeView.file)) return;

                const rule = this.getRule(activeView.file.extension);
                const isReadOnly = rule ? rule.readOnly : this.getSettings().rawDefaultReadOnly;

                if (!isReadOnly) return;

                const target = evt.target as HTMLElement | null;
                if (target && activeView.containerEl.contains(target)) {
                    evt.preventDefault();
                    evt.stopPropagation();
                    new Notice('🔒 [RawOpener] Cut blocked: File is in Read-Only Mode.', 2500);
                }
            },
            true
        );
    }
}
