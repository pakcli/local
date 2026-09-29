import { App, Modal } from "obsidian";

export interface ConsentResult {
  confirmed: boolean;
  neverAskAgain: boolean;
}

/**
 * Security consent modal shown before any -ExecutionPolicy Bypass execution.
 * Displays the EXACT CLI string to be run so the user knows what will happen.
 *
 * Usage:
 *   const result = await ConsentModal.ask(app, "pwsh", "winget install yt-dlp.yt-dlp");
 *   if (!result.confirmed) return;
 *   if (result.neverAskAgain) persistFlag();
 */
export class ConsentModal extends Modal {
  private result: ConsentResult = { confirmed: false, neverAskAgain: false };
  private resolve!: (r: ConsentResult) => void;

  constructor(
    app: App,
    private psExe: string,
    private command: string
  ) {
    super(app);
  }

  /** Open the consent modal and await user decision. */
  static ask(
    app: App,
    psExe: string,
    command: string
  ): Promise<ConsentResult> {
    const modal = new ConsentModal(app, psExe, command);
    return new Promise((res) => {
      modal.resolve = res;
      modal.open();
    });
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("pakcli-consent-modal");

    // ── Title ──
    contentEl.createEl("h2", {
      text: "⚡ PowerShell Elevated Execution — Confirm",
    });

    // ── Explanation ──
    contentEl.createEl("p", {
      cls: "pakcli-consent-desc",
      text: "This action will run a PowerShell command with a temporary execution policy bypass. This does NOT permanently change your system policy — it applies to this single command only.",
    });

    // ── Exact CLI preview ──
    contentEl.createEl("p", {
      cls: "pakcli-consent-label",
      text: "Exact command to be executed:",
    });
    const cliStr = `${this.psExe} -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "${this.command}"`;
    const pre = contentEl.createEl("pre", { cls: "pakcli-consent-code" });
    pre.createEl("code", { text: cliStr });

    // ── Warning ──
    contentEl.createEl("p", {
      cls: "pakcli-consent-warning",
      text: "⚠️  winget requires internet access and may take 30–120 seconds. Do not close Obsidian during installation.",
    });

    // ── Never ask again checkbox ──
    const checkRow = contentEl.createDiv({ cls: "pakcli-consent-check-row" });
    const checkbox = checkRow.createEl("input", {
      attr: { type: "checkbox", id: "pakcli-consent-never-ask" },
    });
    checkRow.createEl("label", {
      text: "Never ask again for this session",
      attr: { for: "pakcli-consent-never-ask" },
    });
    checkRow.createEl("span", {
      cls: "pakcli-consent-reset-hint",
      text: " (Reset anytime in Settings → Security & Permissions)",
    });

    // ── Buttons ──
    const btnRow = contentEl.createDiv({ cls: "pakcli-consent-btn-row" });

    const cancelBtn = btnRow.createEl("button", {
      text: "Cancel",
      cls: "pakcli-consent-btn-cancel",
    });
    cancelBtn.onclick = () => {
      this.result = { confirmed: false, neverAskAgain: false };
      this.resolve(this.result);
      this.close();
    };

    const runBtn = btnRow.createEl("button", {
      text: "▶ Allow & Run",
      cls: "pakcli-consent-btn-run",
    });
    runBtn.onclick = () => {
      this.result = {
        confirmed: true,
        neverAskAgain: (checkbox as HTMLInputElement).checked,
      };
      this.resolve(this.result);
      this.close();
    };
  }

  onClose(): void {
    // Resolve with cancelled if user pressed ESC or clicked outside
    if (!this.result.confirmed) {
      this.resolve({ confirmed: false, neverAskAgain: false });
    }
    this.contentEl.empty();
  }
}
