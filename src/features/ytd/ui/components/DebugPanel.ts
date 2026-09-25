import { setIcon, Notice } from "obsidian";
import { taskManager } from "../../utils/taskManager";

export class DebugPanel {
  private containerEl: HTMLElement;
  private headerEl: HTMLElement;
  private bodyEl: HTMLElement;
  private logsEl: HTMLElement;
  private isCollapsed: boolean = true;
  private mode: "this" | "all" = "this";
  private withDateInfo: boolean = false;
  private currentTaskId: string | null = null;
  private unsubscribe?: () => void;

  constructor(parentEl: HTMLElement) {
    this.containerEl = parentEl.createDiv({ cls: "ytec-debug-panel is-collapsed" });

    // Header bar
    this.headerEl = this.containerEl.createDiv({ cls: "ytec-debug-header" });

    const titleEl = this.headerEl.createDiv({ cls: "ytec-debug-title" });
    const collapseIcon = titleEl.createSpan({ cls: "ytec-debug-toggle-icon" });
    setIcon(collapseIcon, "chevron-right");
    titleEl.createSpan({ text: "🐛 Debug Console" });

    this.headerEl.addEventListener("click", (e) => {
      // Don't toggle if clicking on controls inside header
      if ((e.target as HTMLElement).closest(".ytec-debug-controls")) return;
      this.toggleCollapse();
    });

    // Header Controls
    const controlsEl = this.headerEl.createDiv({ cls: "ytec-debug-controls" });

    // Mode Radios: (● This Download | ○ All Instances)
    const modeWrapper = controlsEl.createDiv({ cls: "ytec-debug-mode-group" });
    const thisRadio = modeWrapper.createEl("label", { cls: "ytec-radio-label" });
    const thisInput = thisRadio.createEl("input", { type: "radio", attr: { name: "debug-mode", value: "this" } });
    thisInput.checked = true;
    thisRadio.createSpan({ text: "This Download" });
    thisInput.addEventListener("change", () => {
      this.mode = "this";
      this.renderLogs();
    });

    const allRadio = modeWrapper.createEl("label", { cls: "ytec-radio-label" });
    const allInput = allRadio.createEl("input", { type: "radio", attr: { name: "debug-mode", value: "all" } });
    allRadio.createSpan({ text: "All Instances" });
    allInput.addEventListener("change", () => {
      this.mode = "all";
      this.renderLogs();
    });

    // +date_info toggle checkbox
    const dateLabel = controlsEl.createEl("label", { cls: "ytec-checkbox-label" });
    const dateInput = dateLabel.createEl("input", { type: "checkbox" });
    dateInput.checked = this.withDateInfo;
    dateLabel.createSpan({ text: "+date_info" });
    dateInput.addEventListener("change", () => {
      this.withDateInfo = dateInput.checked;
      this.renderLogs();
    });

    // Copy button
    const copyBtn = controlsEl.createEl("button", {
      cls: "ytec-btn ytec-btn-sm ytec-btn-copy",
      type: "button",
      text: "📋 Copy",
    });
    copyBtn.title = "Copy log output to clipboard";
    copyBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.copyLogs();
    });

    // Body
    this.bodyEl = this.containerEl.createDiv({ cls: "ytec-debug-body" });
    this.logsEl = this.bodyEl.createDiv({ cls: "ytec-debug-log-view" });

    // Subscribe to taskManager events
    this.unsubscribe = taskManager.subscribe(() => {
      if (!this.isCollapsed) {
        this.renderLogs();
      }
    });

    this.renderLogs();
  }

  destroy(): void {
    this.unsubscribe?.();
  }

  setCurrentTaskId(taskId: string | null): void {
    this.currentTaskId = taskId;
    if (!this.isCollapsed) {
      this.renderLogs();
    }
  }

  toggleCollapse(): void {
    this.isCollapsed = !this.isCollapsed;
    const iconEl = this.headerEl.querySelector(".ytec-debug-toggle-icon") as HTMLElement;
    if (this.isCollapsed) {
      this.containerEl.addClass("is-collapsed");
      if (iconEl) setIcon(iconEl, "chevron-right");
    } else {
      this.containerEl.removeClass("is-collapsed");
      if (iconEl) setIcon(iconEl, "chevron-down");
      this.renderLogs();
    }
  }

  renderLogs(): void {
    this.logsEl.empty();

    const targetTaskId = this.mode === "this" ? (this.currentTaskId || undefined) : undefined;
    const lines = taskManager.getFormattedLogs({
      taskId: targetTaskId,
      withDateInfo: this.withDateInfo,
    });

    if (lines.length === 0) {
      this.logsEl.createDiv({
        cls: "ytec-log-empty",
        text: this.mode === "this"
          ? "No debug logs for current task yet."
          : "No debug logs recorded yet.",
      });
      return;
    }

    for (const line of lines) {
      const lineEl = this.logsEl.createDiv({ cls: "ytec-log-line" });
      if (line.includes("[ERROR]") || line.includes("Failed")) {
        lineEl.addClass("is-error");
      } else if (line.includes("[WARN]")) {
        lineEl.addClass("is-warn");
      }
      lineEl.setText(line);
    }

    // Auto-scroll to bottom
    this.logsEl.scrollTop = this.logsEl.scrollHeight;
  }

  private async copyLogs(): Promise<void> {
    const targetTaskId = this.mode === "this" ? (this.currentTaskId || undefined) : undefined;
    const lines = taskManager.getFormattedLogs({
      taskId: targetTaskId,
      withDateInfo: this.withDateInfo,
    });

    const text = lines.join("\n");
    if (!text) {
      new Notice("Debug log is empty.");
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      new Notice("📋 Debug logs copied to clipboard!");
    } catch {
      new Notice("Failed to copy logs to clipboard.");
    }
  }

  /**
   * Helper to render inline debug drawer directly under a TableView row
   */
  static renderInlineRowDebug(
    parentEl: HTMLElement,
    task: { id: string; title: string; logs: string[] }
  ): HTMLElement {
    const drawerEl = parentEl.createDiv({ cls: "ytec-inline-debug-drawer" });
    const header = drawerEl.createDiv({ cls: "ytec-inline-debug-header" });
    header.createSpan({ text: `🐛 Debug Log: ${task.title}` });

    const copyBtn = header.createEl("button", {
      cls: "ytec-btn ytec-btn-xs",
      text: "📋 Copy",
      type: "button",
    });
    copyBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await navigator.clipboard.writeText(task.logs.join("\n"));
      new Notice("Row logs copied!");
    });

    const logBox = drawerEl.createDiv({ cls: "ytec-inline-debug-box" });
    if (task.logs.length === 0) {
      logBox.createDiv({ cls: "ytec-log-empty", text: "No logs recorded for this task." });
    } else {
      task.logs.forEach((l) => {
        logBox.createDiv({ cls: "ytec-log-line", text: l });
      });
      logBox.scrollTop = logBox.scrollHeight;
    }

    return drawerEl;
  }
}
