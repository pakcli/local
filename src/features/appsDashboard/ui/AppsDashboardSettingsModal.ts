import { App, Setting, Notice } from "obsidian";
import { BaseModal } from "../../../uiComponents";
import type { AppDashboardStore } from "../store/AppDashboardStore";
import type { AppsDashboardSettings, FrontmatterFieldMapping } from "../types";
import {
  ALL_AVAILABLE_COLUMNS,
  DEFAULT_VISIBLE_COLUMNS,
  DEFAULT_FRONTMATTER_MAPPING,
} from "../types";

export class AppsDashboardSettingsModal extends BaseModal {
  private store: AppDashboardStore;
  private currentSettings: AppsDashboardSettings;

  constructor(app: App, store: AppDashboardStore) {
    super(app, {
      title: "Apps Dashboard Settings",
      subtitle: "Configure apps directory, column visibility, and frontmatter field mapping.",
      badgeText: "Settings",
      badgeCls: "is-info",
      width: "640px",
    });
    this.store = store;
    const existing = this.store.getSettings();
    this.currentSettings = {
      ...existing,
      frontmatterMapping: {
        ...DEFAULT_FRONTMATTER_MAPPING,
        ...(existing.frontmatterMapping || {}),
      },
      visibleColumns:
        Array.isArray(existing.visibleColumns) && existing.visibleColumns.length > 0
          ? [...existing.visibleColumns]
          : [...DEFAULT_VISIBLE_COLUMNS],
    };
  }

  renderBody(bodyEl: HTMLElement): void {
    bodyEl.empty();
    bodyEl.style.maxHeight = "72vh";
    bodyEl.style.overflowY = "auto";
    bodyEl.style.paddingRight = "8px";

    // ─── SECTION 1: Directory & Scanning ─────────────────────────────────────
    const sec1 = bodyEl.createDiv({ cls: "pakcli-settings-section" });
    sec1.createEl("h3", { text: "📁 Directory & Scanning", cls: "setting-item-heading" });

    new Setting(sec1)
      .setName("Apps Root Folder")
      .setDesc("Vault-relative path (e.g. root/apps/ or apps/), home (~/apps), or absolute path.")
      .addText((text) => {
        text
          .setPlaceholder("root/apps/")
          .setValue(this.currentSettings.appsRootFolder || "root/apps/")
          .onChange((val) => {
            this.currentSettings.appsRootFolder = val.trim() || "root/apps/";
          });
        text.inputEl.style.width = "240px";
      });

    new Setting(sec1)
      .setName("Scan Depth")
      .setDesc("How many subdirectory levels to scan for applications (1 = direct child folders).")
      .addDropdown((drop) => {
        drop
          .addOption("1", "1 Level (Recommended)")
          .addOption("2", "2 Levels (Monorepo)")
          .setValue(String(this.currentSettings.scanDepth || 1))
          .onChange((val) => {
            this.currentSettings.scanDepth = parseInt(val, 10) || 1;
          });
      });

    new Setting(sec1)
      .setName("Demo Mode")
      .setDesc("Simulate 5 static applications with live Firebase and GitHub Pages mocks.")
      .addToggle((toggle) => {
        toggle
          .setValue(this.currentSettings.demoMode ?? false)
          .onChange((val) => {
            this.currentSettings.demoMode = val;
          });
      });

    // ─── SECTION 2: Column Visibility ────────────────────────────────────────
    const sec2 = bodyEl.createDiv({ cls: "pakcli-settings-section" });
    const sec2Header = sec2.createDiv({ cls: "pakcli-settings-header-row" });
    sec2Header.createEl("h3", { text: "📊 Column Visibility", cls: "setting-item-heading" });

    const resetColsBtn = sec2Header.createEl("button", {
      cls: "pakcli-btn-secondary mod-small",
      text: "↺ Reset Columns",
      attr: { type: "button", title: "Reset visible columns to defaults" },
    });
    resetColsBtn.addEventListener("click", () => {
      this.currentSettings.visibleColumns = [...DEFAULT_VISIBLE_COLUMNS];
      this.renderBody(bodyEl);
      new Notice("Reset visible columns to defaults.");
    });

    sec2.createEl("p", {
      cls: "setting-item-description",
      text: "Select which columns appear by default in the apps portfolio table.",
    });

    const colsGrid = sec2.createDiv({ cls: "pakcli-columns-checkbox-grid" });
    colsGrid.style.display = "grid";
    colsGrid.style.gridTemplateColumns = "repeat(auto-fill, minmax(180px, 1fr))";
    colsGrid.style.gap = "8px";
    colsGrid.style.marginBottom = "16px";

    const visibleSet = new Set(this.currentSettings.visibleColumns);

    for (const col of ALL_AVAILABLE_COLUMNS) {
      const colLabel = colsGrid.createEl("label", { cls: "pakcli-column-item" });
      colLabel.style.display = "flex";
      colLabel.style.alignItems = "center";
      colLabel.style.gap = "6px";
      colLabel.style.fontSize = "0.85rem";
      colLabel.style.cursor = "pointer";

      const cb = colLabel.createEl("input", { attr: { type: "checkbox" } });
      cb.checked = visibleSet.has(col.id);
      cb.addEventListener("change", () => {
        if (cb.checked) {
          visibleSet.add(col.id);
        } else {
          if (visibleSet.size > 1) {
            visibleSet.delete(col.id);
          } else {
            cb.checked = true;
            new Notice("At least one column must remain visible.");
          }
        }
        this.currentSettings.visibleColumns = Array.from(visibleSet);
      });

      colLabel.createSpan({ text: col.label });
      if (col.category === "catalog") {
        const catBadge = colLabel.createSpan({ cls: "pakcli-tag-badge", text: "catalog" });
        catBadge.style.fontSize = "0.7rem";
        catBadge.style.opacity = "0.7";
      }
    }

    // ─── SECTION 3: Frontmatter Field Mapping ─────────────────────────────────
    const sec3 = bodyEl.createDiv({ cls: "pakcli-settings-section" });
    const sec3Header = sec3.createDiv({ cls: "pakcli-settings-header-row" });
    sec3Header.createEl("h3", { text: "🏷️ Frontmatter Field Mapping (index.md)", cls: "setting-item-heading" });

    const resetFmBtn = sec3Header.createEl("button", {
      cls: "pakcli-btn-secondary mod-small",
      text: "↺ Reset Mapping",
      attr: { type: "button", title: "Reset frontmatter keys to default YAML field names" },
    });
    resetFmBtn.addEventListener("click", () => {
      this.currentSettings.frontmatterMapping = { ...DEFAULT_FRONTMATTER_MAPPING };
      this.renderBody(bodyEl);
      new Notice("Reset frontmatter field mapping to defaults.");
    });

    sec3.createEl("p", {
      cls: "setting-item-description",
      text: "Assign and customize YAML frontmatter keys from index.md to dashboard columns.",
    });

    const mapping = this.currentSettings.frontmatterMapping;

    const createMappingField = (
      name: string,
      desc: string,
      keyName: keyof FrontmatterFieldMapping,
      placeholder: string
    ) => {
      new Setting(sec3)
        .setName(name)
        .setDesc(desc)
        .addText((text) => {
          text
            .setPlaceholder(placeholder)
            .setValue(mapping[keyName] || placeholder)
            .onChange((val) => {
              mapping[keyName] = val.trim() || placeholder;
            });
          text.inputEl.style.width = "180px";
        });
    };

    createMappingField("Title Key", "Frontmatter key for app title/display name.", "titleKey", "title");
    createMappingField("Category Key", "Frontmatter key for application category.", "categoryKey", "category");
    createMappingField("Tags Key", "Frontmatter key for tags (supports bullet list or inline array).", "tagsKey", "tags");
    createMappingField("Badge Key", "Frontmatter key for version badge or status tag.", "badgeKey", "badge");
    createMappingField("Image / Thumbnail Key", "Frontmatter key for preview image (e.g. img or thumbnail).", "imgKey", "img");
    createMappingField("Light Mode Image Key", "Frontmatter key for light mode screenshot.", "imgLightKey", "imgLight");
    createMappingField("Dark Mode Image Key", "Frontmatter key for dark mode screenshot.", "imgDarkKey", "imgDark");
    createMappingField("GitHub Pages Domain Key", "Frontmatter key for custom GitHub Pages domain prefix.", "gitPageKey", "git-page");
    createMappingField("GitHub Repository Key", "Frontmatter key for GitHub repository URL.", "githubKey", "github");
  }

  renderFooter(footerEl: HTMLElement): void {
    footerEl.empty();

    const cancelBtn = footerEl.createEl("button", {
      cls: "pakcli-btn-secondary",
      text: "Cancel",
      attr: { type: "button" },
    });
    cancelBtn.addEventListener("click", () => this.close());

    const saveBtn = footerEl.createEl("button", {
      cls: "mod-cta pakcli-btn-primary",
      text: "Save & Rescan",
      attr: { type: "button" },
    });
    saveBtn.addEventListener("click", () => {
      this.store.updateSettings(this.currentSettings);
      new Notice("Settings saved. Rescanning apps...");
      this.close();
    });
  }
}
