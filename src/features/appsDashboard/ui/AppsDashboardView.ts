import { ItemView, WorkspaceLeaf, setIcon, Notice, Menu, Setting, App } from "obsidian";
import type { AppScanRecord } from "../types";
import { ALL_AVAILABLE_COLUMNS, DEFAULT_VISIBLE_COLUMNS } from "../types";
import { AppDashboardStore } from "../store/AppDashboardStore";
import { DiagnosticBar } from "./components/DiagnosticBar";
import { HostDrawer } from "./components/HostDrawer";
import { AppsDashboardSettingsModal } from "./AppsDashboardSettingsModal";
import { SetupFirebaseModal } from "./SetupFirebaseModal";
import { AccountManagerModal, maskAccountIdentifier, maskSensitiveUrl } from "./AccountManagerModal";
import {
  GenericTable,
  SearchFilterBar,
  ConfirmModal,
  CopyButton,
  BaseModal,
  type ColumnDef,
} from "../../../uiComponents";
import { getNodeChildProcess, getNodeFs, getNodeOs, getNodePath } from "../../../utils/nodeHelpers";

export class LinkRemoteModal extends BaseModal {
  private repoName = "";
  private remoteUrl = "";
  private prefix = "pakcli";
  private onConfirm: (url: string) => void;
  private onUnlink?: () => void;
  private checkStatusEl?: HTMLElement;
  private existingRemoteUrl?: string;

  constructor(
    app: App,
    defaultTitle: string,
    onConfirm: (url: string) => void,
    existingPrefix?: string,
    existingRemoteUrl?: string,
    onUnlink?: () => void
  ) {
    super(app, {
      title: existingRemoteUrl ? "Configure GitHub Remote" : "Link GitHub Remote Repository",
      subtitle: `Configure Git remote repository for "${defaultTitle}".`,
      badgeText: "Git",
      badgeCls: "is-info",
      width: "520px",
    });
    this.onConfirm = onConfirm;
    this.onUnlink = onUnlink;
    this.existingRemoteUrl = existingRemoteUrl;
    if (existingPrefix) this.prefix = existingPrefix;

    // Clean slug from title
    this.repoName = defaultTitle
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-");

    // If existing remote URL is supplied, parse owner and repo name dynamically
    if (existingRemoteUrl) {
      const m = existingRemoteUrl.match(/github\.com[/:]([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_.-]+)/i);
      if (m && m[1]) this.prefix = m[1];
      if (m && m[2]) this.repoName = m[2].replace(/\.git$/i, "");
    }

    this.remoteUrl = existingRemoteUrl || `https://github.com/${this.prefix}/${this.repoName}.git`;
  }

  renderBody(bodyEl: HTMLElement): void {
    bodyEl.empty();

    let urlInput: any;

    if (this.existingRemoteUrl) {
      const curBox = bodyEl.createDiv({ cls: "pakcli-info-banner" });
      curBox.style.padding = "8px 12px";
      curBox.style.marginBottom = "14px";
      curBox.style.background = "var(--background-secondary)";
      curBox.style.borderRadius = "4px";
      curBox.style.border = "1px solid var(--background-modifier-border)";
      curBox.style.fontSize = "0.82rem";

      curBox.createDiv({ cls: "text-muted", text: "Current Remote URL:" });
      const curUrlEl = curBox.createEl("strong", { text: maskSensitiveUrl(this.existingRemoteUrl, false) });
      curUrlEl.title = this.existingRemoteUrl;
      curUrlEl.style.fontFamily = "var(--font-monospace)";

      const switchBtn = curBox.createEl("button", {
        cls: "pakcli-btn-secondary mod-small",
        text: `⚡ Quick Switch to: https://github.com/${this.prefix}/${this.repoName}.git`,
        attr: { type: "button" },
      });
      switchBtn.style.marginTop = "6px";
      switchBtn.style.display = "block";
      switchBtn.addEventListener("click", () => {
        this.remoteUrl = `https://github.com/${this.prefix}/${this.repoName}.git`;
        if (urlInput) urlInput.setValue(this.remoteUrl);
        new Notice(`Set target URL to ${this.remoteUrl}`);
      });
    }

    // 1. Owner / Organization Setting
    new Setting(bodyEl)
      .setName("GitHub Owner / Username")
      .setDesc("GitHub user or org holding this repository (e.g. fadhlisl, pakcli).")
      .addText((text) => {
        text.setValue(this.prefix).onChange((val) => {
          this.prefix = val.trim();
          this.remoteUrl = `https://github.com/${this.prefix}/${this.repoName}.git`;
          if (urlInput) urlInput.setValue(this.remoteUrl);
          updatePreview();
        });
        text.inputEl.style.width = "180px";
      });

    // 2. Repo Name with Check Button
    new Setting(bodyEl)
      .setName("Repository Name")
      .setDesc(`GitHub repository slug.`)
      .addText((text) => {
        text.setValue(this.repoName).onChange((val) => {
          this.repoName = val.trim();
          this.remoteUrl = `https://github.com/${this.prefix}/${this.repoName}.git`;
          if (urlInput) urlInput.setValue(this.remoteUrl);
          updatePreview();
        });
        text.inputEl.style.width = "180px";
      })
      .addButton((btn) => {
        btn.setButtonText("Check").onClick(() => {
          this.validateRepoName();
        });
      });

    this.checkStatusEl = bodyEl.createDiv({ cls: "pakcli-check-status-row text-muted" });

    // 3. Full Remote URL
    new Setting(bodyEl)
      .setName("Remote Origin URL")
      .setDesc("Full Git remote URL that will be configured as 'origin'.")
      .addText((text) => {
        urlInput = text;
        text.setValue(this.remoteUrl).onChange((val) => {
          this.remoteUrl = val.trim();
        });
        text.inputEl.style.width = "280px";
      });

    // 4. GitHub Pages Domain Preview
    const previewBox = bodyEl.createDiv({ cls: "pakcli-gh-preview-box" });
    const updatePreview = () => {
      previewBox.empty();
      previewBox.createSpan({ cls: "text-muted", text: "GitHub Pages domain: " });
      previewBox.createEl("strong", { text: `https://${this.prefix}.github.io/${this.repoName}` });
    };
    updatePreview();
  }

  private validateRepoName() {
    if (!this.checkStatusEl) return;
    this.checkStatusEl.empty();
    if (!this.repoName) {
      this.checkStatusEl.setText("❌ Repo name cannot be empty.");
      this.checkStatusEl.className = "pakcli-check-status-row is-error";
      return;
    }
    const isValidSlug = /^[a-zA-Z0-9_-]+$/.test(this.repoName);
    if (!isValidSlug) {
      this.checkStatusEl.setText("❌ Invalid characters. Use alphanumeric, dashes, or underscores.");
      this.checkStatusEl.className = "pakcli-check-status-row is-error";
      return;
    }
    this.checkStatusEl.setText(`✔ Valid name format: "${this.repoName}". Ready to link.`);
    this.checkStatusEl.className = "pakcli-check-status-row is-success";
  }

  renderFooter(footerEl: HTMLElement): void {
    footerEl.empty();
    const cancelBtn = footerEl.createEl("button", {
      cls: "pakcli-btn-secondary",
      text: "Cancel",
    });
    cancelBtn.addEventListener("click", () => this.close());

    if (this.onUnlink) {
      const unlinkBtn = footerEl.createEl("button", {
        cls: "pakcli-btn-secondary mod-warning",
        text: "🗑️ Unlink Remote",
        attr: { type: "button", title: "Remove remote 'origin' from this repo" },
      });
      unlinkBtn.addEventListener("click", () => {
        this.onUnlink?.();
        this.close();
      });
    }

    const confirmBtn = footerEl.createEl("button", {
      cls: "mod-cta pakcli-btn-primary",
      text: this.existingRemoteUrl ? "Save / Switch Remote" : "Link Remote",
    });
    confirmBtn.addEventListener("click", () => {
      if (!this.remoteUrl) {
        new Notice("Please enter a valid remote URL");
        return;
      }
      this.onConfirm(this.remoteUrl);
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
  private fs = getNodeFs();
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
    this.hostDrawer = new HostDrawer(
      layoutWrapper,
      this.store,
      (app) => {
        this.promptStopHosting(app);
      },
      this.app
    );

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
          const displayPath = maskSensitiveUrl(app.absolutePath, !this.store.isPrivacyMasked);
          return createSpan({ cls: "text-muted pakcli-truncate", text: displayPath });
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
            const displayUrl = maskSensitiveUrl(app.git.remoteUrl, !this.store.isPrivacyMasked);
            const urlText = wrap.createSpan({ cls: "pakcli-repo-link-text", text: displayUrl });
            urlText.title = this.store.isPrivacyMasked
              ? "Masked (2 letters). Click 👁️ in header to reveal"
              : app.git.remoteUrl;

            // Config / Switch Remote Button
            const cfgBtn = wrap.createEl("button", {
              cls: "pakcli-icon-btn clickable-icon",
              attr: { type: "button", title: "Config / switch remote repository" },
            });
            setIcon(cfgBtn, "settings");
            cfgBtn.addEventListener("click", (e) => {
              e.stopPropagation();
              const defaultTitle = app.catalog?.title || app.folderName;
              const ghUser = this.store.health?.cli.gh.userEmail || "pakcli";
              new LinkRemoteModal(
                this.app,
                defaultTitle,
                async (url) => {
                  const res = await this.store.linkRemoteForApp(app, url);
                  new Notice(res.message);
                },
                ghUser,
                app.git.remoteUrl,
                async () => {
                  const res = await this.store.unlinkRemoteForApp(app);
                  new Notice(res.message);
                }
              ).open();
            });

            const extBtn = wrap.createEl("button", {
              cls: "pakcli-icon-btn clickable-icon",
              attr: { type: "button", title: "Open in browser" },
            });
            setIcon(extBtn, "external-link");
            extBtn.addEventListener("click", (e) => {
              e.stopPropagation();
              const fullUrl = app.git.remoteUrl!.startsWith("http")
                ? app.git.remoteUrl!
                : `https://${app.git.remoteUrl}`;
              window.open(fullUrl, "_blank");
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
              const defaultTitle = app.catalog?.title || app.folderName;
              const ghUser = this.store.health?.cli.gh.userEmail || "pakcli";
              new LinkRemoteModal(
                this.app,
                defaultTitle,
                async (url) => {
                  const res = await this.store.linkRemoteForApp(app, url);
                  new Notice(res.message);
                },
                ghUser
              ).open();
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
            const fbHostRaw = `${app.hosting.firebase.siteId}.web.app`;
            const fbHostDisplay = maskSensitiveUrl(fbHostRaw, !this.store.isPrivacyMasked);
            const fbSpan = fbRow.createSpan({
              cls: "pakcli-host-url",
              text: fbHostDisplay,
            });
            fbSpan.title = this.store.isPrivacyMasked
              ? "Masked for privacy. Click 👁️ in header to reveal"
              : fbHostRaw;

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
            const ghPagesRaw = app.hosting.githubPages.url.replace("https://", "");
            const ghPagesDisplay = maskSensitiveUrl(ghPagesRaw, !this.store.isPrivacyMasked);
            const ghSpan = ghRow.createSpan({
              cls: "pakcli-host-url",
              text: ghPagesDisplay,
            });
            ghSpan.title = this.store.isPrivacyMasked
              ? "Masked for privacy (2 letters). Click 👁️ in header to reveal"
              : ghPagesRaw;

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
        title: "Preview",
        width: "280px",
        render: (app) => {
          const card = createDiv({ cls: "pakcli-thumb-card" });

          const isDark = document.body.classList.contains("theme-dark");
          let currentMode: "light" | "dark" = isDark ? "dark" : "light";

          const lightImgName = app.catalog?.imgLight || app.catalog?.img || "img-lightmode.webp";
          const darkImgName = app.catalog?.imgDark || app.catalog?.img || "img-darkmode.webp";

          const resolveImgUri = (fileName: string): string => {
            if (!fileName) return "";
            if (fileName.startsWith("http://") || fileName.startsWith("https://") || fileName.startsWith("data:")) {
              return fileName;
            }

            const cleanFileName = fileName.replace(/^\[\[|\]\]$/g, "").trim();
            const fullPath = this.path?.isAbsolute(cleanFileName)
              ? cleanFileName
              : this.path?.join(app.absolutePath, cleanFileName) || cleanFileName;

            // 1. Direct Base64 Data URI reading via Node.js fs (desktop Obsidian fail-proof)
            if (this.fs && this.fs.existsSync(fullPath)) {
              try {
                const buf = this.fs.readFileSync(fullPath);
                const ext = (this.path?.extname(fullPath) || ".webp").toLowerCase().replace(".", "");
                const mime =
                  ext === "svg"
                    ? "image/svg+xml"
                    : ext === "png"
                    ? "image/png"
                    : ext === "jpg" || ext === "jpeg"
                    ? "image/jpeg"
                    : ext === "gif"
                    ? "image/gif"
                    : "image/webp";
                return `data:${mime};base64,${buf.toString("base64")}`;
              } catch (e) {
                console.warn("[AppsDashboard] Failed to read image as Base64:", e);
              }
            }

            // 2. Fallback: Obsidian Vault adapter getResourcePath
            try {
              const vaultAdapter = this.app.vault.adapter as any;
              if (vaultAdapter && typeof vaultAdapter.getResourcePath === "function") {
                const vaultRoot = vaultAdapter.getBasePath?.() || vaultAdapter.basePath || "";
                if (vaultRoot && fullPath.startsWith(vaultRoot)) {
                  const relToVault = fullPath.slice(vaultRoot.length).replace(/^[/\\]+/, "").replace(/\\/g, "/");
                  return vaultAdapter.getResourcePath(relToVault);
                }
                return vaultAdapter.getResourcePath(fullPath);
              }
            } catch {
              // fallback
            }

            return "";
          };

          const imgEl = card.createEl("img", {
            cls: "pakcli-thumb-img",
            attr: {
              alt: app.catalog?.title || app.folderName,
            },
          });

          const showPlaceholder = () => {
            imgEl.style.display = "none";
            if (!card.querySelector(".pakcli-thumb-placeholder")) {
              const placeholder = card.createDiv({ cls: "pakcli-thumb-placeholder" });
              placeholder.createSpan({ cls: "pakcli-placeholder-icon", text: "🖼" });
              placeholder.createSpan({ cls: "text-muted", text: "No preview image" });
            }
          };

          const hidePlaceholder = () => {
            const existing = card.querySelector(".pakcli-thumb-placeholder");
            if (existing) existing.remove();
            imgEl.style.display = "block";
          };

          imgEl.onload = () => {
            hidePlaceholder();
          };

          imgEl.onerror = () => {
            showPlaceholder();
          };

          // Overlay (Hover controls)
          const overlay = card.createDiv({ cls: "pakcli-thumb-overlay" });

          // 1. Center Top Button: Open HTML in Obsidian
          const centerTopBtn = overlay.createEl("button", {
            cls: "pakcli-thumb-center-top-btn",
            attr: { type: "button", title: "Open HTML inside Obsidian" },
          });
          const iconSpan = centerTopBtn.createSpan();
          setIcon(iconSpan, "layout");
          centerTopBtn.createSpan({ text: "Open in Obsidian" });
          centerTopBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            this.openHtmlInObsidian(app);
          });

          // 2. Bottom Theme Switcher Bar
          const toggleBar = overlay.createDiv({ cls: "pakcli-thumb-toggle-bar" });

          const lightBtn = toggleBar.createEl("button", {
            cls: "pakcli-thumb-mode-btn",
            text: "☀️ Light",
            attr: { type: "button", title: "Preview light mode" },
          });

          const darkBtn = toggleBar.createEl("button", {
            cls: "pakcli-thumb-mode-btn",
            text: "🌙 Dark",
            attr: { type: "button", title: "Preview dark mode" },
          });

          const setPreviewMode = (mode: "light" | "dark") => {
            currentMode = mode;
            const targetName = mode === "dark" ? darkImgName : lightImgName;
            const uri = resolveImgUri(targetName);
            if (uri) {
              hidePlaceholder();
              imgEl.src = uri;
            } else {
              showPlaceholder();
            }

            if (mode === "light") {
              lightBtn.addClass("is-active");
              darkBtn.removeClass("is-active");
            } else {
              darkBtn.addClass("is-active");
              lightBtn.removeClass("is-active");
            }
          };

          lightBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            setPreviewMode("light");
          });

          darkBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            setPreviewMode("dark");
          });

          // Clicking card (except toggle buttons) opens HTML in Obsidian
          card.addEventListener("click", (e) => {
            const target = e.target as HTMLElement;
            if (!target.closest(".pakcli-thumb-toggle-bar")) {
              e.stopPropagation();
              this.openHtmlInObsidian(app);
            }
          });

          // Initial load
          setPreviewMode(currentMode);

          return card;
        },
      },
      {
        key: "accounts",
        title: "Accounts",
        width: "220px",
        render: (app) => {
          const wrap = createDiv({ cls: "pakcli-accounts-cell-wrap" });
          let isCellUnmasked = !this.store.isPrivacyMasked;

          const renderContent = () => {
            wrap.empty();

            const rowsWrap = wrap.createDiv({ cls: "pakcli-accounts-rows" });

            // 1. GitHub Account
            const ghUser = this.store.health?.cli.gh.userEmail || "pakcli";
            const ghRow = rowsWrap.createDiv({ cls: "pakcli-account-item" });
            ghRow.createSpan({ cls: "pakcli-acct-icon", text: "🐙" });
            const ghLabel = ghRow.createSpan({
              cls: "pakcli-acct-name",
              text: maskAccountIdentifier(ghUser, isCellUnmasked),
            });
            ghLabel.title = isCellUnmasked ? ghUser : "Click eye icon to reveal full name";

            // 2. Google Firebase Account
            const fbEmail = this.store.health?.cli.firebase.userEmail || "dcalibri@gmail.com";
            const fbRow = rowsWrap.createDiv({ cls: "pakcli-account-item" });
            fbRow.createSpan({ cls: "pakcli-acct-icon", text: "🔥" });
            const fbLabel = fbRow.createSpan({
              cls: "pakcli-acct-name",
              text: maskAccountIdentifier(fbEmail, isCellUnmasked),
            });
            fbLabel.title = isCellUnmasked ? fbEmail : "Click eye icon to reveal full name";

            // Action buttons
            const btnsWrap = wrap.createDiv({ cls: "pakcli-acct-actions" });

            // Reveal button
            const eyeBtn = btnsWrap.createEl("button", {
              cls: "pakcli-icon-btn clickable-icon",
              attr: {
                type: "button",
                title: isCellUnmasked ? "Mask account identifiers (2 letters)" : "Reveal full account names",
              },
            });
            setIcon(eyeBtn, isCellUnmasked ? "eye-off" : "eye");
            eyeBtn.addEventListener("click", (e) => {
              e.stopPropagation();
              isCellUnmasked = !isCellUnmasked;
              renderContent();
            });

            // Config / Switch button
            const cfgBtn = btnsWrap.createEl("button", {
              cls: "pakcli-icon-btn clickable-icon",
              attr: { type: "button", title: "Manage / switch local accounts (zero browser)" },
            });
            setIcon(cfgBtn, "user-cog");
            cfgBtn.addEventListener("click", (e) => {
              e.stopPropagation();
              new AccountManagerModal(this.app, this.store, app).open();
            });
          };

          renderContent();
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
            const displayTitle = this.store.isPrivacyMasked
              ? "Open live site (Click 👁️ in header to reveal full URL)"
              : `Open ${link}`;
            const btn = wrap.createEl("button", {
              cls: "pakcli-icon-btn clickable-icon",
              attr: { type: "button", title: displayTitle },
            });
            setIcon(btn, "external-link");
            btn.addEventListener("click", (e) => {
              e.stopPropagation();
              if (link.startsWith("http://") || link.startsWith("https://")) {
                window.open(link, "_blank");
              } else {
                this.openHtmlInObsidian(app);
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
        width: "250px",
        align: "right",
        render: (app) => {
          const wrap = createDiv({ cls: "pakcli-row-action-wrap" });

          // 1. Open HTML inside Obsidian
          const openObsidianBtn = wrap.createEl("button", {
            cls: "pakcli-btn-action-icon clickable-icon",
            attr: { type: "button", title: "Open HTML inside Obsidian" },
          });
          setIcon(openObsidianBtn, "layout");
          openObsidianBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            this.openHtmlInObsidian(app);
          });

          // 2. Open in Default Browser
          const openBrowserBtn = wrap.createEl("button", {
            cls: "pakcli-btn-action-icon clickable-icon",
            attr: { type: "button", title: "Open in default browser" },
          });
          setIcon(openBrowserBtn, "external-link");
          openBrowserBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            this.openInDefaultBrowser(app);
          });

          // 3. Open Folder button
          const openFolderBtn = wrap.createEl("button", {
            cls: "pakcli-btn-open-folder",
            text: "Folder →",
            attr: { type: "button", title: "Open in file explorer" },
          });
          openFolderBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            this.openInOsExplorer(app.absolutePath);
          });

          // 4. Row TSV Copy button
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

  private openHtmlInObsidian(app: AppScanRecord) {
    const htmlFileName = app.catalog?.linkLive || "index.html";
    const fullHtmlPath = this.path?.join(app.absolutePath, htmlFileName) || app.absolutePath;

    // Check if inside vault
    const adapter = this.app.vault.adapter as any;
    const vaultRoot = adapter?.getBasePath?.() || adapter?.basePath || "";
    let relativeVaultPath = fullHtmlPath;
    if (vaultRoot && fullHtmlPath.startsWith(vaultRoot)) {
      relativeVaultPath = fullHtmlPath.slice(vaultRoot.length).replace(/^[\\\/]/, "").replace(/\\/g, "/");
    }

    const tfile = this.app.vault.getAbstractFileByPath(relativeVaultPath);
    if (tfile) {
      void this.app.workspace.openLinkText(tfile.path, "", false);
      new Notice(`Opened ${htmlFileName} in Obsidian.`);
    } else {
      window.open(`file:///${fullHtmlPath.replace(/\\/g, "/")}`, "_blank");
    }
  }

  private openInDefaultBrowser(app: AppScanRecord) {
    const liveUrl =
      app.hosting.firebase?.liveUrl ||
      app.hosting.githubPages?.url ||
      app.catalog?.linkLive;

    if (liveUrl && (liveUrl.startsWith("http://") || liveUrl.startsWith("https://"))) {
      window.open(liveUrl, "_blank");
      return;
    }

    const fullHtmlPath = this.path?.join(app.absolutePath, "index.html") || app.absolutePath;
    if ((window as any).electron?.shell?.openExternal) {
      (window as any).electron.shell.openExternal(`file:///${fullHtmlPath.replace(/\\/g, "/")}`);
    } else {
      window.open(`file:///${fullHtmlPath.replace(/\\/g, "/")}`, "_blank");
    }
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

  private handleSetupGitHubPages(app: AppScanRecord) {
    if (!app.git.remoteUrl) {
      new Notice("⚠️ GitHub Pages requires a linked GitHub remote repository first.");
      const defaultTitle = app.catalog?.title || app.folderName;
      const ghUser = this.store.health?.cli.gh.userEmail || "pakcli";
      new LinkRemoteModal(
        this.app,
        defaultTitle,
        async (url) => {
          const res = await this.store.linkRemoteForApp(app, url);
          new Notice(res.message);
          const ghRes = await this.store.setupGitHubPagesForApp(app);
          new Notice(ghRes.message);
          this.store.selectApp(app);
          this.hostDrawer.open(app);
        },
        ghUser
      ).open();
      return;
    }

    void (async () => {
      const res = await this.store.setupGitHubPagesForApp(app);
      new Notice(res.message);
      this.store.selectApp(app);
      this.hostDrawer.open(app);
    })();
  }

  private openHostProviderMenu(e: MouseEvent, app: AppScanRecord) {
    const menu = new Menu();
    menu.addItem((item) => {
      // Clean title, no duplicate emoji
      item.setTitle("Firebase Hosting").setIcon("flame").onClick(() => {
        new SetupFirebaseModal(this.app, this.store, app, () => {
          this.store.selectApp(app);
          this.hostDrawer.open(app);
        }).open();
      });
    });
    menu.addItem((item) => {
      // Clean title, no duplicate emoji
      item.setTitle("GitHub Pages").setIcon("github").onClick(() => {
        this.handleSetupGitHubPages(app);
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
