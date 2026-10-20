import { setIcon, Notice } from "obsidian";
import type { AppDashboardStore } from "../../store/AppDashboardStore";
import type { AppScanRecord, GitCommitRecord } from "../../types";
import { CopyButton } from "../../../../uiComponents";

export class HostDrawer {
  public containerEl: HTMLElement;
  private store: AppDashboardStore;
  private activeTab: "config" | "history" = "config";
  private historyCommits: GitCommitRecord[] = [];
  private logContainerEl?: HTMLElement;
  private rafBatchId: number | null = null;
  private onStopHosting: (app: AppScanRecord) => void;

  constructor(
    parentEl: HTMLElement,
    store: AppDashboardStore,
    onStopHosting: (app: AppScanRecord) => void
  ) {
    this.store = store;
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
    const isFirebase = app.hosting.firebase?.configured;
    const statusText = app.hosting.firebase?.status === "live" ? "live · last deploy 2d ago" : "configured";
    const changesCount = app.git.uncommittedCount;

    // Metadata list
    const metaList = body.createDiv({ cls: "pakcli-drawer-meta-list" });

    this.createMetaRow(metaList, "Status", statusText);
    this.createMetaRow(metaList, "Source", app.absolutePath);
    this.createMetaRow(
      metaList,
      "Target",
      isFirebase
        ? `${app.hosting.firebase?.siteId} (hosting site)`
        : `${app.hosting.githubPages?.branch || "gh-pages"}`
    );
    this.createMetaRow(
      metaList,
      "Changes",
      changesCount > 0 ? `${changesCount} uncommitted files` : "clean (0 uncommitted)"
    );

    // Warning notice
    const noticeEl = body.createDiv({ cls: "pakcli-drawer-alert text-muted" });
    const noticeIcon = noticeEl.createSpan();
    setIcon(noticeIcon, "info");
    noticeEl.createSpan({ text: " Deploys folder contents, not last commit." });

    // Action Buttons
    const actionsRow = body.createDiv({ cls: "pakcli-drawer-actions-row" });

    const deployBtn = actionsRow.createEl("button", {
      cls: "mod-cta pakcli-btn-deploy",
      text: this.store.isDeploying ? "Deploying..." : isFirebase ? "Deploy now →" : "Push to Pages →",
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

    // Mini Live Terminal Log Box
    const terminalBox = body.createDiv({ cls: "pakcli-drawer-terminal" });
    const termHeader = terminalBox.createDiv({ cls: "pakcli-term-header" });
    termHeader.createSpan({ text: "Console Log Output" });

    new CopyButton(termHeader, {
      text: () => this.store.activeDeployLogs.map((l) => l.line).join("\n"),
      label: "Copy log",
      iconOnly: false,
      className: "pakcli-term-copy-btn",
    });

    this.logContainerEl = terminalBox.createDiv({ cls: "pakcli-term-logs" });
    this.flushLogsToTerminal();

    // Danger Zone
    const dangerZone = body.createDiv({ cls: "pakcli-drawer-danger-zone" });
    dangerZone.createSpan({ cls: "pakcli-danger-label", text: "Danger" });

    const stopBtn = dangerZone.createEl("button", {
      cls: "pakcli-btn-stop mod-warning",
      text: isFirebase ? "Stop hosting…" : "Unpublish…",
    });
    stopBtn.addEventListener("click", () => {
      this.onStopHosting(app);
    });
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
        tdAct.createSpan({ cls: "text-muted", text: "~ is live ~" });
      } else {
        const jumpBtn = tdAct.createEl("button", {
          cls: "pakcli-btn-jump",
          text: "Jump here →",
        });
        jumpBtn.addEventListener("click", () => {
          new Notice(`⚡ Switched live release pointer to ${commit.shortHash}`);
        });
      }
    });
  }

  private createMetaRow(parent: HTMLElement, label: string, value: string) {
    const row = parent.createDiv({ cls: "pakcli-drawer-meta-row" });
    row.createSpan({ cls: "pakcli-meta-label text-muted", text: label });
    row.createSpan({ cls: "pakcli-meta-val", text: value });
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
