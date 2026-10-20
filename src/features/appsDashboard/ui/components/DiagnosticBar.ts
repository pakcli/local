import { setIcon } from "obsidian";
import type { AppDashboardStore } from "../../store/AppDashboardStore";
import { maskAccountIdentifier } from "../AccountManagerModal";

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

    // Row 2: Status badges (Server, Firebase CLI, Git CLI) + Privacy Reveal/Mask Button
    const row2 = this.containerEl.createDiv({ cls: "pakcli-diag-row pakcli-diag-status-row" });

    const serverStatus = this.store.health?.server.status || "connected";
    const fbInstalled = this.store.health?.cli.firebase.installed ?? true;
    const gitInstalled = this.store.health?.cli.git.installed ?? true;
    const isMasked = this.store.isPrivacyMasked;

    // Server badge
    const srvBadge = row2.createSpan({
      cls: `pakcli-status-badge ${serverStatus === "connected" ? "is-ok" : "is-error"}`,
    });
    srvBadge.createSpan({ cls: "pakcli-status-dot" });
    srvBadge.createSpan({
      text: `Server: 127.0.0.1:4747 (${serverStatus === "connected" ? "connected" : "disconnected"})`,
    });

    // Firebase CLI badge
    const fbEmail = this.store.health?.cli.firebase.userEmail;
    const fbDisplay = fbEmail ? maskAccountIdentifier(fbEmail, !isMasked) : "ok";
    const fbBadge = row2.createSpan({
      cls: `pakcli-status-badge ${fbInstalled ? "is-ok" : "is-warning"}`,
    });
    fbBadge.createSpan({ cls: "pakcli-status-dot" });
    fbBadge.createSpan({ text: fbInstalled ? `firebase: ${fbDisplay}` : "firebase-cli (missing)" });
    if (fbEmail) {
      fbBadge.title = isMasked ? "Masked for privacy (2 letters). Click 👁️ toggle to reveal" : fbEmail;
    }

    // Git / GitHub CLI badge
    const ghUser = this.store.health?.cli.gh.userEmail || this.store.health?.cli.git.userEmail;
    const ghDisplay = ghUser ? maskAccountIdentifier(ghUser, !isMasked) : "ok";
    const gitBadge = row2.createSpan({
      cls: `pakcli-status-badge ${gitInstalled ? "is-ok" : "is-warning"}`,
    });
    gitBadge.createSpan({ cls: "pakcli-status-dot" });
    gitBadge.createSpan({ text: gitInstalled ? `github: ${ghDisplay}` : "github (missing)" });
    if (ghUser) {
      gitBadge.title = isMasked ? "Masked for privacy (2 letters). Click 👁️ toggle to reveal" : ghUser;
    }

    // Privacy Mask / Reveal Toggle Button
    const privacyBtn = row2.createEl("button", {
      cls: "pakcli-icon-btn clickable-icon pakcli-diag-privacy-btn",
      attr: {
        type: "button",
        title: isMasked
          ? "Reveal sensitive account info across dashboard"
          : "Mask sensitive account info (leave only 2 letters)",
      },
    });
    privacyBtn.style.marginLeft = "auto";
    privacyBtn.style.display = "inline-flex";
    privacyBtn.style.alignItems = "center";
    privacyBtn.style.gap = "4px";
    privacyBtn.style.fontSize = "0.72rem";
    privacyBtn.style.padding = "2px 8px";
    privacyBtn.style.cursor = "pointer";
    privacyBtn.style.borderRadius = "var(--radius-s, 4px)";
    privacyBtn.style.border = "1px solid var(--background-modifier-border)";
    privacyBtn.style.background = "var(--background-primary)";

    const eyeIcon = privacyBtn.createSpan();
    setIcon(eyeIcon, isMasked ? "eye" : "eye-off");
    privacyBtn.createSpan({
      text: isMasked ? "Reveal" : "Mask",
      cls: "text-muted",
    });

    privacyBtn.addEventListener("click", () => {
      this.store.togglePrivacyMask();
    });
  }

  public destroy() {
    this.containerEl.remove();
  }
}
