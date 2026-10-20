import { App, Setting, Notice } from "obsidian";
import { BaseModal } from "../../../uiComponents";
import type { AppDashboardStore } from "../store/AppDashboardStore";
import type { AppsDashboardSettings } from "../types";

export class AppsDashboardSettingsModal extends BaseModal {
  private store: AppDashboardStore;
  private currentSettings: AppsDashboardSettings;

  constructor(app: App, store: AppDashboardStore) {
    super(app, {
      title: "Apps Dashboard Settings",
      subtitle: "Configure apps directory, scan depth, and demo preview mode.",
      badgeText: "Settings",
      badgeCls: "is-info",
      width: "520px",
    });
    this.store = store;
    this.currentSettings = { ...this.store.getSettings() };
  }

  renderBody(bodyEl: HTMLElement): void {
    bodyEl.empty();

    // 1. Root folder path setting
    new Setting(bodyEl)
      .setName("Apps Root Folder")
      .setDesc("Vault-relative path (e.g. root/apps/ or apps/), home (~/apps), or absolute path.")
      .addText((text) => {
        text
          .setPlaceholder("root/apps/")
          .setValue(this.currentSettings.appsRootFolder || "root/apps/")
          .onChange((val) => {
            this.currentSettings.appsRootFolder = val.trim() || "root/apps/";
          });
        text.inputEl.style.width = "220px";
      });

    // 2. Scan Depth
    new Setting(bodyEl)
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

    // 3. Demo Mode Toggle
    new Setting(bodyEl)
      .setName("Demo Mode")
      .setDesc("Simulate 5 static applications with live Firebase and GitHub Pages mocks.")
      .addToggle((toggle) => {
        toggle
          .setValue(this.currentSettings.demoMode ?? false)
          .onChange((val) => {
            this.currentSettings.demoMode = val;
          });
      });
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
