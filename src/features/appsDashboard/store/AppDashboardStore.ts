import { AppScanner } from "../services/AppScanner";
import { CliBridge } from "../services/CliBridge";
import type {
  AppScanRecord,
  HealthStatusResponse,
  DeployLogChunk,
  AppsDashboardSettings,
} from "../types";

export type StoreListener = () => void;

export class AppDashboardStore {
  private scanner = new AppScanner();
  private bridge = new CliBridge();
  private listeners: Set<StoreListener> = new Set();
  private settings: AppsDashboardSettings;

  public apps: AppScanRecord[] = [];
  public health: HealthStatusResponse | null = null;
  public isScanning = false;
  public selectedApp: AppScanRecord | null = null;
  public activeDeployLogs: DeployLogChunk[] = [];
  public isDeploying = false;
  public filterQuery = "";
  private activeDeployCancel?: () => void;

  constructor(settings: AppsDashboardSettings) {
    this.settings = settings;
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
    this.settings = newSettings;
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
        this.settings.demoMode
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
    return this.apps.filter((app) => {
      const q = this.filterQuery;
      return (
        app.folderName.toLowerCase().includes(q) ||
        app.absolutePath.toLowerCase().includes(q) ||
        (app.git.remoteUrl && app.git.remoteUrl.toLowerCase().includes(q)) ||
        (app.hosting.firebase && app.hosting.firebase.siteId.toLowerCase().includes(q)) ||
        (app.hosting.githubPages && app.hosting.githubPages.url.toLowerCase().includes(q))
      );
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

  public async getHistoryForSelectedApp() {
    if (!this.selectedApp) return [];
    return this.bridge.getGitHistory(this.selectedApp.absolutePath, this.settings.demoMode);
  }
}
