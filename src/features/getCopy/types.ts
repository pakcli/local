export interface GetCopyPipelineItem {
    id: string;
    name?: string;
    externalDir: string;
    vaultDir: string;
    latestCopy?: string; // YYYY-MM-DD
    latestCopyTime?: string; // ISO string
    scanOnAwake: boolean;
    readAllSiblings?: boolean; // true = all siblings/directory, false = focus on single file
    lastStatus?: 'idle' | 'copying' | 'success' | 'error';
    lastCopiedCount?: number;
    lastError?: string;
}

export interface GetCopySettings {
    getCopyPipelines: GetCopyPipelineItem[];
    getCopyAutoScanOnAwake: boolean;
}

export const DEFAULT_GET_COPY_SETTINGS: GetCopySettings = {
    getCopyPipelines: [],
    getCopyAutoScanOnAwake: true,
};
