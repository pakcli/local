import { ItemView, WorkspaceLeaf, setIcon, Notice, Menu, Setting, App } from "obsidian";
import type { AppScanRecord } from "../types";
import { ALL_AVAILABLE_COLUMNS, DEFAULT_VISIBLE_COLUMNS } from "../types";
import { AppDashboardStore } from "../store/AppDashboardStore";
import { DiagnosticBar } from "./components/DiagnosticBar";
import { HostDrawer } from "./components/HostDrawer";
import { AppsDashboardSettingsModal } from "./AppsDashboardSettingsModal";
import {
  GenericTable,
  SearchFilterBar,
  ConfirmModal,
  CopyButton,
  BaseModal,
  type ColumnDef,
} from "../../../uiComponents";
import { getNodeChildProcess, getNodeOs, getNodePath } from "../../../utils/nodeHelpers";

class LinkRemoteModal extends BaseModal {
  private url = "";
  private onConfirm: (url: string) => void;

  constructor(app: App, defaultName: string, onConfirm: (url: string) => void) {
    super(app, {
      title: "Link GitHub Remote",
      subtitle: `Connect "${defaultName}" to remote repository.`,
      badgeText: "Git",
      badgeCls: "is-info",
      width: "460px",
    });
    this.onConfirm = onConfirm;
  }

  renderBody(bodyEl: HTMLElement): void {
    bodyEl.empty();
    new Setting(bodyEl)
      .setName("Remote Origin URL")
      .setDesc("e.g. https://github.com/username/my-app.git")
      .addText((text) => {
        text.setPlaceholder("https://github.com/...").onChange((val) => {
          this.url = val.trim();
        });
        text.inputEl.style.width = "260px";
      });
  }

  renderFooter(footerEl: HTMLElement): void {
    footerEl.empty();
    const cancelBtn = footerEl.createEl("button", {
      cls: "pakcli-btn-secondary",
      text: "Cancel",
    });
    cancelBtn.addEventListener("click", () => this.close());

    const confirmBtn = footerEl.createEl("button", {
      cls: "mod-cta pakcli-btn-primary",
      text: "Link Remote",
    });
    confirmBtn.addEventListener("click", () => {
      if (!this.url) {
        new Notice("Please enter a valid remote URL");
        return;
      }
      this.onConfirm(this.url);
      this.close();
    });
  }
}

export const APPS_DASHBOARD_VIEW_TYPE = "pakcli-apps-dashboard-view";

export class AppsDashboardView extends ItemView {
  private store: AppDashboardStore;
  private diagnosticBar!: DiagnosticBar;
  private hostDrawer!: HostDrawer;
  private table!: GenericTable<AppScanRecord>;
  private unsubscribeStore?: () => void;
  private cp = getNodeChildProcess();
  private os = getNodeOs();
  private path = getNodePath();

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

    // Main layout wrapper: Left content (Header + Toolbar + Table) + Right Drawer (Overlay)
    const layoutWrapper = containerEl.createDiv({ cls: "pakcli-dashboard-layout-wrapper" });
    const mainContent = layoutWrapper.createDiv({ cls: "pakcli-dashboard-main-content" });

    // 1. Diagnostic Top Bar
    this.diagnosticBar = new DiagnosticBar(mainContent, this.store, () => {
      this.openSettingsPrompt();
    });

    // 2. Toolbar: Search Filter & Column Visibility Toggle
    const toolbar = mainContent.createDiv({ cls: "pakcli-dashboard-toolbar" });

    const searchWrap = toolbar.createDiv({ cls: "pakcli-toolbar-search-wrap" });
    new SearchFilterBar(searchWrap, {
      placeholder: "Search folder, title, tags, repo, or host... (Press / to focus)",
      enableSlashFocus: true,
      onSearchChange: (query) => {
        this.store.setFilterQuery(query);
        this.table.setItems(this.store.getFilteredApps());
      },
    });

    const toolbarActions = toolbar.createDiv({ cls: "pakcli-toolbar-actions" });

    // Column Visibility Dropdown Button [ 👁 Columns ▾ ]
    const colMenuBtn = toolbarActions.createEl("button", {
      cls: "pakcli-btn-columns-menu",
      text: "👁 Columns ▾",
      attr: { type: "button", title: "Toggle visible columns" },
    });
    colMenuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.openColumnVisibilityMenu(e);
    });

    // Settings Button [ ⚙ Settings ]
    const settingsBtn = toolbarActions.createEl("button", {
      cls: "pakcli-btn-settings",
      text: "⚙ Settings",
      attr: { type: "button", title: "Configure folder path and scan settings" },
    });
    settingsBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.openSettingsPrompt();
    });

    // 3. Generic Table View (Single Actions column, enableRowTsvCopy: false to prevent duplicate column)
    const tableContainer = mainContent.createDiv({ cls: "pakcli-dashboard-table-wrapper" });
    this.table = new GenericTable<AppScanRecord>(tableContainer, {
      columns: this.getActiveColumnDefs(),
      items: this.store.getFilteredApps(),
      rowKey: (app) => app.id,
      enableRowTsvCopy: false, // Prevents duplicate Action column
      emptyMessage: "~ No apps found. Configure root/apps/ in Settings or enable Demo Mode ~",
    });

    // 4. Right Overlay Host Drawer
    this.hostDrawer = new HostDrawer(layoutWrapper, this.store, (app) => {
      this.promptStopHosting(app);
    });

    // Subscribe to store updates
    this.unsubscribeStore = this.store.subscribe(() => {
      this.diagnosticBar.render();
      this.table.setColumns(this.getActiveColumnDefs());
      this.table.setItems(this.store.getFilteredApps());
      if (this.store.selectedApp) {
        this.hostDrawer.render(this.store.selectedApp);
      }
    });

    // Trigger initial scan
    void this.store.rescan();
  }

  private openColumnVisibilityMenu(e: MouseEvent) {
    const menu = new Menu();
    const visibleSet = new Set(this.store.visibleColumns);

    // Section 1: Core Columns
    menu.addItem((item) => {
      item.setTitle("— Core Columns —").setDisabled(true);
    });

    for (const col of ALL_AVAILABLE_COLUMNS.filter((c) => c.category === "core")) {
      menu.addItem((item) => {
        item
          .setTitle(col.label)
          .setChecked(visibleSet.has(col.id))
          .onClick(() => {
            this.store.toggleColumn(col.id);
            this.refreshTable();
          });
      });
    }

    menu.addSeparator();

    // Section 2: Catalog Metadata Columns
    menu.addItem((item) => {
      item.setTitle("— Catalog Metadata —").setDisabled(true);
    });

    for (const col of ALL_AVAILABLE_COLUMNS.filter((c) => c.category === "catalog")) {
      menu.addItem((item) => {
        item
          .setTitle(col.label)
          .setChecked(visibleSet.has(col.id))
          .onClick(() => {
            this.store.toggleColumn(col.id);
            this.refreshTable();
          });
      });
    }

    menu.addSeparator();

    // Reset to default
    menu.addItem((item) => {
      item
        .setTitle("↺ Reset to Default (5 cols)")
        .setIcon("reset")
        .onClick(() => {
          this.store.setVisibleColumns([...DEFAULT_VISIBLE_COLUMNS]);
          this.refreshTable();
        });
    });

    menu.showAtMouseEvent(e);
  }

  private refreshTable() {
    this.table.setColumns(this.getActiveColumnDefs());
    this.table.setItems(this.store.getFilteredApps());
  }

  private getActiveColumnDefs(): ColumnDef<AppScanRecord>[] {
    const visible = new Set(this.store.visibleColumns);
    const allDefs = this.getAllColumnDefinitions();
    return allDefs.filter((col) => visible.has(col.key));
  }

  private getAllColumnDefinitions(): ColumnDef<AppScanRecord>[] {
    return [
      {
        key: "folderName",
        title: "Folder",
        width: "160px",
        sortable: true,
        tsvValue: (app) => app.folderName,
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
        key: "path",
        title: "Path",
        width: "200px",
        copyable: true,
        sortable: true,
        tsvValue: (app) => app.absolutePath,
        render: (app) => {
          return createSpan({ cls: "text-muted pakcli-truncate", text: app.absolutePath });
        },
      },
      {
        key: "githubRepo",
        title: "GitHub Repo",
        width: "220px",
        copyable: true,
        sortable: true,
        tsvValue: (app) => app.git.remoteUrl || (app.git.isRepo ? "local repo" : "uninitialized"),
        render: (app) => {
          const wrap = createDiv({ cls: "pakcli-repo-cell-wrap" });

          // 1. Has Remote URL
          if (app.git.remoteUrl) {
            const urlText = wrap.createSpan({ cls: "pakcli-repo-link-text", text: app.git.remoteUrl });
            urlText.title = app.git.remoteUrl;

            const extBtn = wrap.createEl("button", {
              cls: "pakcli-icon-btn clickable-icon",
              attr: { type: "button", title: "Open in browser" },
            });
            setIcon(extBtn, "external-link");
            extBtn.addEventListener("click", (e) => {
              e.stopPropagation();
              window.open(`https://${app.git.remoteUrl}`, "_blank");
            });
            return wrap;
          }

          // 2. Git is initialized locally, but no remote
          if (app.git.isRepo) {
            wrap.createSpan({ cls: "text-muted", text: "local" });
            const linkBtn = wrap.createEl("button", {
              cls: "pakcli-btn-link-remote",
              text: "+ Remote",
              attr: { type: "button", title: "Add GitHub remote repository URL" },
            });
            linkBtn.addEventListener("click", (e) => {
              e.stopPropagation();
              new LinkRemoteModal(this.app, app.folderName, async (url) => {
                const res = await this.store.linkRemoteForApp(app, url);
                new Notice(res.message);
              }).open();
            });
            return wrap;
          }

          // 3. Git not initialized (0 -> 1)
          const initBtn = wrap.createEl("button", {
            cls: "pakcli-btn-init-git",
            text: "⚡ Init Git",
            attr: { type: "button", title: "Initialize Git repository (Status 0 → 1)" },
          });
          initBtn.addEventListener("click", async (e) => {
            e.stopPropagation();
            initBtn.disabled = true;
            initBtn.setText("Init...");
            const res = await this.store.initGitForApp(app);
            new Notice(res.message);
          });

          return wrap;
        },
      },
      {
        key: "staticHost",
        title: "Static Host",
        width: "260px",
        render: (app) => {
          const wrap = createDiv({ cls: "pakcli-host-cell-wrap" });

          // Firebase Host
          if (app.hosting.firebase?.configured) {
            const fbRow = wrap.createDiv({ cls: "pakcli-host-row" });
            fbRow.createSpan({ cls: "pakcli-provider-badge is-fb", text: "fb" });
            fbRow.createSpan({
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
        key: "title",
        title: "Title",
        width: "180px",
        sortable: true,
        copyable: true,
        tsvValue: (app) => app.catalog?.title || app.folderName,
        render: (app) => {
          return createSpan({
            cls: "pakcli-catalog-title",
            text: app.catalog?.title || app.folderName,
          });
        },
      },
      {
        key: "category",
        title: "Category",
        width: "130px",
        sortable: true,
        copyable: true,
        tsvValue: (app) => app.catalog?.category || "",
        render: (app) => {
          const cat = app.catalog?.category;
          if (!cat) return createSpan({ cls: "text-muted", text: "-" });
          return createSpan({ cls: "pakcli-badge-category", text: cat });
        },
      },
      {
        key: "badge",
        title: "Badge",
        width: "110px",
        sortable: true,
        copyable: true,
        tsvValue: (app) => app.catalog?.badge || "",
        render: (app) => {
          const b = app.catalog?.badge;
          if (!b) return createSpan({ cls: "text-muted", text: "-" });
          return createSpan({ cls: "pakcli-badge-version", text: b });
        },
      },
      {
        key: "fileSize",
        title: "Size",
        width: "90px",
        sortable: true,
        copyable: true,
        tsvValue: (app) => app.catalog?.fileSize || "",
        render: (app) => {
          const s = app.catalog?.fileSize;
          return createSpan({ cls: s ? "pakcli-filesize" : "text-muted", text: s || "-" });
        },
      },
      {
        key: "tags",
        title: "Tags",
        width: "180px",
        tsvValue: (app) => app.catalog?.tags?.join(", ") || "",
        render: (app) => {
          const wrap = createDiv({ cls: "pakcli-tags-wrap" });
          const tags = app.catalog?.tags || [];
          if (tags.length === 0) {
            wrap.createSpan({ cls: "text-muted", text: "-" });
            return wrap;
          }
          for (const t of tags.slice(0, 3)) {
            wrap.createSpan({ cls: "pakcli-tag-pill", text: t });
          }
          if (tags.length > 3) {
            wrap.createSpan({ cls: "pakcli-tag-pill is-more", text: `+${tags.length - 3}` });
          }
          return wrap;
        },
      },
      {
        key: "overview",
        title: "Overview",
        width: "220px",
        copyable: true,
        tsvValue: (app) => app.catalog?.overview || "",
        render: (app) => {
          const text = app.catalog?.overview || "";
          const span = createSpan({ cls: "pakcli-overview-text text-muted", text: text || "-" });
          if (text) span.title = text;
          return span;
        },
      },
      {
        key: "thumbnail",
        title: "Thumb",
        width: "80px",
        render: (app) => {
          const wrap = createDiv({ cls: "pakcli-thumb-cell-wrap" });
          const img = app.catalog?.img || app.catalog?.thumbnail;
          if (img) {
            const thumb = wrap.createSpan({ cls: "pakcli-thumb-icon", text: "🖼" });
            thumb.title = img;
          } else {
            wrap.createSpan({ cls: "text-muted", text: "-" });
          }
          return wrap;
        },
      },
      {
        key: "liveLink",
        title: "Live Link",
        width: "100px",
        render: (app) => {
          const wrap = createDiv({ cls: "pakcli-livelink-wrap" });
          const link =
            app.catalog?.linkLive ||
            (app.hosting.firebase?.configured ? app.hosting.firebase.liveUrl : undefined);
          if (link) {
            const btn = wrap.createEl("button", {
              cls: "pakcli-icon-btn clickable-icon",
              attr: { type: "button", title: `Open ${link}` },
            });
            setIcon(btn, "external-link");
            btn.addEventListener("click", (e) => {
              e.stopPropagation();
              if (link.startsWith("http://") || link.startsWith("https://")) {
                window.open(link, "_blank");
              } else {
                const target = this.path?.join(app.absolutePath, link) || app.absolutePath;
                this.openInOsExplorer(target);
              }
            });
          } else {
            wrap.createSpan({ cls: "text-muted", text: "-" });
          }
          return wrap;
        },
      },
      {
        key: "actions",
        title: "Actions",
        width: "190px",
        align: "right",
        render: (app) => {
          const wrap = createDiv({ cls: "pakcli-row-action-wrap" });

          // 1. Open Folder button
          const openFolderBtn = wrap.createEl("button", {
            cls: "pakcli-btn-open-folder",
            text: "Open folder →",
            attr: { type: "button", title: "Open in file explorer" },
          });
          openFolderBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            this.openInOsExplorer(app.absolutePath);
          });

          // 2. Row TSV Copy button (merged cleanly into this single action column)
          new CopyButton(wrap, {
            text: () => this.generateRowTsv(app),
            label: "Row",
            title: "Copy row as TSV (Spreadsheet ready)",
            iconOnly: false,
            className: "pakcli-btn-row-copy",
          });

          return wrap;
        },
      },
    ];
  }

  private generateRowTsv(app: AppScanRecord): string {
    const cols = this.getActiveColumnDefs();
    const values = cols
      .filter((c) => c.key !== "actions")
      .map((c) => {
        let val = "";
        if (c.tsvValue) {
          val = c.tsvValue(app);
        } else if (c.key in app) {
          val = String((app as any)[c.key] || "");
        } else if (app.catalog && c.key in app.catalog) {
          val = String((app.catalog as any)[c.key] || "");
        }
        if (val.includes("\t") || val.includes("\n") || val.includes('"') || val.includes("\r")) {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return val;
      });
    return values.join("\t");
  }

  private openHostProviderMenu(e: MouseEvent, app: AppScanRecord) {
    const menu = new Menu();
    menu.addItem((item) => {
      item.setTitle("🔥 Firebase Hosting").setIcon("flame").onClick(async () => {
        const siteId = app.folderName.toLowerCase().replace(/[^a-z0-9-]/g, "");
        const res = await this.store.setupFirebaseForApp(app, siteId, "dist");
        new Notice(res.message);
        this.store.selectApp(app);
        this.hostDrawer.open(app);
      });
    });
    menu.addItem((item) => {
      item.setTitle("🐙 GitHub Pages").setIcon("github").onClick(async () => {
        const res = await this.store.setupGitHubPagesForApp(app);
        new Notice(res.message);
        this.store.selectApp(app);
        this.hostDrawer.open(app);
      });
    });
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
    new AppsDashboardSettingsModal(this.app, this.store).open();
  }

  async onClose() {
    this.unsubscribeStore?.();
    this.diagnosticBar?.destroy();
    this.hostDrawer?.close();
  }
}
