import { App, Setting, Notice } from "obsidian";
import { BaseModal } from "../../../uiComponents";
import type { AppDashboardStore } from "../store/AppDashboardStore";
import type { SystemAccountsInfo, AppScanRecord } from "../types";

export function maskAccountIdentifier(str: string, unmask = false): string {
  if (!str) return "-";
  if (unmask) return str;
  if (str.includes("@")) {
    const [local, domain] = str.split("@");
    if (local.length <= 2) {
      return `${local}***@${domain}`;
    }
    return `${local.slice(0, 2)}${"*".repeat(Math.min(local.length - 2, 6))}@${domain}`;
  }
  if (str.length <= 2) {
    return `${str}***`;
  }
  return `${str.slice(0, 2)}${"*".repeat(Math.min(str.length - 2, 6))}`;
}

export function maskSensitiveUrl(url: string, unmask = false): string {
  if (!url || unmask) return url;
  let res = url.replace(/(github\.com[/:])([a-zA-Z0-9_-]+)(\/)/gi, (_m, p1, owner, p3) => {
    return `${p1}${maskAccountIdentifier(owner, false)}${p3}`;
  });
  res = res.replace(/([a-zA-Z0-9_-]+)(\.github\.io)/gi, (_m, owner, domain) => {
    return `${maskAccountIdentifier(owner, false)}${domain}`;
  });
  res = res.replace(/([/\\][Uu]sers[/\\])([^/\\]+)([/\\])/g, (_m, p1, user, p3) => {
    return `${p1}${maskAccountIdentifier(user, false)}${p3}`;
  });
  return res;
}

export class AccountManagerModal extends BaseModal {
  private store: AppDashboardStore;
  private targetApp?: AppScanRecord;
  private accountsInfo?: SystemAccountsInfo;
  private isLoading = true;
  private isUnmasked = false;
  private selectedFbEmail = "";

  constructor(app: App, store: AppDashboardStore, targetApp?: AppScanRecord) {
    super(app, {
      title: "Account Manager (Local PC)",
      subtitle: "Switch, assign, or authenticate Google Firebase & GitHub accounts on this machine.",
      badgeText: "Accounts",
      badgeCls: "is-info",
      width: "600px",
    });
    this.store = store;
    this.targetApp = targetApp;
  }

  async onOpen() {
    super.onOpen();
    await this.loadAccounts();
  }

  private async loadAccounts() {
    this.isLoading = true;
    try {
      this.accountsInfo = await this.store.getSystemAccounts();
      this.selectedFbEmail =
        this.accountsInfo.firebase.activeEmail ||
        (this.accountsInfo.firebase.availableEmails.length > 0
          ? this.accountsInfo.firebase.availableEmails[0]
          : "");
    } catch (e) {
      console.warn("[AccountManagerModal] Failed to load accounts:", e);
    } finally {
      this.isLoading = false;
      if (this.contentEl) {
        const bodyEl = this.contentEl.querySelector(".modal-body") as HTMLElement;
        if (bodyEl) this.renderBody(bodyEl);
      }
    }
  }

  renderBody(bodyEl: HTMLElement): void {
    bodyEl.empty();
    bodyEl.style.maxHeight = "72vh";
    bodyEl.style.overflowY = "auto";
    bodyEl.style.padding = "6px 8px";

    // 0. Privacy Header Bar
    const topBar = bodyEl.createDiv({ cls: "pakcli-accounts-top-bar" });
    topBar.style.display = "flex";
    topBar.style.justifyContent = "space-between";
    topBar.style.alignItems = "center";
    topBar.style.marginBottom = "14px";
    topBar.style.padding = "6px 10px";
    topBar.style.background = "var(--background-secondary)";
    topBar.style.borderRadius = "var(--radius-s, 4px)";

    const infoLabel = topBar.createSpan({ cls: "text-muted", text: "🔒 Local PC Credentials Only" });
    infoLabel.style.fontSize = "0.78rem";

    const unmaskBtn = topBar.createEl("button", {
      cls: "pakcli-btn-secondary mod-small",
      text: this.isUnmasked ? "👁️ Mask (2 Letters)" : "👁️ Reveal Full",
      attr: { type: "button" },
    });
    unmaskBtn.addEventListener("click", () => {
      this.isUnmasked = !this.isUnmasked;
      this.renderBody(bodyEl);
    });

    if (this.isLoading) {
      bodyEl.createDiv({ cls: "text-muted", text: "Querying local CLI credentials..." });
      return;
    }

    // ─── 1. GOOGLE FIREBASE SECTION ──────────────────────────────────────────
    const fbSec = bodyEl.createDiv({ cls: "pakcli-account-section" });
    fbSec.style.marginBottom = "20px";
    fbSec.style.paddingBottom = "14px";
    fbSec.style.borderBottom = "1px solid var(--background-modifier-border)";

    fbSec.createEl("h3", { text: "🔥 Google Firebase Accounts (PC)", cls: "setting-item-heading" });

    const activeFb = this.accountsInfo?.firebase.activeEmail;
    const availFb = this.accountsInfo?.firebase.availableEmails || [];

    if (availFb.length === 0) {
      fbSec.createDiv({ cls: "text-muted", text: "No Google Firebase accounts currently logged in on this PC." });
    } else {
      const emailList = fbSec.createDiv({ cls: "pakcli-email-list" });
      emailList.style.display = "flex";
      emailList.style.flexDirection = "column";
      emailList.style.gap = "6px";
      emailList.style.marginBottom = "10px";

      for (const email of availFb) {
        const isActive = email === activeFb;
        const row = emailList.createEl("label");
        row.style.display = "flex";
        row.style.alignItems = "center";
        row.style.gap = "8px";
        row.style.cursor = "pointer";
        row.style.padding = "4px 8px";
        row.style.borderRadius = "4px";
        row.style.background = isActive ? "var(--background-modifier-hover)" : "transparent";

        const radio = row.createEl("input", {
          attr: { type: "radio", name: "firebase-account", value: email },
        });
        radio.checked = email === this.selectedFbEmail;
        radio.addEventListener("change", () => {
          this.selectedFbEmail = email;
        });

        const labelSpan = row.createSpan({
          text: maskAccountIdentifier(email, this.isUnmasked),
        });
        labelSpan.style.fontFamily = "var(--font-monospace)";
        labelSpan.style.fontSize = "0.85rem";

        if (isActive) {
          const badge = row.createSpan({ cls: "pakcli-tag-badge is-live", text: "ACTIVE" });
          badge.style.fontSize = "0.68rem";
        }
      }

      // Switch Account button (Zero browser!)
      const switchRow = fbSec.createDiv();
      switchRow.style.display = "flex";
      switchRow.style.gap = "8px";
      switchRow.style.marginTop = "8px";

      const switchBtn = switchRow.createEl("button", {
        cls: "mod-cta pakcli-btn-primary mod-small",
        text: "⇄ Switch Active Account (Zero Browser)",
        attr: { type: "button", title: "Run 'firebase login:use' instantly" },
      });
      switchBtn.addEventListener("click", async () => {
        if (!this.selectedFbEmail) return;
        switchBtn.disabled = true;
        const res = await this.store.switchFirebaseAccount(this.selectedFbEmail);
        new Notice(res.message);
        await this.loadAccounts();
        switchBtn.disabled = false;
      });

      const logoutBtn = switchRow.createEl("button", {
        cls: "pakcli-btn-secondary mod-small",
        text: "🚪 Logout Selected",
        attr: { type: "button", title: "Log out this account from PC" },
      });
      logoutBtn.addEventListener("click", async () => {
        if (!this.selectedFbEmail) return;
        logoutBtn.disabled = true;
        const res = await this.store.logoutFirebaseAccount(this.selectedFbEmail);
        new Notice(res.message);
        await this.loadAccounts();
        logoutBtn.disabled = false;
      });
    }

    // Interactive PowerShell Login button
    const fbPsRow = fbSec.createDiv();
    fbPsRow.style.marginTop = "10px";

    const fbPsBtn = fbPsRow.createEl("button", {
      cls: "pakcli-btn-secondary mod-small",
      text: "💻 Open PowerShell Login Console (New Account)",
      attr: { type: "button", title: "Launch interactive PowerShell window to authorize new Google account" },
    });
    fbPsBtn.addEventListener("click", () => {
      this.store.openInteractiveFirebaseLogin();
      new Notice("Launched interactive PowerShell login window. Return here and click [Refresh] when done.");
    });

    const refreshBtn = fbPsRow.createEl("button", {
      cls: "pakcli-btn-secondary mod-small",
      text: "🔄 Refresh",
      attr: { type: "button" },
    });
    refreshBtn.style.marginLeft = "6px";
    refreshBtn.addEventListener("click", () => void this.loadAccounts());

    // ─── 2. GITHUB ACCOUNT SECTION ───────────────────────────────────────────
    const ghSec = bodyEl.createDiv({ cls: "pakcli-account-section" });
    ghSec.createEl("h3", { text: "🐙 GitHub Account (PC)", cls: "setting-item-heading" });

    const ghUser = this.accountsInfo?.github.username || "pakcli";
    const ghEmail = this.accountsInfo?.github.email;

    const ghRow = ghSec.createDiv();
    ghRow.style.display = "flex";
    ghRow.style.alignItems = "center";
    ghRow.style.gap = "8px";
    ghRow.style.marginBottom = "8px";

    const ghUserLabel = ghRow.createSpan({
      text: `Username: ${maskAccountIdentifier(ghUser, this.isUnmasked)}`,
    });
    ghUserLabel.style.fontFamily = "var(--font-monospace)";
    ghUserLabel.style.fontSize = "0.85rem";

    if (ghEmail) {
      const ghEmailLabel = ghRow.createSpan({
        text: `(${maskAccountIdentifier(ghEmail, this.isUnmasked)})`,
        cls: "text-muted",
      });
      ghEmailLabel.style.fontSize = "0.78rem";
    }

    const ghBtnRow = ghSec.createDiv();
    ghBtnRow.style.display = "flex";
    ghBtnRow.style.gap = "8px";

    const ghPsBtn = ghBtnRow.createEl("button", {
      cls: "pakcli-btn-secondary mod-small",
      text: "💻 Open PowerShell GitHub Login",
      attr: { type: "button", title: "Launch interactive PowerShell window to run 'gh auth login'" },
    });
    ghPsBtn.addEventListener("click", () => {
      this.store.openInteractiveGitHubLogin();
      new Notice("Launched interactive PowerShell window for GitHub auth.");
    });
  }

  renderFooter(footerEl: HTMLElement): void {
    footerEl.empty();
    const closeBtn = footerEl.createEl("button", {
      cls: "pakcli-btn-secondary",
      text: "Close",
      attr: { type: "button" },
    });
    closeBtn.addEventListener("click", () => this.close());
  }
}
