import { App, Setting, Notice } from "obsidian";
import { BaseModal } from "../../../uiComponents";
import type { AppDashboardStore } from "../store/AppDashboardStore";
import type { AppScanRecord, FirebaseProjectSummary } from "../types";
import { getNodeFs, getNodePath } from "../../../utils/nodeHelpers";

export class SetupFirebaseModal extends BaseModal {
  private store: AppDashboardStore;
  private appRecord: AppScanRecord;
  private onDone?: () => void;
  private selectedProject = "";
  private publicDir = ".";
  private projects: FirebaseProjectSummary[] = [];
  private isLoadingProjects = false;
  private fs = getNodeFs();
  private path = getNodePath();

  constructor(
    app: App,
    store: AppDashboardStore,
    appRecord: AppScanRecord,
    onDone?: () => void
  ) {
    super(app, {
      title: "Setup Firebase Hosting",
      subtitle: `Configure Google Firebase static hosting for "${appRecord.catalog?.title || appRecord.folderName}".`,
      badgeText: "Firebase",
      badgeCls: "is-warning",
      width: "560px",
    });
    this.store = store;
    this.appRecord = appRecord;
    this.onDone = onDone;

    // Detect public directory automatically
    if (this.fs && this.path) {
      const distPath = this.path.join(appRecord.absolutePath, "dist");
      const buildPath = this.path.join(appRecord.absolutePath, "build");
      if (this.fs.existsSync(distPath)) {
        this.publicDir = "dist";
      } else if (this.fs.existsSync(buildPath)) {
        this.publicDir = "build";
      } else {
        this.publicDir = ".";
      }
    }

    // Default project from current hosting or folder name
    this.selectedProject = appRecord.hosting.firebase?.siteId || "pakcli";
  }

  async onOpen() {
    super.onOpen();
    await this.loadProjects();
  }

  private async loadProjects() {
    this.isLoadingProjects = true;
    try {
      this.projects = await this.store.listFirebaseProjects();
      if (this.projects.length > 0) {
        // If current project exists in list, keep it; else pick first or pakcli
        const hasCurrent = this.projects.some((p) => p.projectId === this.selectedProject);
        if (!hasCurrent) {
          const pakcliProj = this.projects.find((p) => p.projectId === "pakcli");
          this.selectedProject = pakcliProj ? pakcliProj.projectId : this.projects[0].projectId;
        }
      }
    } catch (e) {
      console.warn("[SetupFirebaseModal] Failed to load projects:", e);
    } finally {
      this.isLoadingProjects = false;
      if (this.contentEl) {
        const bodyEl = this.contentEl.querySelector(".modal-body") as HTMLElement;
        if (bodyEl) this.renderBody(bodyEl);
      }
    }
  }

  renderBody(bodyEl: HTMLElement): void {
    bodyEl.empty();
    bodyEl.style.padding = "8px 4px";

    // 1. Account Info Banner
    const banner = bodyEl.createDiv({ cls: "pakcli-info-banner" });
    banner.style.padding = "10px 14px";
    banner.style.background = "var(--background-secondary)";
    banner.style.borderRadius = "var(--radius-s, 4px)";
    banner.style.border = "1px solid var(--background-modifier-border)";
    banner.style.marginBottom = "16px";
    banner.style.fontSize = "0.85rem";

    const bannerTitle = banner.createDiv({ cls: "text-muted" });
    bannerTitle.textContent = "Google Firebase Authenticated CLI Session:";
    const emailText = this.store.health?.cli.firebase.userEmail || "dcalibri@gmail.com";
    const bannerUser = banner.createEl("strong", { text: `🔥 ${emailText}` });
    bannerUser.style.color = "var(--text-accent)";

    // 2. Project Selection Setting
    const projSetting = new Setting(bodyEl)
      .setName("Firebase Project ID")
      .setDesc("Select an existing project from your Firebase account or enter manually.");

    if (this.isLoadingProjects) {
      projSetting.addText((t) => {
        t.setValue("Fetching projects from CLI...").setDisabled(true);
      });
    } else if (this.projects.length > 0) {
      projSetting.addDropdown((drop) => {
        for (const p of this.projects) {
          drop.addOption(p.projectId, `${p.displayName} (${p.projectId})`);
        }
        drop.setValue(this.selectedProject);
        drop.onChange((val) => {
          this.selectedProject = val;
        });
      });
    } else {
      projSetting.addText((text) => {
        text.setPlaceholder("e.g. pakcli").setValue(this.selectedProject).onChange((val) => {
          this.selectedProject = val.trim();
        });
      });
    }

    projSetting.addButton((btn) => {
      btn.setButtonText("🔄 Refresh").setTooltip("Re-query Firebase CLI projects").onClick(async () => {
        btn.setDisabled(true);
        await this.loadProjects();
        btn.setDisabled(false);
      });
    });

    // 3. Public Directory Setting
    new Setting(bodyEl)
      .setName("Public Directory (Hosting Root)")
      .setDesc(
        `Directory containing index.html to deploy. Detected: '${this.publicDir}'. Use '.' for app root, or 'dist'/'build'.`
      )
      .addText((text) => {
        text
          .setPlaceholder(".")
          .setValue(this.publicDir)
          .onChange((val) => {
            this.publicDir = val.trim() || ".";
          });
        text.inputEl.style.width = "140px";
      });

    // 4. Generated Config Preview
    const previewBox = bodyEl.createDiv({ cls: "pakcli-code-preview-box" });
    previewBox.style.marginTop = "14px";
    previewBox.style.padding = "10px";
    previewBox.style.background = "var(--background-secondary-alt, var(--background-secondary))";
    previewBox.style.borderRadius = "4px";
    previewBox.style.fontSize = "0.78rem";
    previewBox.style.fontFamily = "var(--font-monospace)";
    previewBox.style.border = "1px solid var(--background-modifier-border)";

    previewBox.createDiv({ text: `📁 .firebaserc -> default: "${this.selectedProject}"` });
    previewBox.createDiv({ text: `📁 firebase.json -> hosting.public: "${this.publicDir}"` });
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
      text: "Save & Configure",
      attr: { type: "button" },
    });
    saveBtn.addEventListener("click", async () => {
      if (!this.selectedProject) {
        new Notice("Please select or enter a valid Firebase Project ID.");
        return;
      }

      saveBtn.disabled = true;
      saveBtn.textContent = "Configuring...";

      const res = await this.store.setupFirebaseForApp(
        this.appRecord,
        this.selectedProject,
        this.publicDir
      );

      new Notice(res.message);
      this.onDone?.();
      this.close();
    });
  }
}
