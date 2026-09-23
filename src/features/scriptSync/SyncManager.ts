/**
 * SyncManager.ts
 *
 * Core engine for two-way synchronization between Manager (.md notes) and CLI (script files).
 * Upgraded with multi-codeblock extraction, mutex anti-loop echo suppression,
 * 1:1 directory tree mirroring, and frontmatter cli_name overrides.
 */
import { App, FileSystemAdapter, Notice, Platform, Plugin, TFile, parseYaml } from 'obsidian';
import { PathUtils, getNodeFs, getNodeChildProcess } from '../../utils/nodeHelpers';
import { FolderSyncSettings, PendingSyncItem, ScriptNoteFrontmatter, SyncStatusResult, SyncStatusType } from './types';
import { extractTargetCodeblock, injectTargetCodeblock, computeNormalizedHash, CodeBlockMatch } from './markdownParser';
import { SyncLockManager } from './syncLock';

export class SyncManager {
    private app: App;
    private plugin: Plugin;
    private getSettings: () => FolderSyncSettings;
    private saveSettings: () => Promise<void>;
    private fileWatchers: any[] = [];
    private syncLockManager: SyncLockManager;
    private watchDebounceTimer: any = null;

    constructor(
        app: App,
        plugin: Plugin,
        getSettings: () => FolderSyncSettings,
        saveSettings: () => Promise<void>
    ) {
        this.app = app;
        this.plugin = plugin;
        this.getSettings = getSettings;
        this.saveSettings = saveSettings;
        this.syncLockManager = new SyncLockManager();
    }

    init(): void {
        if (Platform.isDesktop) {
            this.setupWatcher();
        }
    }

    destroy(): void {
        this.stopWatcher();
        if (this.watchDebounceTimer) {
            clearTimeout(this.watchDebounceTimer);
            this.watchDebounceTimer = null;
        }
    }

    public getSyncLockManager(): SyncLockManager {
        return this.syncLockManager;
    }

    private getVaultRoot(): string {
        if (this.app.vault.adapter instanceof FileSystemAdapter) {
            return this.app.vault.adapter.getBasePath();
        }
        return '';
    }

    private setupWatcher(): void {
        this.stopWatcher();
        if (!Platform.isDesktop) return;
        const fs = getNodeFs();
        if (!fs) return;

        const settings = this.getSettings();
        if (!settings.enabled || !settings.autoWatchCliFolder || !settings.cliRootFolder) return;

        try {
            let targetDir = settings.cliRootFolder.trim();
            if (!PathUtils.isAbsolute(targetDir)) {
                targetDir = PathUtils.join(this.getVaultRoot(), targetDir);
            }

            if (fs.existsSync(targetDir)) {
                const watcher = fs.watch(targetDir, { recursive: true }, (_eventType: string, filename: string | null) => {
                    if (!filename) return;
                    this.handleDiskFileEvent(targetDir, filename);
                });
                this.fileWatchers.push(watcher);
            }
        } catch (err) {
            console.debug('[ScriptSync] Watcher init error:', err);
        }
    }

    private stopWatcher(): void {
        this.fileWatchers.forEach(w => {
            try { w.close(); } catch {
                // Ignore watcher close error
            }
        });
        this.fileWatchers = [];
    }

    private handleDiskFileEvent(targetDir: string, filename: string): void {
        const fullDiskPath = PathUtils.normalize(PathUtils.join(targetDir, filename));
        
        // Mutex check: skip if currently being modified by plugin
        if (this.syncLockManager.isLocked(fullDiskPath)) {
            return;
        }

        if (this.watchDebounceTimer) {
            clearTimeout(this.watchDebounceTimer);
        }

        this.watchDebounceTimer = setTimeout(async () => {
            await this.onDiskFileModified(fullDiskPath);
        }, 300);
    }

    private async onDiskFileModified(diskPath: string): Promise<void> {
        if (this.syncLockManager.isLocked(diskPath)) return;
        const fs = getNodeFs();
        if (!fs || !fs.existsSync(diskPath)) return;

        const ext = PathUtils.extname(diskPath).replace(/^\./, '').toLowerCase();
        const settings = this.getSettings();
        const isScriptExt = Object.values(settings.languageExtensionMap).includes(ext);
        if (!isScriptExt) return;

        const allNotes = this.app.vault.getMarkdownFiles();
        const managerRoot = (settings.managerRootFolder || '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');

        for (const note of allNotes) {
            const normNotePath = note.path.replace(/\\/g, '/');
            if (managerRoot && !normNotePath.startsWith(managerRoot)) {
                continue;
            }

            try {
                const content = await this.app.vault.read(note);
                const frontmatter = this.parseFrontmatter(note, content);
                const targetBlock = extractTargetCodeblock(
                    content,
                    settings.languageExtensionMap,
                    frontmatter,
                    settings.syncStrategy
                );
                if (!targetBlock) continue;

                const expectedCliPath = this.resolveCliPath(note.path, targetBlock.language, frontmatter);
                if (!expectedCliPath) continue;

                if (PathUtils.normalize(expectedCliPath).toLowerCase() === diskPath.toLowerCase()) {
                    if (this.syncLockManager.isLocked(note.path) || this.syncLockManager.isLocked(diskPath)) {
                        return;
                    }

                    const diskContent = await fs.promises.readFile(diskPath, 'utf8');
                    const diskHash = computeNormalizedHash(diskContent);
                    const noteHash = computeNormalizedHash(targetBlock.code);

                    if (diskHash !== noteHash) {
                        console.log(`[ScriptSync] External change detected in ${diskPath}, updating ${note.path}`);
                        await this.executeSync(note, 'cli_to_manager', undefined, targetBlock.language);
                    }
                    break;
                }
            } catch (err) {
                console.debug('[ScriptSync] Error during onDiskFileModified check:', err);
            }
        }
    }

    /** Compute normalized hash of a string. */
    computeHash(text: string): string {
        return computeNormalizedHash(text);
    }

    /**
     * Extracts frontmatter metadata from note cache or raw content.
     */
    parseFrontmatter(noteFile: TFile, content?: string): ScriptNoteFrontmatter | undefined {
        const cached = this.app.metadataCache.getFileCache(noteFile)?.frontmatter;
        if (cached) return cached as ScriptNoteFrontmatter;
        if (content) {
            const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content);
            if (match && match[1]) {
                try {
                    return parseYaml(match[1]) as ScriptNoteFrontmatter;
                } catch {
                    // Ignore YAML parse error
                }
            }
        }
        return undefined;
    }

    /**
     * Resolves the corresponding script path on disk for a given note and language.
     * Mirrors relative subdirectories between managerRootFolder and cliRootFolder.
     * Tier 1: Frontmatter cli_name override.
     * Tier 2: Sanitized note basename + mapped script extension.
     */
    resolveCliPath(notePath: string, language: string, frontmatter?: ScriptNoteFrontmatter): string | null {
        const settings = this.getSettings();
        const rawCliFolder = (settings.cliRootFolder || '').trim();
        if (!rawCliFolder) return null;

        const lang = (language || '').trim().toLowerCase();
        const ext = settings.languageExtensionMap[lang] || lang || 'ps1';

        // Normalize slashes for subfolder matching
        const normNotePath = notePath.replace(/\\/g, '/');
        let relPath = normNotePath;

        const managerRoot = (settings.managerRootFolder || '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
        if (managerRoot) {
            if (relPath === managerRoot) {
                relPath = PathUtils.basename(normNotePath);
            } else if (relPath.startsWith(managerRoot + '/')) {
                relPath = relPath.slice(managerRoot.length).replace(/^\/+/, '');
            }
        }

        const dirName = PathUtils.dirname(relPath);

        // Tier 1: Check frontmatter cli_name
        let targetFileName = '';
        const customName = frontmatter?.cli_name?.trim();
        if (customName) {
            targetFileName = customName;
        } else {
            // Tier 2: Sanitized note basename + mapped extension
            const baseName = PathUtils.basename(relPath).replace(/\.md$/i, '');
            const sanitized = baseName.replace(/[<>:"/\\|?*]/g, '').trim();
            targetFileName = `${sanitized || 'script'}.${ext}`;
        }

        const scriptRel = PathUtils.join(dirName === '.' ? '' : dirName, targetFileName);

        if (PathUtils.isAbsolute(rawCliFolder)) {
            return PathUtils.normalize(PathUtils.join(rawCliFolder, scriptRel));
        } else {
            const vaultRoot = this.getVaultRoot();
            return PathUtils.normalize(PathUtils.join(vaultRoot, rawCliFolder, scriptRel));
        }
    }

    /**
     * Inspects the note's target codeblock vs the CLI script file and determines sync state.
     */
    async getSyncStatus(
        noteFile: TFile,
        activeCode?: string,
        lang?: string,
        existingFrontmatter?: ScriptNoteFrontmatter
    ): Promise<SyncStatusResult> {
        let managerCode = activeCode ?? '';
        let language = lang ?? 'powershell';
        let frontmatter = existingFrontmatter;
        let matchedBlock: CodeBlockMatch | null = null;
        const settings = this.getSettings();

        if (activeCode === undefined || !frontmatter) {
            try {
                const content = await this.app.vault.read(noteFile);
                frontmatter = frontmatter || this.parseFrontmatter(noteFile, content);
                matchedBlock = extractTargetCodeblock(
                    content,
                    settings.languageExtensionMap,
                    frontmatter,
                    settings.syncStrategy
                );
                if (matchedBlock) {
                    managerCode = matchedBlock.code;
                    language = matchedBlock.language;
                }
            } catch {
                // Ignore vault read failure
            }
        }

        const cliPath = this.resolveCliPath(noteFile.path, language, frontmatter);
        if (!cliPath) {
            return {
                status: 'not_mapped',
                statusLabel: 'CLI Root Folder Not Configured',
                cliPath: null,
                managerCode,
                cliCode: '',
                language,
                matchedBlockIndex: matchedBlock?.blockIndex,
                matchedBlockTag: matchedBlock?.tag,
                isFrontmatterOverride: Boolean(frontmatter?.cli_name)
            };
        }

        const fs = getNodeFs();
        if (!fs || !fs.existsSync(cliPath)) {
            return {
                status: 'cli_missing',
                statusLabel: !fs ? 'Desktop Filesystem Required' : 'CLI Script Not Created',
                cliPath,
                managerCode,
                cliCode: '',
                language,
                matchedBlockIndex: matchedBlock?.blockIndex,
                matchedBlockTag: matchedBlock?.tag,
                isFrontmatterOverride: Boolean(frontmatter?.cli_name)
            };
        }

        let cliCode = '';
        try {
            cliCode = await fs.promises.readFile(cliPath, 'utf8');
        } catch {
            return {
                status: 'cli_missing',
                statusLabel: 'Unable to Read CLI Script',
                cliPath,
                managerCode,
                cliCode: '',
                language,
                matchedBlockIndex: matchedBlock?.blockIndex,
                matchedBlockTag: matchedBlock?.tag,
                isFrontmatterOverride: Boolean(frontmatter?.cli_name)
            };
        }

        const managerHash = computeNormalizedHash(managerCode);
        const cliHash = computeNormalizedHash(cliCode);

        // Check if identical
        if (managerHash === cliHash) {
            return {
                status: 'synced',
                statusLabel: 'In Sync',
                cliPath,
                managerCode,
                cliCode,
                language,
                matchedBlockIndex: matchedBlock?.blockIndex,
                matchedBlockTag: matchedBlock?.tag,
                isFrontmatterOverride: Boolean(frontmatter?.cli_name)
            };
        }

        // Check if this difference was previously ignored
        const ignoreKey = `${noteFile.path}:${managerHash}:${cliHash}`;
        if (settings.ignoredHashes[ignoreKey]) {
            return {
                status: 'synced',
                statusLabel: 'In Sync (Ignored Diff)',
                cliPath,
                managerCode,
                cliCode,
                language,
                matchedBlockIndex: matchedBlock?.blockIndex,
                matchedBlockTag: matchedBlock?.tag,
                isFrontmatterOverride: Boolean(frontmatter?.cli_name)
            };
        }

        // Compare modification timestamps to determine primary direction
        let status: SyncStatusType = 'manager_modified';
        let statusLabel = 'Manager Codeblock Modified';

        try {
            const stat = await fs.promises.stat(cliPath);
            const cliMtime = stat.mtimeMs;
            const noteMtime = noteFile.stat.mtime;

            if (cliMtime > noteMtime + 2000) {
                status = 'cli_modified';
                statusLabel = 'CLI Script Modified on Disk';
            } else if (Math.abs(cliMtime - noteMtime) < 2000) {
                status = 'conflict';
                statusLabel = 'Both Modified (Potential Conflict)';
            }
        } catch {
            // Ignore stat errors for missing or inaccessible files
        }

        return {
            status,
            statusLabel,
            cliPath,
            managerCode,
            cliCode,
            language,
            matchedBlockIndex: matchedBlock?.blockIndex,
            matchedBlockTag: matchedBlock?.tag,
            isFrontmatterOverride: Boolean(frontmatter?.cli_name)
        };
    }

    /**
     * Executes the sync operation in the specified direction.
     * Protected by SyncLockManager mutex to prevent echo loops.
     */
    async executeSync(
        noteFile: TFile,
        direction: 'manager_to_cli' | 'cli_to_manager',
        codeToSync?: string,
        language?: string
    ): Promise<boolean> {
        if (!Platform.isDesktop) {
            new Notice('Disk script sync requires desktop Obsidian.');
            return false;
        }
        const fs = getNodeFs();
        if (!fs) return false;

        try {
            const currentContent = await this.app.vault.read(noteFile);
            const frontmatter = this.parseFrontmatter(noteFile, currentContent);
            const settings = this.getSettings();
            const targetBlock = extractTargetCodeblock(
                currentContent,
                settings.languageExtensionMap,
                frontmatter,
                settings.syncStrategy
            );
            const lang = language || targetBlock?.language || 'powershell';
            const cliPath = this.resolveCliPath(noteFile.path, lang, frontmatter);

            if (!cliPath) {
                new Notice('Folder Sync: CLI Root Folder not configured in settings.');
                return false;
            }

            if (direction === 'manager_to_cli') {
                const code = codeToSync ?? (targetBlock ? targetBlock.code : '');
                const targetDir = PathUtils.dirname(cliPath);

                // Acquire mutex lock on disk path and note file
                await this.syncLockManager.withLock(cliPath, async () => {
                    this.syncLockManager.acquire(noteFile.path);
                    try {
                        if (!fs.existsSync(targetDir)) {
                            await fs.promises.mkdir(targetDir, { recursive: true });
                        }
                        await fs.promises.writeFile(cliPath, code, 'utf8');
                    } finally {
                        this.syncLockManager.release(noteFile.path, 350);
                    }
                });

                this.removeFromPending(noteFile.path);
                new Notice(`✓ Synced to CLI: ${PathUtils.basename(cliPath)}`);
                return true;
            } else {
                // CLI -> Manager direction
                if (!fs.existsSync(cliPath)) {
                    new Notice(`Folder Sync: File does not exist at ${cliPath}`);
                    return false;
                }
                const cliContent = await fs.promises.readFile(cliPath, 'utf8');
                const updatedNote = injectTargetCodeblock(currentContent, cliContent, targetBlock, lang);

                // Acquire mutex lock on note file and disk path
                await this.syncLockManager.withLock(noteFile.path, async () => {
                    this.syncLockManager.acquire(cliPath);
                    try {
                        await this.app.vault.modify(noteFile, updatedNote);
                    } finally {
                        this.syncLockManager.release(cliPath, 350);
                    }
                });

                this.removeFromPending(noteFile.path);
                new Notice(`✓ Updated note codeblock from CLI: ${PathUtils.basename(cliPath)}`);
                return true;
            }
        } catch (err) {
            console.error('[FolderSync] executeSync failed:', err);
            new Notice(`Sync failed: ${err instanceof Error ? err.message : String(err)}`);
            return false;
        }
    }

    /** Marks the current diff as ignored. */
    async ignoreSync(noteFile: TFile, managerCode: string, cliCode: string): Promise<void> {
        const settings = this.getSettings();
        const managerHash = computeNormalizedHash(managerCode);
        const cliHash = computeNormalizedHash(cliCode);
        const ignoreKey = `${noteFile.path}:${managerHash}:${cliHash}`;

        settings.ignoredHashes[ignoreKey] = new Date().toISOString();
        this.removeFromPending(noteFile.path);
        await this.saveSettings();
        new Notice('Change ignored for this sync session.');
    }

    /** Defers the prompt and adds it to the pending review queue. */
    async remindLater(noteFile: TFile, direction: 'manager_to_cli' | 'cli_to_manager', lang: string): Promise<void> {
        const settings = this.getSettings();
        const frontmatter = this.parseFrontmatter(noteFile);
        const cliPath = this.resolveCliPath(noteFile.path, lang, frontmatter) || '';

        const item: PendingSyncItem = {
            id: `${noteFile.path}_${Date.now()}`,
            notePath: noteFile.path,
            cliPath,
            direction,
            timestamp: Date.now(),
            language: lang,
            summary: `${PathUtils.basename(noteFile.path)} (${direction === 'manager_to_cli' ? 'Manager → CLI' : 'CLI → Manager'})`
        };

        this.removeFromPending(noteFile.path);
        settings.pendingChanges.push(item);
        await this.saveSettings();
        new Notice('Change deferred to Pending Changes list.');
    }

    private removeFromPending(notePath: string): void {
        const settings = this.getSettings();
        settings.pendingChanges = settings.pendingChanges.filter(i => i.notePath !== notePath);
    }

    /**
     * Executes the script on demand via PowerShell or Bash/Node and returns output.
     */
    async runScript(code: string, language: string, cliPath?: string | null): Promise<{ stdout: string; stderr: string; exitCode: number }> {
        if (!Platform.isDesktop) {
            return {
                stdout: '',
                stderr: 'Script execution on disk is only available in desktop Obsidian (Windows, macOS, Linux).',
                exitCode: 1
            };
        }

        const fs = getNodeFs();
        const cp = getNodeChildProcess();
        if (!cp) {
            return {
                stdout: '',
                stderr: 'Node.js child_process is not available.',
                exitCode: 1
            };
        }

        return new Promise((resolve) => {
            const lang = (language || '').trim().toLowerCase();
            let command = '';

            if (cliPath && fs && fs.existsSync(cliPath)) {
                if (lang === 'powershell' || lang === 'ps1') {
                    command = `powershell -NoProfile -ExecutionPolicy Bypass -File "${cliPath}"`;
                } else if (lang === 'python' || lang === 'py') {
                    command = `python "${cliPath}"`;
                } else if (lang === 'javascript' || lang === 'js') {
                    command = `node "${cliPath}"`;
                } else if (lang === 'bash' || lang === 'sh') {
                    command = `bash "${cliPath}"`;
                } else {
                    command = `"${cliPath}"`;
                }
            } else {
                // Execute inline code via interpreter
                if (lang === 'powershell' || lang === 'ps1') {
                    const encoded = typeof Buffer !== 'undefined' ? Buffer.from(code, 'utf16le').toString('base64') : btoa(unescape(encodeURIComponent(code)));
                    command = `powershell -NoProfile -EncodedCommand ${encoded}`;
                } else if (lang === 'python' || lang === 'py') {
                    const escaped = code.replace(/"/g, '\\"');
                    command = `python -c "${escaped}"`;
                } else if (lang === 'javascript' || lang === 'js') {
                    const escaped = code.replace(/"/g, '\\"');
                    command = `node -e "${escaped}"`;
                } else {
                    command = code;
                }
            }

            cp.exec(command, { timeout: 30000, maxBuffer: 1024 * 1024 }, (err: any, stdout: string, stderr: string) => {
                resolve({
                    stdout: stdout || '',
                    stderr: stderr || (err ? err.message : ''),
                    exitCode: err && typeof err.code === 'number' ? err.code : 0
                });
            });
        });
    }
}
