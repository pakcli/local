import { App, Notice, Plugin, normalizePath } from 'obsidian';
import { GetCopyPipelineItem, GetCopySettings } from './types';
import { getNodeFs, PathUtils } from '../../utils/nodeHelpers';
import { reindexVaultFolder } from '../symlink/reindex';

export class GetCopyManager {
    private app: App;
    private plugin: Plugin;
    private getSettings: () => GetCopySettings;
    private saveSettings: () => Promise<void>;
    private isScanningBatch = false;

    constructor(
        app: App,
        plugin: Plugin,
        getSettings: () => GetCopySettings,
        saveSettings: () => Promise<void>
    ) {
        this.app = app;
        this.plugin = plugin;
        this.getSettings = getSettings;
        this.saveSettings = saveSettings;
    }

    getTodayString(): string {
        const d = new Date();
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    getVaultRoot(): string {
        const adapter = this.app.vault.adapter as { getBasePath?: () => string };
        if (typeof adapter?.getBasePath === 'function') {
            return adapter.getBasePath();
        }
        return '';
    }

    async addPipeline(
        externalDir: string,
        vaultDir: string,
        scanOnAwake: boolean = true,
        readAllSiblings: boolean = true,
        name?: string
    ): Promise<GetCopyPipelineItem> {
        const settings = this.getSettings();
        const normExternal = externalDir.trim();
        const normVault = normalizePath(vaultDir.trim() || '/');
        const label = (name && name.trim()) || PathUtils.basename(normExternal) || 'Copy Pipeline';

        const newItem: GetCopyPipelineItem = {
            id: `gc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            name: label,
            externalDir: normExternal,
            vaultDir: normVault,
            scanOnAwake,
            readAllSiblings,
            lastStatus: 'idle',
            lastCopiedCount: 0,
        };

        settings.getCopyPipelines.push(newItem);
        await this.saveSettings();
        return newItem;
    }

    async updatePipeline(item: GetCopyPipelineItem): Promise<void> {
        const settings = this.getSettings();
        const idx = settings.getCopyPipelines.findIndex((p) => p.id === item.id);
        if (idx !== -1) {
            settings.getCopyPipelines[idx] = { ...item };
            await this.saveSettings();
        }
    }

    async removePipeline(id: string): Promise<void> {
        const settings = this.getSettings();
        settings.getCopyPipelines = settings.getCopyPipelines.filter((p) => p.id !== id);
        await this.saveSettings();
    }

    async removeSelectedPipelines(ids: string[]): Promise<void> {
        const idSet = new Set(ids);
        const settings = this.getSettings();
        settings.getCopyPipelines = settings.getCopyPipelines.filter((p) => !idSet.has(p.id));
        await this.saveSettings();
    }

    async removeAllPipelines(): Promise<void> {
        const settings = this.getSettings();
        settings.getCopyPipelines = [];
        await this.saveSettings();
    }

    async copyPipeline(
        item: GetCopyPipelineItem
    ): Promise<{ success: boolean; copied: number; error?: string }> {
        const fs = getNodeFs();
        if (!fs) {
            const err = 'Desktop Node.js fs is not available.';
            item.lastStatus = 'error';
            item.lastError = err;
            await this.saveSettings();
            return { success: false, copied: 0, error: err };
        }

        const sourcePath = item.externalDir.trim();
        if (!sourcePath || !fs.existsSync(sourcePath)) {
            const err = `External path not found: "${sourcePath}"`;
            item.lastStatus = 'error';
            item.lastError = err;
            await this.saveSettings();
            return { success: false, copied: 0, error: err };
        }

        let sourceStat: any;
        try {
            sourceStat = fs.statSync(sourcePath);
        } catch (e: any) {
            const err = `Cannot access external path: ${e?.message || e}`;
            item.lastStatus = 'error';
            item.lastError = err;
            await this.saveSettings();
            return { success: false, copied: 0, error: err };
        }

        const vaultRoot = this.getVaultRoot();
        if (!vaultRoot) {
            const err = 'Could not resolve Obsidian vault root path.';
            item.lastStatus = 'error';
            item.lastError = err;
            await this.saveSettings();
            return { success: false, copied: 0, error: err };
        }

        const isSingleFileMode = item.readAllSiblings === false;
        const targetRelativeVault = normalizePath(item.vaultDir || '');
        const targetDiskPath = PathUtils.join(vaultRoot, targetRelativeVault);

        item.lastStatus = 'copying';

        try {
            let copiedCount = 0;

            if (isSingleFileMode && !sourceStat.isDirectory()) {
                // Focus on one single file instance
                const srcFile = sourcePath;

                // If targetDiskPath is directory or has no extension, place file inside it
                let destFile = targetDiskPath;
                const hasExt = Boolean(PathUtils.extname(targetDiskPath));
                if (!hasExt || (fs.existsSync(targetDiskPath) && fs.statSync(targetDiskPath).isDirectory())) {
                    destFile = PathUtils.join(targetDiskPath, PathUtils.basename(srcFile));
                }

                const destDir = PathUtils.dirname(destFile);
                if (!fs.existsSync(destDir)) {
                    fs.mkdirSync(destDir, { recursive: true });
                }

                let shouldCopy = true;
                if (fs.existsSync(destFile)) {
                    try {
                        const destStat = fs.statSync(destFile);
                        if (
                            sourceStat.size === destStat.size &&
                            Math.abs(sourceStat.mtimeMs - destStat.mtimeMs) < 1000
                        ) {
                            shouldCopy = false;
                        }
                    } catch {
                        shouldCopy = true;
                    }
                }

                if (shouldCopy) {
                    fs.copyFileSync(srcFile, destFile);
                    copiedCount = 1;
                } else {
                    copiedCount = 0;
                }
            } else {
                // Read all siblings mode (full directory copy)
                let sourceDir = sourcePath;
                if (!sourceStat.isDirectory()) {
                    sourceDir = PathUtils.dirname(sourcePath);
                }

                if (!fs.existsSync(targetDiskPath)) {
                    fs.mkdirSync(targetDiskPath, { recursive: true });
                }

                const ignoredDirs = new Set(['.git', 'node_modules', '.obsidian', '.trash']);
                const ignoredFiles = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini']);

                const copyRecursive = (src: string, dest: string) => {
                    const entries = fs.readdirSync(src, { withFileTypes: true });
                    for (const entry of entries) {
                        const srcEntry = PathUtils.join(src, entry.name);
                        const destEntry = PathUtils.join(dest, entry.name);

                        if (entry.isDirectory()) {
                            if (ignoredDirs.has(entry.name)) continue;
                            if (!fs.existsSync(destEntry)) {
                                fs.mkdirSync(destEntry, { recursive: true });
                            }
                            copyRecursive(srcEntry, destEntry);
                        } else if (entry.isFile() || entry.isSymbolicLink()) {
                            if (ignoredFiles.has(entry.name)) continue;

                            let shouldCopy = true;
                            try {
                                if (fs.existsSync(destEntry)) {
                                    const srcS = fs.statSync(srcEntry);
                                    const destS = fs.statSync(destEntry);
                                    if (
                                        srcS.size === destS.size &&
                                        Math.abs(srcS.mtimeMs - destS.mtimeMs) < 1000
                                    ) {
                                        shouldCopy = false;
                                    }
                                }
                            } catch {
                                shouldCopy = true;
                            }

                            if (shouldCopy) {
                                fs.copyFileSync(srcEntry, destEntry);
                                copiedCount++;
                            }
                        }
                    }
                };

                copyRecursive(sourceDir, targetDiskPath);
            }

            const today = this.getTodayString();
            item.latestCopy = today;
            item.latestCopyTime = new Date().toISOString();
            item.lastStatus = 'success';
            item.lastCopiedCount = copiedCount;
            item.lastError = undefined;

            await this.saveSettings();

            // Refresh Obsidian tree
            await reindexVaultFolder(this.app, targetRelativeVault);

            return { success: true, copied: copiedCount };
        } catch (e: any) {
            const err = `Copy error: ${e?.message || e}`;
            item.lastStatus = 'error';
            item.lastError = err;
            await this.saveSettings();
            return { success: false, copied: 0, error: err };
        }
    }

    async batchRescan(
        itemsToScan?: GetCopyPipelineItem[]
    ): Promise<{ successCount: number; totalCopied: number; errors: string[] }> {
        if (this.isScanningBatch) {
            new Notice('⏳ A batch copy operation is already running...');
            return { successCount: 0, totalCopied: 0, errors: ['Batch already running'] };
        }

        this.isScanningBatch = true;
        const targets = itemsToScan || this.getSettings().getCopyPipelines;
        let successCount = 0;
        let totalCopied = 0;
        const errors: string[] = [];

        try {
            for (let i = 0; i < targets.length; i++) {
                const item = targets[i];
                const res = await this.copyPipeline(item);
                if (res.success) {
                    successCount++;
                    totalCopied += res.copied;
                } else if (res.error) {
                    errors.push(`${item.name || item.externalDir}: ${res.error}`);
                }
            }

            return { successCount, totalCopied, errors };
        } finally {
            this.isScanningBatch = false;
        }
    }

    async runAwakeScan(): Promise<void> {
        const settings = this.getSettings();
        if (!settings.getCopyAutoScanOnAwake) return;

        const today = this.getTodayString();
        const pendingAwake = settings.getCopyPipelines.filter(
            (item) => item.scanOnAwake && item.latestCopy !== today
        );

        if (pendingAwake.length === 0) return;

        console.log(`[PakCLI Get-Copy] Running awake scan for ${pendingAwake.length} pipeline(s)...`);
        const result = await this.batchRescan(pendingAwake);

        if (result.successCount > 0) {
            new Notice(
                `⚡ [PakCLI Get-Copy] Awake scan synced ${result.successCount} pipeline(s) (${result.totalCopied} files copied).`,
                5000
            );
        }
        if (result.errors.length > 0) {
            console.warn('[PakCLI Get-Copy] Awake scan encountered errors:', result.errors);
        }
    }
}
