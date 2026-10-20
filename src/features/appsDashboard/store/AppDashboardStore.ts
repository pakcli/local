import { AppScanner } from "../services/AppScanner";
import { CliBridge } from "../services/CliBridge";
import {
  AppScanRecord,
  HealthStatusResponse,
  DeployLogChunk,
  AppsDashboardSettings,
  DEFAULT_VISIBLE_COLUMNS,
  SystemAccountsInfo,
  FirebaseProjectSummary,
} from "../types";

export type StoreListener = () => void;

export class AppDashboardStore {
  private scanner = new AppScanner();
  private bridge = new CliBridge();
  private listeners: Set<StoreListener> = new Set();
  private settings: AppsDashboardSettings;
  private vaultRoot?: string;
  private onSaveSettings?: (settings: AppsDashboardSettings) => Promise<void> | void;

  public apps: AppScanRecord[] = [];
  public health: HealthStatusResponse | null = null;
  public isScanning = false;
  public selectedApp: AppScanRecord | null = null;
  public activeDeployLogs: DeployLogChunk[] = [];
  public isDeploying = false;
  public filterQuery = "";
  private activeDeployCancel?: () => void;

  constructor(
    settings: AppsDashboardSettings,
    vaultRoot?: string,
    onSaveSettings?: (settings: AppsDashboardSettings) => Promise<void> | void
  ) {
    this.settings = {
      ...settings,
      visibleColumns: settings.visibleColumns && settings.visibleColumns.length > 0
        ? settings.visibleColumns
        : [...DEFAULT_VISIBLE_COLUMNS],
    };
    this.vaultRoot = vaultRoot;
    this.onSaveSettings = onSaveSettings;
  }

  public setVaultRoot(vaultRoot?: string) {
    this.vaultRoot = vaultRoot;
  }

  public getSettings(): AppsDashboardSettings {
    return { ...this.settings };
  }

  public get visibleColumns(): string[] {
    return this.settings.visibleColumns && this.settings.visibleColumns.length > 0
      ? this.settings.visibleColumns
      : [...DEFAULT_VISIBLE_COLUMNS];
  }

  public setVisibleColumns(cols: string[]) {
    this.settings.visibleColumns = cols;
    this.onSaveSettings?.(this.settings);
    this.notify();
  }

  public toggleColumn(colId: string) {
    const current = new Set(this.visibleColumns);
    if (current.has(colId)) {
      if (current.size > 1) {
        current.delete(colId);
      }
    } else {
      current.add(colId);
    }
    this.settings.visibleColumns = Array.from(current);
    this.onSaveSettings?.(this.settings);
    this.notify();
  }

  public subscribe(listener: StoreListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    for (const listener of this.listeners) {
      listener();
    }
  }

  public updateSettings(newSettings: AppsDashboardSettings) {
    this.settings = { ...newSettings };
    this.onSaveSettings?.(this.settings);
    this.notify();
    void this.rescan();
  }

  public async rescan(): Promise<void> {
    this.isScanning = true;
    this.notify();

    try {
      this.health = await this.bridge.checkHealth(this.settings.demoMode);
      this.apps = await this.scanner.scanDirectory(
        this.settings.appsRootFolder,
        this.settings.scanDepth,
        this.settings.demoMode,
        this.vaultRoot,
        this.settings.frontmatterMapping
      );
    } catch (err) {
      console.error("[AppDashboardStore] Rescan failed:", err);
    } finally {
      this.isScanning = false;
      this.notify();
    }
  }

  public selectApp(app: AppScanRecord | null) {
    this.selectedApp = app;
    this.activeDeployLogs = [];
    this.notify();
  }

  public setFilterQuery(query: string) {
    this.filterQuery = query.toLowerCase().trim();
    this.notify();
  }

  public getFilteredApps(): AppScanRecord[] {
    if (!this.filterQuery) return this.apps;
    const q = this.filterQuery;
    return this.apps.filter((app) => {
      if (app.folderName.toLowerCase().includes(q)) return true;
      if (app.absolutePath.toLowerCase().includes(q)) return true;
      if (app.git.remoteUrl && app.git.remoteUrl.toLowerCase().includes(q)) return true;
      if (app.hosting.firebase && app.hosting.firebase.siteId.toLowerCase().includes(q)) return true;
      if (app.hosting.githubPages && app.hosting.githubPages.url.toLowerCase().includes(q)) return true;
      if (app.catalog?.title && app.catalog.title.toLowerCase().includes(q)) return true;
      if (app.catalog?.category && app.catalog.category.toLowerCase().includes(q)) return true;
      if (app.catalog?.badge && app.catalog.badge.toLowerCase().includes(q)) return true;
      if (app.catalog?.tags && app.catalog.tags.some((t) => t.toLowerCase().includes(q))) return true;
      if (app.catalog?.overview && app.catalog.overview.toLowerCase().includes(q)) return true;
      return false;
    });
  }

  public startDeploy(app: AppScanRecord, mode: "production" | "preview" = "production") {
    if (this.isDeploying) return;

    this.isDeploying = true;
    this.activeDeployLogs = [];
    this.notify();

    const provider = app.hosting.firebase?.configured ? "firebase" : "github_pages";

    const { cancel } = this.bridge.streamDeploy(
      {
        appId: app.hosting.firebase?.siteId || app.folderName,
        provider,
        mode,
      },
      app.absolutePath,
      this.settings.demoMode,
      (chunk) => {
        // Enforce 1000 lines ring buffer ceiling
        if (this.activeDeployLogs.length > 1000) {
          this.activeDeployLogs.splice(0, 100);
        }
        this.activeDeployLogs.push(chunk);

        if (chunk.isComplete) {
          this.isDeploying = false;
          if (app.hosting.firebase) {
            app.hosting.firebase.lastDeployTimestamp = Date.now();
          }
        }
        this.notify();
      }
    );

    this.activeDeployCancel = cancel;
  }

  public cancelDeploy() {
    if (this.activeDeployCancel) {
      this.activeDeployCancel();
      this.activeDeployCancel = undefined;
    }
    this.isDeploying = false;
    this.notify();
  }

  public async initGitForApp(app: AppScanRecord): Promise<{ success: boolean; message: string }> {
    const res = await this.bridge.initGitRepo(app.absolutePath);
    if (res.success) {
      await this.rescan();
    }
    return res;
  }

  public async linkRemoteForApp(
    app: AppScanRecord,
    remoteUrl: string
  ): Promise<{ success: boolean; message: string }> {
    const res = await this.bridge.linkGitHubRemote(app.absolutePath, remoteUrl);
    if (res.success) {
      await this.rescan();
    }
    return res;
  }

  public async setupFirebaseForApp(
    app: AppScanRecord,
    siteId: string,
    publicDir?: string
  ): Promise<{ success: boolean; message: string }> {
    const res = await this.bridge.setupFirebaseHosting(app.absolutePath, siteId, publicDir);
    if (res.success) {
      await this.rescan();
    }
    return res;
  }

  public async setupGitHubPagesForApp(
    app: AppScanRecord
  ): Promise<{ success: boolean; message: string }> {
    const res = await this.bridge.setupGitHubPages(app.absolutePath);
    if (res.success) {
      await this.rescan();
    }
    return res;
  }

  public async getHistoryForSelectedApp() {
    if (!this.selectedApp) return [];
    return this.bridge.getGitHistory(this.selectedApp.absolutePath, this.settings.demoMode);
  }

  public async getSystemAccounts(): Promise<SystemAccountsInfo> {
    return this.bridge.getSystemAccountsInfo(this.settings.demoMode);
  }

  public async listFirebaseProjects(): Promise<FirebaseProjectSummary[]> {
    return this.bridge.listFirebaseProjects(this.settings.demoMode);
  }

  public async switchFirebaseAccount(email: string): Promise<{ success: boolean; message: string }> {
    const res = await this.bridge.switchFirebaseAccount(email);
    await this.rescan();
    return res;
  }

  public async logoutFirebaseAccount(email?: string): Promise<{ success: boolean; message: string }> {
    const res = await this.bridge.logoutFirebaseAccount(email);
    await this.rescan();
    return res;
  }

  public openInteractiveFirebaseLogin(): void {
    this.bridge.openInteractiveFirebaseLogin();
  }

  public openInteractiveGitHubLogin(): void {
    this.bridge.openInteractiveGitHubLogin();
  }
}
