export enum ViewMode {
  Changes = 'changes',
  Stash = 'stash',
  History = 'history',
}

export enum RepoStatus {
  Clean = 'clean',
  Dirty = 'dirty',
  Staged = 'staged',
  Conflict = 'conflict',
  Snapshotted = 'snapshotted',
}

export interface FileChangeEntry {
  path: string;
  status: string;
  staged: boolean;
  oldPath?: string;
}

export interface RepoInfo {
  name: string;
  absPath: string;
  isSymlink: boolean;
  currentBranch: string;
  status: RepoStatus;
  aheadBehind: { ahead: number; behind: number };
  snapshotCount: number;
  lastSnapshot?: string;
  stagedFiles: FileChangeEntry[];
  unstagedFiles: FileChangeEntry[];
  untrackedFiles: FileChangeEntry[];
  mode?: RepoTargetMode;
  remoteUrl?: string;
}

export interface SnapshotEntry {
  ref: string;        // refs/snapshots/yyyy-mm-dd_hh-mm_...
  label: string;
  timestamp: string;
  sha: string;
  repoPath: string;
  filesCount?: number;
}

export interface CommitEntry {
  sha: string;
  shortSha: string;
  message: string;
  author: string;
  date: string;
  relativeDate: string;
}

export type RepoTargetMode = 'local-only' | 'github';

export interface RepoRemoteConfig {
  path: string;
  mode: RepoTargetMode;
  remoteUrl?: string;
  defaultBranch?: string;
  autoPushOnCommit?: boolean;
  lastSyncTime?: string;
}

export interface ResolvedArea {
  targetType: 'folder' | 'file';
  absPath: string;           // file or folder absolute path
  areaFolderPath: string;    // always the containing directory
  areaFolderName: string;    // directory basename
  isGitRepo: boolean;        // true if areaFolderPath has a .git
  gitRootPath?: string;      // root of the repo (area or ancestor)
  relativeFilePath?: string; // relative to git root (if target was a file)
}

export interface GitManagerSettings {
  watchedPaths: string[];
  defaultViewMode: ViewMode;
  bypassConsentGiven: boolean;
  retentionCount: number;
  includeUntracked: boolean;
  repoConfigs: Record<string, RepoRemoteConfig>;
}

export const DEFAULT_GIT_MANAGER_SETTINGS: GitManagerSettings = {
  watchedPaths: [],
  defaultViewMode: ViewMode.Changes,
  bypassConsentGiven: false,
  retentionCount: 20,
  includeUntracked: false,
  repoConfigs: {},
};
