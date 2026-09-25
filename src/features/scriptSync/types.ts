/**
 * types.ts - Data contracts for Two-Section Codeblock & Folder Sync Manager
 */

export type SyncStatusType = 
    | 'synced'
    | 'manager_modified'
    | 'cli_modified'
    | 'conflict'
    | 'not_mapped'
    | 'cli_missing';

export interface CodeBlockMatch {
    language: string;
    tag?: string; // e.g. "sync" if tagged as ```powershell:sync
    code: string;
    startIndex: number;
    endIndex: number;
    blockIndex: number; // 0-based index among candidate script codeblocks
    header: string; // The ```lang:tag line
    matchedRule?: 'explicit_tag' | 'frontmatter_index' | 'language_filter';
}

/** Backward compatible alias */
export type CodeBlockExtractResult = CodeBlockMatch;

export interface SyncStatusResult {
    status: SyncStatusType;
    statusLabel: string;
    cliPath: string | null;
    managerCode: string;
    cliCode: string;
    language: string;
    lastSyncedTime?: number;
    matchedBlockIndex?: number;
    matchedBlockTag?: string;
    totalScriptBlocks?: number;
    isFrontmatterOverride?: boolean;
}

export interface PendingSyncItem {
    id: string;
    notePath: string;
    cliPath: string;
    direction: 'manager_to_cli' | 'cli_to_manager';
    timestamp: number;
    language: string;
    summary: string;
}

export type SyncStrategy = 'language_first' | 'explicit_tag_only';

export interface ScriptNoteFrontmatter {
    cli_name?: string;
    sync_codeblock?: number;
    [key: string]: any;
}

export interface FolderSyncSettings {
    enabled: boolean;
    liveCodeblockToolbar: boolean;
    autoTurnOffToolbar: boolean;
    autoTurnOffDelaySeconds: number;
    cliRootFolder: string;
    managerRootFolder: string; // Vault-relative path, e.g. "Digital Library/CLI & Commands"
    languageExtensionMap: Record<string, string>;
    autoWatchCliFolder: boolean;
    syncStrategy: SyncStrategy;
    pendingChanges: PendingSyncItem[];
    ignoredHashes: Record<string, string>; // notePath -> last ignored hash pair
}

export const DEFAULT_FOLDER_SYNC_SETTINGS: FolderSyncSettings = {
    enabled: true,
    liveCodeblockToolbar: false,
    autoTurnOffToolbar: true,
    autoTurnOffDelaySeconds: 60,
    cliRootFolder: 'Scripts',
    managerRootFolder: 'Digital Library/CLI & Commands',
    languageExtensionMap: {
        powershell: 'ps1',
        ps1: 'ps1',
        pwsh: 'ps1',
        cmd: 'cmd',
        bat: 'bat',
        batch: 'bat',
        dos: 'bat',
        bash: 'sh',
        sh: 'sh',
        gitbash: 'sh',
        zsh: 'sh',
        shell: 'sh',
        python: 'py',
        py: 'py',
        javascript: 'js',
        js: 'js',
        typescript: 'ts',
        ts: 'ts',
        sql: 'sql',
        json: 'json',
        yaml: 'yaml',
        yml: 'yml',
        markdown: 'md',
        md: 'md'
    },
    autoWatchCliFolder: true,
    syncStrategy: 'language_first',
    pendingChanges: [],
    ignoredHashes: {}
};
