import { ItemView, WorkspaceLeaf, setIcon, Notice, Menu } from "obsidian";
import type { AppScanRecord } from "../types";
import { AppDashboardStore } from "../store/AppDashboardStore";
import { DiagnosticBar } from "./components/DiagnosticBar";
import { HostDrawer } from "./components/HostDrawer";
import {
  GenericTable,
  SearchFilterBar,
  ConfirmModal,
  CopyButton,
  type ColumnDef,
} from "../../../uiComponents";
import { getNodeChildProcess, getNodeOs } from "../../../utils/nodeHelpers";

export const APPS_DASHBOARD_VIEW_TYPE = "pakcli-apps-dashboard-view";

export class AppsDashboardView extends ItemView {
  private store: AppDashboardStore;
  private diagnosticBar!: DiagnosticBar;
  private hostDrawer!: HostDrawer;
  private table!: GenericTable<AppScanRecord>;
  private unsubscribeStore?: () => void;
  private cp = getNodeChildProcess();
  private os = getNodeOs();

  constructor(leaf: WorkspaceLeaf, store: AppDashboardStore) {
    super(leaf);
    this.store = store;
  }

  getViewType(): string {
    return APPS_DASHBOARD_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Apps Dashboard";
  }

  getIcon(): string {
    return "layout-grid";
  }

  async onOpen() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("pakcli-apps-dashboard-root");

    // Main layout wrapper: Left content (Header + Table) + Right Drawer (Overlay)
    const layoutWrapper = containerEl.createDiv({ cls: "pakcli-dashboard-layout-wrapper" });
    const mainContent = layoutWrapper.createDiv({ cls: "pakcli-dashboard-main-content" });

    // 1. Diagnostic Top Bar
    this.diagnosticBar = new DiagnosticBar(mainContent, this.store, () => {
      this.openSettingsPrompt();
    });

    // 2. Toolbar: Search Filter & Quick Actions
    const toolbar = mainContent.createDiv({ cls: "pakcli-dashboard-toolbar" });

    new SearchFilterBar(toolbar, {
      placeholder: "Search folder, repo, or hosting site... (Press / to focus)",
      enableSlashFocus: true,
      onSearchChange: (query) => {
        this.store.setFilterQuery(query);
        this.table.setItems(this.store.getFilteredApps());
      },
    });

    // 3. Generic Table View (Free Selection, TSV Row Copy, Hover Copy)
    const tableContainer = mainContent.createDiv({ cls: "pakcli-dashboard-table-wrapper" });
    this.table = new GenericTable<AppScanRecord>(tableContainer, {
      columns: this.getTableColumns(),
      items: this.store.getFilteredApps(),
      rowKey: (app) => app.id,
      enableRowTsvCopy: true,
      emptyMessage: "~ No apps found in ~/apps. Click [ ⟳ Rescan ] or enable Demo Mode in Settings ~",
    });

    // 4. Right Overlay Host Drawer
    this.hostDrawer = new HostDrawer(layoutWrapper, this.store, (app) => {
      this.promptStopHosting(app);
    });

    // Subscribe to store updates
    this.unsubscribeStore = this.store.subscribe(() => {
      this.diagnosticBar.render();
      this.table.setItems(this.store.getFilteredApps());
      if (this.store.selectedApp) {
        this.hostDrawer.render(this.store.selectedApp);
      }
    });

    // Trigger initial scan
    void this.store.rescan();
  }

  private getTableColumns(): ColumnDef<AppScanRecord>[] {
    return [
      {
        key: "folderName",
        title: "Folder",
        width: "160px",
        sortable: true,
        render: (app) => {
          const wrap = createDiv({ cls: "pakcli-folder-cell-wrap" });
          wrap.createSpan({ cls: "pakcli-folder-name", text: app.folderName });
          if (app.isMonorepoRoot) {
            wrap.createSpan({ cls: "pakcli-badge-monorepo", text: "mono" });
          }
          return wrap;
        },
      },
      {
        key: "absolutePath",
        title: "Path",
        width: "220px",
        copyable: true,
        sortable: true,
        render: (app) => {
          return createSpan({ cls: "text-muted", text: app.absolutePath });
        },
      },
      {
        key: "githubRepo",
        title: "GitHub Repo",
        width: "240px",
        copyable: true,
        sortable: true,
        tsvValue: (app) => app.git.remoteUrl || "",
        render: (app) => {
          const wrap = createDiv({ cls: "pakcli-repo-cell-wrap" });
          if (app.git.remoteUrl) {
            const urlText = wrap.createSpan({ cls: "pakcli-repo-link-text", text: app.git.remoteUrl });
            urlText.title = app.git.remoteUrl;

            // External link button
            const extBtn = wrap.createEl("button", {
              cls: "pakcli-icon-btn clickable-icon",
              attr: { type: "button", title: "Open in browser" },
            });
            setIcon(extBtn, "external-link");
            extBtn.addEventListener("click", (e) => {
              e.stopPropagation();
              window.open(`https://${app.git.remoteUrl}`, "_blank");
            });
          } else {
            wrap.createSpan({ cls: "text-muted", text: "~ no remote ~" });
          }
          return wrap;
        },
      },
      {
        key: "staticHost",
        title: "Static Host",
        width: "280px",
        render: (app) => {
          const wrap = createDiv({ cls: "pakcli-host-cell-wrap" });

          // Firebase Host
          if (app.hosting.firebase?.configured) {
            const fbRow = wrap.createDiv({ cls: "pakcli-host-row" });
            fbRow.createSpan({ cls: "pakcli-provider-badge is-fb", text: "fb" });
            const hostLink = fbRow.createSpan({
              cls: "pakcli-host-url",
              text: `${app.hosting.firebase.siteId}.web.app`,
            });

            new CopyButton(fbRow, {
              text: app.hosting.firebase.liveUrl,
              title: "Copy live URL",
              className: "pakcli-cell-hover-copy",
            });

            const extBtn = fbRow.createEl("button", {
              cls: "pakcli-icon-btn clickable-icon",
              attr: { type: "button", title: "Open live site" },
            });
            setIcon(extBtn, "external-link");
            extBtn.addEventListener("click", (e) => {
              e.stopPropagation();
              window.open(app.hosting.firebase?.liveUrl, "_blank");
            });

            // Settings button opens HostDrawer
            const configBtn = fbRow.createEl("button", {
              cls: "pakcli-icon-btn clickable-icon",
              attr: { type: "button", title: "Configure deployment" },
            });
            setIcon(configBtn, "settings");
            configBtn.addEventListener("click", (e) => {
              e.stopPropagation();
              this.store.selectApp(app);
              this.hostDrawer.open(app);
            });
          }

          // GitHub Pages Host
          if (app.hosting.githubPages?.configured) {
            const ghRow = wrap.createDiv({ cls: "pakcli-host-row" });
            ghRow.createSpan({ cls: "pakcli-provider-badge is-gh", text: "gh" });
            ghRow.createSpan({
              cls: "pakcli-host-url",
              text: app.hosting.githubPages.url.replace("https://", ""),
            });

            new CopyButton(ghRow, {
              text: app.hosting.githubPages.url,
              title: "Copy Pages URL",
              className: "pakcli-cell-hover-copy",
            });

            const extBtn = ghRow.createEl("button", {
              cls: "pakcli-icon-btn clickable-icon",
              attr: { type: "button", title: "Open Pages site" },
            });
            setIcon(extBtn, "external-link");
            extBtn.addEventListener("click", (e) => {
              e.stopPropagation();
              window.open(app.hosting.githubPages?.url, "_blank");
            });

            const configBtn = ghRow.createEl("button", {
              cls: "pakcli-icon-btn clickable-icon",
              attr: { type: "button", title: "Configure deployment" },
            });
            setIcon(configBtn, "settings");
            configBtn.addEventListener("click", (e) => {
              e.stopPropagation();
              this.store.selectApp(app);
              this.hostDrawer.open(app);
            });
          }

          // If no host configured, show [ + Host ▾ ]
          if (!app.hosting.firebase?.configured && !app.hosting.githubPages?.configured) {
            const noHostWrap = wrap.createDiv({ cls: "pakcli-host-empty-wrap" });
            noHostWrap.createSpan({ cls: "text-muted", text: "~ no host ~" });

            const addHostBtn = noHostWrap.createEl("button", {
              cls: "pakcli-btn-add-host",
              text: "+ Host ▾",
              attr: { type: "button" },
            });
            addHostBtn.addEventListener("click", (e) => {
              e.stopPropagation();
              this.openHostProviderMenu(e, app);
            });
          }

          return wrap;
        },
      },
      {
        key: "actions",
        title: "Action",
        width: "140px",
        render: (app) => {
          const wrap = createDiv({ cls: "pakcli-row-action-wrap" });
          const openFolderBtn = wrap.createEl("button", {
            cls: "pakcli-btn-open-folder",
            text: "Open folder →",
            attr: { type: "button", title: "Open in file explorer" },
          });
          openFolderBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            this.openInOsExplorer(app.absolutePath);
          });
          return wrap;
        },
      },
    ];
  }

  private openHostProviderMenu(e: MouseEvent, app: AppScanRecord) {
    const menu = new Menu();
    menu.addItem((item) => {
      item.setTitle("Firebase Hosting").setIcon("flame").onClick(() => {
        new Notice(`🔗 Link Firebase wizard for "${app.folderName}" (Coming in Phase 3)`);
      });
    });
    menu.addItem((item) => {
      item.setTitle("GitHub Pages").setIcon("github").onClick(() => {
        new Notice(`🔗 Link GitHub Pages for "${app.folderName}" (Coming in Phase 3)`);
      });
    });
    menu.addSeparator();
    menu.addItem((item) => item.setTitle("Vercel (soon)").setDisabled(true));
    menu.addItem((item) => item.setTitle("Netlify (soon)").setDisabled(true));
    menu.addItem((item) => item.setTitle("Render (soon)").setDisabled(true));
    menu.showAtMouseEvent(e);
  }

  private promptStopHosting(app: AppScanRecord) {
    const siteName = app.hosting.firebase?.siteId || app.folderName;
    new ConfirmModal(this.app, {
      title: "Stop hosting?",
      message: `${siteName}.web.app will show 404. Redeploy anytime to bring it back.`,
      confirmLabel: "Stop hosting",
      isDanger: true,
      requiredConfirmText: siteName,
      onConfirm: async () => {
        new Notice(`🛑 Hosting stopped for ${siteName}.web.app`);
        this.hostDrawer.close();
      },
    }).open();
  }

  private openInOsExplorer(folderPath: string) {
    try {
      if ((window as any).electron?.shell?.openPath) {
        (window as any).electron.shell.openPath(folderPath);
        return;
      }
      const isWin = (this.os?.platform?.() || "") === "win32";
      if (this.cp?.exec) {
        this.cp.exec(`${isWin ? "explorer" : "open"} "${folderPath}"`);
      }
    } catch (err) {
      new Notice(`Failed to open folder: ${err}`);
    }
  }

  private openSettingsPrompt() {
    new ConfirmModal(this.app, {
      title: "Apps Dashboard Settings",
      message: "Toggle Demo Mode or configure scan depth. Demo Mode provides 5 sample projects for testing.",
      confirmLabel: "Toggle Demo Mode",
      cancelLabel: "Close",
      onConfirm: () => {
        const current = (this.store as any).settings?.demoMode ?? false;
        (this.store as any).settings.demoMode = !current;
        void this.store.rescan();
        new Notice(`Demo Mode ${!current ? "Enabled (Loaded 5 test apps)" : "Disabled (Live scan)"}`);
      },
    }).open();
  }

  async onClose() {
    this.unsubscribeStore?.();
    this.diagnosticBar?.destroy();
    this.hostDrawer?.close();
  }
}
