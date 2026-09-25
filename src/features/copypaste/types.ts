export type FilterMatchMode = 'all' | 'contains' | 'exact' | 'exact_case';

export interface TargetFilterRule {
    id: string;
    name?: string;
    targetPath: string; // Source directory path on local disk
    targetVaultDir?: string; // Destination directory inside Obsidian vault
    pathIncludeMode: FilterMatchMode;
    pathIncludePattern: string;
    filenameMode: FilterMatchMode;
    filenamePattern: string;
    formats: string[]; // e.g. ['md', 'json', 'csv', 'js', 'db', 'docs']
    lastMatchedCount?: number;
    lastMatchedFiles?: string[];
    isScanning?: boolean;
}

export interface DiffPairItem {
    relativePath: string;
    fileName: string;
    sourceAbsPath: string;
    vaultAbsPath: string;
    sourceExists: boolean;
    vaultExists: boolean;
    status: 'modified' | 'identical' | 'only_source' | 'only_vault';
    sourceContent?: string;
    vaultContent?: string;
}

export interface CopyPastePipelineItem {
    id: string;
    name?: string;
    externalDir: string;
    vaultDir: string;
    latestCopy?: string; // YYYY-MM-DD
    latestCopyTime?: string; // ISO string
    scanOnAwake: boolean;
    readAllSiblings?: boolean;
    lastStatus?: 'idle' | 'copying' | 'success' | 'error';
    lastCopiedCount?: number;
    lastError?: string;
}

// Backward compatibility alias
export type GetCopyPipelineItem = CopyPastePipelineItem;

export interface CopyPasteSettings {
    getCopyPipelines: CopyPastePipelineItem[];
    getCopyAutoScanOnAwake: boolean;
    targetRules: TargetFilterRule[];
    targetRulesViewMode?: 'card' | 'table';
}

// Backward compatibility alias
export type GetCopySettings = CopyPasteSettings;

export const DEFAULT_COPYPASTE_SETTINGS: CopyPasteSettings = {
    getCopyPipelines: [],
    getCopyAutoScanOnAwake: true,
    targetRules: [],
    targetRulesViewMode: 'card',
};

export const DEFAULT_GET_COPY_SETTINGS = DEFAULT_COPYPASTE_SETTINGS;
