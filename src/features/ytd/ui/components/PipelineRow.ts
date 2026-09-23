import { setIcon, Notice } from "obsidian";
import type { DownloadTask, PipelineStep } from "../../types";

export interface PipelineRowCallbacks {
  onCancel: (taskId: string) => void;
  onRetry: (taskId: string) => void;
}

const STEPS: Array<{ key: PipelineStep; label: string }> = [
  { key: "deps", label: "Deps" },
  { key: "fetch", label: "Fetch" },
  { key: "download", label: "Download" },
  { key: "done", label: "Done" },
];

export class PipelineRow {
  static render(parentEl: HTMLElement, task: DownloadTask, callbacks: PipelineRowCallbacks): HTMLElement {
    const rowEl = parentEl.createDiv({
      cls: `ytec-pipeline-row ${task.isRetried ? "is-dimmed" : ""} status-${task.status}`,
    });

    const flowEl = rowEl.createDiv({ cls: "ytec-pipeline-flow" });

    // Render 4-step pipeline nodes and connectors
    STEPS.forEach((step, idx) => {
      if (idx > 0) {
        flowEl.createSpan({ cls: "ytec-pipeline-connector", text: "→" });
      }

      const nodeEl = flowEl.createDiv({ cls: `ytec-pipeline-node node-${step.key}` });
      const state = PipelineRow.getStepState(task, step.key);

      nodeEl.addClass(`state-${state}`);

      const iconSpan = nodeEl.createSpan({ cls: "ytec-node-icon" });
      if (state === "done") {
        setIcon(iconSpan, "check");
      } else if (state === "active") {
        setIcon(iconSpan, "loader");
      } else if (state === "error") {
        setIcon(iconSpan, "alert-triangle");
      } else if (state === "cancelled") {
        setIcon(iconSpan, "x");
      } else {
        setIcon(iconSpan, "circle");
      }

      nodeEl.createSpan({ cls: "ytec-node-label", text: step.label });

      // Clickable error step -> show error tooltip and notice
      if (state === "error") {
        nodeEl.addClass("is-clickable-error");
        nodeEl.title = `Error: ${task.error || "Failed at this step"}. Click to view.`;
        nodeEl.addEventListener("click", () => {
          new Notice(`⚠️ ${step.label} Failed:\n${task.error || "Unknown error occurred"}`);
        });
      }
    });

    // Progress stats when actively downloading
    if (task.status === "downloading") {
      const statsEl = rowEl.createDiv({ cls: "ytec-pipeline-stats" });
      const percent = Math.min(100, Math.max(0, task.progress.percent || 0));

      const barBg = statsEl.createDiv({ cls: "ytec-pipeline-bar-bg" });
      barBg.createDiv({
        cls: "ytec-pipeline-bar-fill",
        attr: { style: `width: ${percent}%;` },
      });

      statsEl.createSpan({
        cls: "ytec-pipeline-stats-text",
        text: `${percent.toFixed(0)}% · ${task.progress.speed || "--"} · ETA ${task.progress.eta || "--"}`,
      });
    }

    // Cancel and Retry Controls
    const actionsEl = rowEl.createDiv({ cls: "ytec-pipeline-actions" });

    if (task.status === "downloading" || task.status === "fetching" || task.status === "deps") {
      const cancelBtn = actionsEl.createEl("button", {
        cls: "ytec-pipeline-btn ytec-btn-cancel",
        text: "✕ Cancel",
        type: "button",
      });
      cancelBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        callbacks.onCancel(task.id);
      });
    }

    if (task.status === "error" || task.status === "cancelled") {
      const retryBtn = actionsEl.createEl("button", {
        cls: "ytec-pipeline-btn ytec-btn-retry",
        text: "↺ Retry",
        type: "button",
      });
      retryBtn.title = "Retry this task (creates a new row at top)";
      retryBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        callbacks.onRetry(task.id);
      });
    }

    return rowEl;
  }

  private static getStepState(
    task: DownloadTask,
    step: PipelineStep
  ): "done" | "active" | "error" | "cancelled" | "pending" {
    if (task.status === "cancelled") {
      if (task.currentStep === step) return "cancelled";
      return PipelineRow.isStepBefore(step, task.currentStep) ? "done" : "pending";
    }

    if (task.status === "error") {
      if (task.currentStep === step) return "error";
      return PipelineRow.isStepBefore(step, task.currentStep) ? "done" : "pending";
    }

    if (task.status === "done") {
      return "done";
    }

    if (task.currentStep === step) {
      return "active";
    }

    return PipelineRow.isStepBefore(step, task.currentStep) ? "done" : "pending";
  }

  private static isStepBefore(a: PipelineStep, b: PipelineStep): boolean {
    const order: PipelineStep[] = ["deps", "fetch", "download", "done"];
    return order.indexOf(a) < order.indexOf(b);
  }
}
