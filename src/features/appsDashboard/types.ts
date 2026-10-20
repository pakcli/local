// ─── Apps Dashboard & Static Hosting Manager Contract Types ───────────────────

export interface GitInfo {
  isRepo: boolean;
  currentBranch?: string;
  remoteUrl?: string;
  isClean: boolean;
  uncommittedCount: number;
  aheadCount: number;
  behindCount: number;
}

export interface FirebaseHostConfig {
  configured: boolean;
  siteId: string;
  project: string;
  publicDir: string;
  liveUrl: string;
  lastDeployTimestamp?: number;
  lastDeployHash?: string;
  status: "live" | "unknown";
}

export interface GitHubPagesHostConfig {
  configured: boolean;
  branch: string;
  url: string;
  customDomain?: string;
  enabled: boolean;
}

export interface HostingInfo {
  firebase?: FirebaseHostConfig;
  githubPages?: GitHubPagesHostConfig;
}

export interface AppCatalogMeta {
  title?: string;
  category?: string;
  fileSize?: string;
  tags?: string[];
  overview?: string;
  badge?: string;
  img?: string;
  thumbnail?: string;
  linkLive?: string;
  linkPlayground?: string;
  linkGithub?: string;
}

export interface AppScanRecord {
  id: string; // Hash unik dari path
  folderName: string;
  absolutePath: string;
  isMonorepoRoot: boolean;
  monorepoPackages?: string[];
  git: GitInfo;
  hosting: HostingInfo;
  catalog?: AppCatalogMeta;
}

export interface CliHealth {
  installed: boolean;
  version?: string;
  userEmail?: string;
}

export interface HealthStatusResponse {
  server: {
    status: "connected" | "disconnected";
    version: string;
    uptimeSeconds: number;
    port: number;
  };
  cli: {
    firebase: CliHealth;
    git: CliHealth;
    gh: CliHealth;
  };
}

export interface DeployRequest {
  appId: string;
  provider: "firebase" | "github_pages";
  mode: "production" | "preview";
  previewChannel?: string;
}

export interface DeployLogChunk {
  timestamp: number;
  appId: string;
  stream: "stdout" | "stderr";
  line: string;
  percent?: number;
  isComplete?: boolean;
  exitCode?: number;
  liveUrl?: string;
}

export interface GitCommitRecord {
  hash: string;
  shortHash: string;
  message: string;
  date: string;
  author: string;
  isLive?: boolean;
}

export interface AppsDashboardSettings {
  appsRootFolder: string;
  scanDepth: number;
  serverPort: number;
  theme: "system" | "light" | "dark";
  copyFormat: "tsv" | "plain";
  demoMode: boolean;
  visibleColumns: string[];
}

export const DEFAULT_VISIBLE_COLUMNS: string[] = [
  "folderName",
  "path",
  "githubRepo",
  "staticHost",
  "actions",
];

export interface ColumnMetadataChoice {
  id: string;
  label: string;
  category: "core" | "catalog";
}

export const ALL_AVAILABLE_COLUMNS: ColumnMetadataChoice[] = [
  { id: "folderName", label: "Folder", category: "core" },
  { id: "path", label: "Path", category: "core" },
  { id: "githubRepo", label: "GitHub Repo", category: "core" },
  { id: "staticHost", label: "Static Host", category: "core" },
  { id: "title", label: "Title", category: "catalog" },
  { id: "category", label: "Category", category: "catalog" },
  { id: "badge", label: "Badge", category: "catalog" },
  { id: "fileSize", label: "File Size", category: "catalog" },
  { id: "tags", label: "Tags", category: "catalog" },
  { id: "overview", label: "Overview", category: "catalog" },
  { id: "thumbnail", label: "Thumbnail", category: "catalog" },
  { id: "liveLink", label: "Live Link", category: "catalog" },
  { id: "actions", label: "Actions", category: "core" },
];

export const DEFAULT_APPS_DASHBOARD_SETTINGS: AppsDashboardSettings = {
  appsRootFolder: "root/apps/",
  scanDepth: 1,
  serverPort: 4747,
  theme: "system",
  copyFormat: "tsv",
  demoMode: false,
  visibleColumns: [...DEFAULT_VISIBLE_COLUMNS],
};
