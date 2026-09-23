import { setIcon } from "obsidian";
import { taskManager } from "../../utils/taskManager";

export interface TaskFooterOptions {
  onViewAllTasks?: () => void;
}

export class TaskFooter {
  private containerEl: HTMLElement;
  private options: TaskFooterOptions;
  private unsubscribe?: () => void;

  constructor(parentEl: HTMLElement, options: TaskFooterOptions = {}) {
    this.options = options;
    this.containerEl = parentEl.createDiv({ cls: "ytec-footer-container" });

    this.render();
    this.unsubscribe = taskManager.subscribe(() => {
      this.render();
    });
  }

  destroy(): void {
    this.unsubscribe?.();
  }

  render(): void {
    this.containerEl.empty();

    const tasks = taskManager.getTasks();
    const activeTasks = tasks.filter(
      (t) => t.status === "downloading" || t.status === "fetching" || t.status === "deps" || t.status === "queued"
    );

    // 1. Idle / All Complete State
    if (activeTasks.length === 0) {
      const doneTasks = tasks.filter((t) => t.status === "done");
      const completeEl = this.containerEl.createDiv({ cls: "ytec-footer-content is-idle" });
      const iconSpan = completeEl.createSpan({ cls: "ytec-footer-icon" });
      setIcon(iconSpan, "check-circle");

      if (doneTasks.length > 0) {
        completeEl.createSpan({
          cls: "ytec-footer-text",
          text: `All tasks complete (${doneTasks.length} ${doneTasks.length === 1 ? "download" : "downloads"})`,
        });

        const clearBtn = completeEl.createEl("button", {
          cls: "ytec-btn ytec-btn-xs ytec-footer-btn",
          text: "Clear History",
          type: "button",
        });
        clearBtn.addEventListener("click", () => {
          taskManager.clearCompleted();
        });
      } else {
        completeEl.createSpan({
          cls: "ytec-footer-text",
          text: "Ready — paste a link to begin downloading",
        });
      }
      return;
    }

    // 2. Single Active Task State
    if (activeTasks.length === 1) {
      const task = activeTasks[0];
      const singleEl = this.containerEl.createDiv({ cls: "ytec-footer-content is-active" });

      const iconSpan = singleEl.createSpan({ cls: "ytec-footer-icon is-pulsing" });
      setIcon(iconSpan, "loader");

      const titleClean = task.title ? task.title.slice(0, 32) : task.url.slice(0, 32);
      const percent = Math.min(100, Math.max(0, task.progress.percent || 0));

      singleEl.createSpan({
        cls: "ytec-footer-text",
        text: `Downloading: ${titleClean} (${task.quality})`,
      });

      // Mini Progress Bar
      const barContainer = singleEl.createDiv({ cls: "ytec-footer-bar-bg" });
      barContainer.createDiv({
        cls: "ytec-footer-bar-fill",
        attr: { style: `width: ${percent}%;` },
      });

      singleEl.createSpan({
        cls: "ytec-footer-percent",
        text: `${percent.toFixed(0)}%`,
      });

      const bgBtn = singleEl.createEl("button", {
        cls: "ytec-btn ytec-btn-xs ytec-footer-btn",
        text: "⊞ Background",
        type: "button",
      });
      bgBtn.title = "Task runs in background";
      return;
    }

    // 3. Multiple Concurrent Downloads State
    const multiEl = this.containerEl.createDiv({ cls: "ytec-footer-content is-active" });
    const iconSpan = multiEl.createSpan({ cls: "ytec-footer-icon is-pulsing" });
    setIcon(iconSpan, "download-cloud");

    const downloadingCount = activeTasks.length;
    const totalCount = tasks.length;

    // Average progress
    const avgPercent =
      activeTasks.reduce((acc, t) => acc + (t.progress.percent || 0), 0) / (activeTasks.length || 1);

    multiEl.createSpan({
      cls: "ytec-footer-text",
      text: `${downloadingCount} / ${totalCount} downloading`,
    });

    const barContainer = multiEl.createDiv({ cls: "ytec-footer-bar-bg" });
    barContainer.createDiv({
      cls: "ytec-footer-bar-fill",
      attr: { style: `width: ${Math.min(100, avgPercent)}%;` },
    });

    multiEl.createSpan({
      cls: "ytec-footer-percent",
      text: `${avgPercent.toFixed(0)}%`,
    });

    const viewAllBtn = multiEl.createEl("button", {
      cls: "ytec-btn ytec-btn-xs mod-cta ytec-footer-btn",
      text: "📋 View All Tasks",
      type: "button",
    });
    viewAllBtn.addEventListener("click", () => {
      this.options.onViewAllTasks?.();
    });
  }
}
