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

export interface AppScanRecord {
  id: string; // Hash unik dari path
  folderName: string;
  absolutePath: string;
  isMonorepoRoot: boolean;
  monorepoPackages?: string[];
  git: GitInfo;
  hosting: HostingInfo;
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
}

export const DEFAULT_APPS_DASHBOARD_SETTINGS: AppsDashboardSettings = {
  appsRootFolder: "~/apps",
  scanDepth: 1,
  serverPort: 4747,
  theme: "system",
  copyFormat: "tsv",
  demoMode: false,
};
