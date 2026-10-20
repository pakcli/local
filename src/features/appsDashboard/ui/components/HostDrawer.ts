import { setIcon, Notice, App } from "obsidian";
import type { AppDashboardStore } from "../../store/AppDashboardStore";
import type { AppScanRecord, GitCommitRecord } from "../../types";
import { CopyButton } from "../../../../uiComponents";
import { SetupFirebaseModal } from "../SetupFirebaseModal";
import { AccountManagerModal, maskAccountIdentifier, maskSensitiveUrl } from "../AccountManagerModal";
import { LinkRemoteModal } from "../AppsDashboardView";

export class HostDrawer {
  public containerEl: HTMLElement;
  private store: AppDashboardStore;
  private appInstance?: App;
  private activeTab: "config" | "history" = "config";
  private historyCommits: GitCommitRecord[] = [];
  private logContainerEl?: HTMLElement;
  private rafBatchId: number | null = null;
  private onStopHosting: (app: AppScanRecord) => void;

  constructor(
    parentEl: HTMLElement,
    store: AppDashboardStore,
    onStopHosting: (app: AppScanRecord) => void,
    appInstance?: App
  ) {
    this.store = store;
    this.appInstance = appInstance;
    this.onStopHosting = onStopHosting;
    this.containerEl = parentEl.createDiv({ cls: "pakcli-host-drawer is-closed" });
  }

  public open(app: AppScanRecord) {
    this.containerEl.removeClass("is-closed");
    this.containerEl.addClass("is-open");
    void this.loadDataAndRender(app);
  }

  public close() {
    this.containerEl.removeClass("is-open");
    this.containerEl.addClass("is-closed");
    this.store.selectApp(null);
  }

  private async loadDataAndRender(app: AppScanRecord) {
    if (this.activeTab === "history") {
      this.historyCommits = await this.store.getHistoryForSelectedApp();
    }
    this.render(app);
  }

  public render(app?: AppScanRecord) {
    const targetApp = app || this.store.selectedApp;
    if (!targetApp) {
      this.close();
      return;
    }

    this.containerEl.empty();

    // 1. Drawer Header (Provider badge, site/folder name, close button)
    const header = this.containerEl.createDiv({ cls: "pakcli-drawer-header" });

    const titleRow = header.createDiv({ cls: "pakcli-drawer-title-row" });
    const isFirebase = targetApp.hosting.firebase?.configured;
    const badge = titleRow.createSpan({
      cls: `pakcli-provider-badge ${isFirebase ? "is-fb" : "is-gh"}`,
      text: isFirebase ? "fb" : "gh",
    });
    const siteTitle = targetApp.hosting.firebase?.siteId || targetApp.folderName;
    titleRow.createSpan({ cls: "pakcli-drawer-title-text", text: `${siteTitle}.web.app` });

    const closeBtn = titleRow.createEl("button", {
      cls: "pakcli-drawer-close-btn clickable-icon",
      attr: { type: "button", title: "Close panel (Esc)" },
    });
    setIcon(closeBtn, "x");
    closeBtn.addEventListener("click", () => this.close());

    // 2. Tabs: Config deployment vs Version history
    const tabsBar = this.containerEl.createDiv({ cls: "pakcli-drawer-tabs" });

    const configTab = tabsBar.createDiv({
      cls: `pakcli-drawer-tab ${this.activeTab === "config" ? "is-active" : ""}`,
      text: "> Config deployment <",
    });
    configTab.addEventListener("click", () => {
      this.activeTab = "config";
      this.render(targetApp);
    });

    const historyTab = tabsBar.createDiv({
      cls: `pakcli-drawer-tab ${this.activeTab === "history" ? "is-active" : ""}`,
      text: "Version history",
    });
    historyTab.addEventListener("click", async () => {
      this.activeTab = "history";
      this.historyCommits = await this.store.getHistoryForSelectedApp();
      this.render(targetApp);
    });

    // 3. Body Content
    const body = this.containerEl.createDiv({ cls: "pakcli-drawer-body" });

    if (this.activeTab === "config") {
      this.renderConfigTab(body, targetApp);
    } else {
      this.renderHistoryTab(body, targetApp);
    }
  }

  private renderConfigTab(body: HTMLElement, app: AppScanRecord) {
    const isFirebase = !!app.hosting.firebase?.configured;
    const isGitHubPages = !!app.hosting.githubPages?.configured;
    const hasHost = isFirebase || isGitHubPages;

    // 1. Git Initialization Alert (0 -> 1)
    if (!app.git.isRepo) {
      const gitAlert = body.createDiv({ cls: "pakcli-drawer-alert is-warning" });
      const gitIcon = gitAlert.createSpan();
      setIcon(gitIcon, "alert-circle");
      gitAlert.createSpan({ text: " Git repository not initialized (Status 0). " });
      const initGitBtn = gitAlert.createEl("button", {
        cls: "pakcli-btn-init-git",
        text: "⚡ Initialize Git Repo (0 → 1)",
      });
      initGitBtn.addEventListener("click", async () => {
        initGitBtn.disabled = true;
        initGitBtn.setText("Initializing...");
        const res = await this.store.initGitForApp(app);
        new Notice(res.message);
        this.render(this.store.selectedApp || app);
      });
    }

    // 2. Unconfigured Provider Setup
    if (!hasHost) {
      const setupBox = body.createDiv({ cls: "pakcli-setup-providers-box" });
      setupBox.createEl("h4", { text: "Select Deployment Provider" });
      setupBox.createEl("p", {
        cls: "text-muted",
        text: "Initialize static hosting configuration for this application (Firebase or GitHub Pages).",
      });

      const btnGroup = setupBox.createDiv({ cls: "pakcli-provider-btn-group" });

      // Firebase setup button
      const fbSetupBtn = btnGroup.createEl("button", {
        cls: "pakcli-btn-provider-setup is-fb",
        text: "🔥 Setup Firebase Hosting",
      });
      fbSetupBtn.addEventListener("click", () => {
        if (this.appInstance) {
          new SetupFirebaseModal(this.appInstance, this.store, app, () => {
            this.render(this.store.selectedApp || app);
          }).open();
        } else {
          const siteId = app.folderName.toLowerCase().replace(/[^a-z0-9-]/g, "");
          void this.store.setupFirebaseForApp(app, siteId, ".").then((res) => {
            new Notice(res.message);
            this.render(this.store.selectedApp || app);
          });
        }
      });

      // GitHub Pages setup button
      const ghSetupBtn = btnGroup.createEl("button", {
        cls: "pakcli-btn-provider-setup is-gh",
        text: "🐙 Setup GitHub Pages",
      });
      ghSetupBtn.addEventListener("click", async () => {
        if (!app.git.remoteUrl) {
          new Notice("⚠️ GitHub Pages requires a linked GitHub remote repository first.");
          return;
        }
        const res = await this.store.setupGitHubPagesForApp(app);
        new Notice(res.message);
        this.render(this.store.selectedApp || app);
      });
    }

    const statusText = isFirebase
      ? app.hosting.firebase?.status === "live"
        ? "live · active deployment"
        : "configured"
      : isGitHubPages
      ? "gh-pages branch ready"
      : "not configured";

    const changesCount = app.git.uncommittedCount;

    // Metadata list
    const metaList = body.createDiv({ cls: "pakcli-drawer-meta-list" });

    this.createMetaRow(metaList, "Status", statusText);
    const displaySource = maskSensitiveUrl(app.absolutePath, !this.store.isPrivacyMasked);
    this.createMetaRow(metaList, "Source", displaySource);
    const targetRow = this.createMetaRow(
      metaList,
      "Target",
      isFirebase
        ? `${app.hosting.firebase?.siteId} (Firebase Hosting)`
        : isGitHubPages
        ? `${app.hosting.githubPages?.branch || "gh-pages"} (GitHub Pages)`
        : "None"
    );

    if (isFirebase && this.appInstance) {
      const editBtn = targetRow.createEl("button", {
        cls: "pakcli-btn-secondary mod-small",
        text: "⚙️ Edit Config",
        attr: { type: "button", title: "Change Firebase project or public directory" },
      });
      editBtn.style.marginLeft = "8px";
      editBtn.style.padding = "2px 6px";
      editBtn.style.fontSize = "0.72rem";
      editBtn.addEventListener("click", () => {
        new SetupFirebaseModal(this.appInstance!, this.store, app, () => {
          this.render(this.store.selectedApp || app);
        }).open();
      });
    }

    const fbUser = this.store.health?.cli.firebase.userEmail || "Local PC";
    const fbDisplay = fbUser !== "Local PC" ? maskAccountIdentifier(fbUser, !this.store.isPrivacyMasked) : fbUser;
    const acctRow = this.createMetaRow(metaList, "Account", fbDisplay);
    if (this.appInstance) {
      const acctBtn = acctRow.createEl("button", {
        cls: "pakcli-btn-secondary mod-small",
        text: "⇄ Switch",
        attr: { type: "button", title: "Switch / manage local PC accounts" },
      });
      acctBtn.style.marginLeft = "8px";
      acctBtn.style.padding = "2px 6px";
      acctBtn.style.fontSize = "0.72rem";
      acctBtn.addEventListener("click", () => {
        new AccountManagerModal(this.appInstance!, this.store, app).open();
      });
    }

    const remoteUrlVal = app.git.remoteUrl
      ? maskSensitiveUrl(app.git.remoteUrl, !this.store.isPrivacyMasked)
      : (app.git.isRepo ? "local (no remote)" : "uninitialized");
    const remoteRow = this.createMetaRow(metaList, "Remote Repo", remoteUrlVal);
    if (this.appInstance) {
      const cfgRepoBtn = remoteRow.createEl("button", {
        cls: "pakcli-btn-secondary mod-small",
        text: app.git.remoteUrl ? "⚙️ Config" : "+ Remote",
        attr: { type: "button", title: "Config / switch GitHub remote repository" },
      });
      cfgRepoBtn.style.marginLeft = "8px";
      cfgRepoBtn.style.padding = "2px 6px";
      cfgRepoBtn.style.fontSize = "0.72rem";
      cfgRepoBtn.addEventListener("click", () => {
        const defaultTitle = app.catalog?.title || app.folderName;
        const ghUser = this.store.health?.cli.gh.userEmail || "pakcli";
        new LinkRemoteModal(
          this.appInstance!,
          defaultTitle,
          async (url) => {
            const res = await this.store.linkRemoteForApp(app, url);
            new Notice(res.message);
            this.render(this.store.selectedApp || app);
          },
          ghUser,
          app.git.remoteUrl,
          async () => {
            const res = await this.store.unlinkRemoteForApp(app);
            new Notice(res.message);
            this.render(this.store.selectedApp || app);
          },
          this.store,
          app
        ).open();
      });
    }

    this.createMetaRow(
      metaList,
      "Git Status",
      !app.git.isRepo
        ? "uninitialized"
        : changesCount > 0
        ? `${changesCount} uncommitted files`
        : "clean (0 uncommitted)"
    );

    // Warning notice
    const noticeEl = body.createDiv({ cls: "pakcli-drawer-alert text-muted" });
    const noticeIcon = noticeEl.createSpan();
    setIcon(noticeIcon, "info");
    noticeEl.createSpan({ text: " Deploys folder contents and public directory." });

    // Action Buttons
    if (hasHost) {
      const actionsRow = body.createDiv({ cls: "pakcli-drawer-actions-row" });

      const deployBtn = actionsRow.createEl("button", {
        cls: "mod-cta pakcli-btn-deploy",
        text: this.store.isDeploying
          ? "Deploying..."
          : isFirebase
          ? "Deploy to Firebase →"
          : "Push to GitHub Pages →",
      });
      deployBtn.disabled = this.store.isDeploying;
      deployBtn.addEventListener("click", () => {
        this.store.startDeploy(app, "production");
      });

      if (isFirebase) {
        const previewBtn = actionsRow.createEl("button", {
          cls: "pakcli-btn-preview",
          text: "Preview channel",
        });
        previewBtn.disabled = this.store.isDeploying;
        previewBtn.addEventListener("click", () => {
          this.store.startDeploy(app, "preview");
        });
      }
    }

    // Mini Live Terminal Log Box
    const terminalBox = body.createDiv({ cls: "pakcli-drawer-terminal" });
    const termHeader = terminalBox.createDiv({ cls: "pakcli-term-header" });
    termHeader.createSpan({ text: "Deployment Console Logs" });

    new CopyButton(termHeader, {
      text: () => this.store.activeDeployLogs.map((l) => l.line).join("\n"),
      label: "Copy log",
      iconOnly: false,
      className: "pakcli-term-copy-btn",
    });

    this.logContainerEl = terminalBox.createDiv({ cls: "pakcli-term-logs" });
    this.flushLogsToTerminal();

    // Danger Zone (Only if host configured)
    if (hasHost) {
      const dangerZone = body.createDiv({ cls: "pakcli-drawer-danger-zone" });
      dangerZone.createSpan({ cls: "pakcli-danger-label", text: "Management" });

      const stopBtn = dangerZone.createEl("button", {
        cls: "pakcli-btn-stop mod-warning",
        text: isFirebase ? "Stop hosting…" : "Reset Pages…",
      });
      stopBtn.addEventListener("click", () => {
        this.onStopHosting(app);
      });
    }
  }

  private renderHistoryTab(body: HTMLElement, app: AppScanRecord) {
    const tableEl = body.createEl("table", { cls: "pakcli-history-table" });
    const thead = tableEl.createEl("thead");
    const trHead = thead.createEl("tr");
    ["Version", "Message", "Date", "Status", "Action"].forEach((h) => {
      trHead.createEl("th", { text: h });
    });

    const tbody = tableEl.createEl("tbody");

    if (this.historyCommits.length === 0) {
      const trEmpty = tbody.createEl("tr");
      const td = trEmpty.createEl("td", { attr: { colspan: 5 } });
      td.setText("~ No commit history available ~");
      return;
    }

    this.historyCommits.forEach((commit) => {
      const tr = tbody.createEl("tr");

      // Version Hash with hover copy
      const tdHash = tr.createEl("td", { cls: "pakcli-col-hash" });
      const hashWrap = tdHash.createDiv({ cls: "pakcli-hash-wrap" });
      hashWrap.createSpan({ text: commit.shortHash });
      new CopyButton(hashWrap, {
        text: commit.hash,
        title: "Copy commit hash",
        className: "pakcli-cell-hover-copy",
      });

      // Message
      tr.createEl("td", { cls: "pakcli-col-msg", text: commit.message });

      // Date
      tr.createEl("td", { cls: "pakcli-col-date text-muted", text: commit.date });

      // Status
      const tdStatus = tr.createEl("td", { cls: "pakcli-col-status" });
      if (commit.isLive) {
        tdStatus.createSpan({ cls: "pakcli-badge-live", text: "current (live)" });
      }

      // Action
      const tdAct = tr.createEl("td", { cls: "pakcli-col-act" });
      if (commit.isLive) {
        tdAct.createSpan({ cls: "text-muted", text: "✓ active (HEAD)" });
      } else {
        const inspectBtn = tdAct.createEl("button", {
          cls: "pakcli-btn-jump",
          text: "View details",
          attr: { type: "button", title: "View version details" },
        });
        inspectBtn.addEventListener("click", () => {
          new Notice(`[Version ${commit.shortHash}]\n${commit.message}\nAuthor: ${commit.author}\nDate: ${commit.date}`);
        });
      }
    });
  }

  private createMetaRow(parent: HTMLElement, label: string, value: string): HTMLElement {
    const row = parent.createDiv({ cls: "pakcli-drawer-meta-row" });
    row.createSpan({ cls: "pakcli-meta-label text-muted", text: label });
    row.createSpan({ cls: "pakcli-meta-val", text: value });
    return row;
  }

  public appendLogChunk() {
    if (this.rafBatchId) return;
    this.rafBatchId = window.requestAnimationFrame(() => {
      this.flushLogsToTerminal();
      this.rafBatchId = null;
    });
  }

  private flushLogsToTerminal() {
    if (!this.logContainerEl) return;
    this.logContainerEl.empty();

    if (this.store.activeDeployLogs.length === 0) {
      this.logContainerEl.createDiv({
        cls: "pakcli-term-line text-muted",
        text: "░░░░░░░░ Ready to deploy. Logs will stream here...",
      });
      return;
    }

    for (const chunk of this.store.activeDeployLogs) {
      this.logContainerEl.createDiv({
        cls: `pakcli-term-line stream-${chunk.stream}`,
        text: chunk.line,
      });
    }

    this.logContainerEl.scrollTop = this.logContainerEl.scrollHeight;
  }
}
