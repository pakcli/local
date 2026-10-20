import { setIcon } from "obsidian";
import type { AppDashboardStore } from "../../store/AppDashboardStore";

export class DiagnosticBar {
  public containerEl: HTMLElement;
  private store: AppDashboardStore;
  private onOpenSettings: () => void;

  constructor(parentEl: HTMLElement, store: AppDashboardStore, onOpenSettings: () => void) {
    this.store = store;
    this.onOpenSettings = onOpenSettings;
    this.containerEl = parentEl.createDiv({ cls: "pakcli-dashboard-diagnostic-bar" });
    this.render();
  }

  public render() {
    this.containerEl.empty();

    // Row 1: Folder summary, app count, and actions
    const row1 = this.containerEl.createDiv({ cls: "pakcli-diag-row pakcli-diag-main-row" });

    const leftCol = row1.createDiv({ cls: "pakcli-diag-left" });
    leftCol.createSpan({ cls: "pakcli-diag-title", text: "APPS DASHBOARD" });
    const folderPath = this.store.getSettings().appsRootFolder || "root/apps/";
    leftCol.createSpan({
      cls: "pakcli-diag-folder text-muted",
      text: `Folder: ${folderPath} (${this.store.apps.length} apps)`,
    });

    const rightCol = row1.createDiv({ cls: "pakcli-diag-right" });

    // Rescan button
    const rescanBtn = rightCol.createEl("button", {
      cls: "pakcli-diag-btn",
      attr: { type: "button", title: "Rescan ~/apps directory" },
    });
    const rescanIcon = rescanBtn.createSpan({ cls: "pakcli-diag-icon" });
    setIcon(rescanIcon, "refresh-cw");
    rescanBtn.createSpan({ text: this.store.isScanning ? "Scanning..." : "Rescan" });
    if (this.store.isScanning) {
      rescanBtn.disabled = true;
      rescanBtn.addClass("is-loading");
    }
    rescanBtn.addEventListener("click", () => {
      void this.store.rescan();
    });

    // Settings button
    const settingsBtn = rightCol.createEl("button", {
      cls: "pakcli-diag-btn",
      attr: { type: "button", title: "Open Dashboard Settings" },
    });
    const setIconEl = settingsBtn.createSpan({ cls: "pakcli-diag-icon" });
    setIcon(setIconEl, "settings");
    settingsBtn.createSpan({ text: "Settings" });
    settingsBtn.addEventListener("click", () => {
      this.onOpenSettings();
    });

    // Row 2: Status badges (Server, Firebase CLI, Git CLI)
    const row2 = this.containerEl.createDiv({ cls: "pakcli-diag-row pakcli-diag-status-row" });

    const serverStatus = this.store.health?.server.status || "connected";
    const fbInstalled = this.store.health?.cli.firebase.installed ?? true;
    const gitInstalled = this.store.health?.cli.git.installed ?? true;

    // Server badge
    const srvBadge = row2.createSpan({
      cls: `pakcli-status-badge ${serverStatus === "connected" ? "is-ok" : "is-error"}`,
    });
    srvBadge.createSpan({ cls: "pakcli-status-dot" });
    srvBadge.createSpan({
      text: `Server: 127.0.0.1:4747 (${serverStatus === "connected" ? "connected" : "disconnected"})`,
    });

    // Firebase CLI badge
    const fbBadge = row2.createSpan({
      cls: `pakcli-status-badge ${fbInstalled ? "is-ok" : "is-warning"}`,
    });
    fbBadge.createSpan({ cls: "pakcli-status-dot" });
    fbBadge.createSpan({ text: `firebase-cli (${fbInstalled ? "ok" : "missing"})` });

    // Git CLI badge
    const gitBadge = row2.createSpan({
      cls: `pakcli-status-badge ${gitInstalled ? "is-ok" : "is-warning"}`,
    });
    gitBadge.createSpan({ cls: "pakcli-status-dot" });
    gitBadge.createSpan({ text: `git (${gitInstalled ? "ok" : "missing"})` });
  }

  public destroy() {
    this.containerEl.remove();
  }
}
