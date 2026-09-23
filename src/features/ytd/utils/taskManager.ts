import type { DownloadTask, ProgressInfo, TaskStatus, PipelineStep } from "../types";

export type TaskListener = () => void;

class DownloadTaskManager {
  private tasks: DownloadTask[] = [];
  private listeners: Set<TaskListener> = new Set();
  private globalLogs: Array<{ taskId: string; title: string; timestamp: number; message: string }> = [];

  subscribe(listener: TaskListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (e) {
        console.error("[DownloadTaskManager] Error in listener:", e);
      }
    }
  }

  getTasks(): DownloadTask[] {
    return [...this.tasks];
  }

  getTask(id: string): DownloadTask | undefined {
    return this.tasks.find((t) => t.id === id);
  }

  addTask(task: DownloadTask): void {
    // Insert at TOP
    this.tasks.unshift(task);
    this.log(task.id, `Task created: ${task.title || task.url}`);
    this.notify();
  }

  updateTask(id: string, updates: Partial<DownloadTask>): void {
    const task = this.getTask(id);
    if (!task) return;

    Object.assign(task, updates);
    this.notify();
  }

  updateProgress(id: string, progress: ProgressInfo): void {
    const task = this.getTask(id);
    if (!task) return;
    task.progress = progress;
    task.currentStep = "download";
    task.status = "downloading";
    this.notify();
  }

  setStep(id: string, step: PipelineStep, status?: TaskStatus): void {
    const task = this.getTask(id);
    if (!task) return;
    task.currentStep = step;
    if (status) task.status = status;
    this.notify();
  }

  log(taskId: string, message: string): void {
    const task = this.getTask(taskId);
    const title = task?.title || "Unknown";
    const timestamp = Date.now();

    if (task) {
      task.logs.push(message);
    }
    this.globalLogs.push({ taskId, title, timestamp, message });
    this.notify();
  }

  cancelTask(id: string): void {
    const task = this.getTask(id);
    if (!task) return;

    if (task.abortFn) {
      try {
        task.abortFn();
      } catch (e) {
        console.error("[DownloadTaskManager] Error running abortFn:", e);
      }
    }

    task.status = "cancelled";
    task.completedAt = Date.now();
    this.log(id, `Task cancelled by user`);
    this.notify();
  }

  retryTask(id: string): DownloadTask | null {
    const oldTask = this.getTask(id);
    if (!oldTask) return null;

    // Mark old task as retried / dimmed
    oldTask.isRetried = true;

    // Create fresh task at top of table
    const newTask: DownloadTask = {
      id: "task_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7),
      url: oldTask.url,
      title: oldTask.title,
      channel: oldTask.channel,
      thumbnail: oldTask.thumbnail,
      platform: oldTask.platform,
      quality: oldTask.quality,
      fps: oldTask.fps,
      timeRange: { ...oldTask.timeRange },
      duration: oldTask.duration,
      status: "queued",
      currentStep: "deps",
      progress: { percent: 0, downloaded: "0MB", total: "--", speed: "--", eta: "--", rawMsg: "Queued..." },
      logs: [],
      isFetchOnly: oldTask.isFetchOnly,
      createdAt: Date.now(),
    };

    this.addTask(newTask);
    return newTask;
  }

  clearCompleted(): void {
    this.tasks = this.tasks.filter((t) => t.status === "downloading" || t.status === "queued" || t.status === "fetching");
    this.notify();
  }

  getFormattedLogs(options: { taskId?: string; withDateInfo: boolean }): string[] {
    const { taskId, withDateInfo } = options;

    const source = taskId
      ? this.globalLogs.filter((l) => l.taskId === taskId)
      : this.globalLogs;

    return source.map((item) => {
      const d = new Date(item.timestamp);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      const time = d.toLocaleTimeString([], { hour12: false });

      if (withDateInfo) {
        const cleanTitle = (item.title || "Task").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 24);
        return `${yyyy}-${mm}-${dd}_${cleanTitle} | ${item.message}`;
      } else {
        return `[${time}] ${item.message}`;
      }
    });
  }

  getActiveTasksCount(): number {
    return this.tasks.filter(
      (t) => t.status === "downloading" || t.status === "fetching" || t.status === "deps" || t.status === "queued"
    ).length;
  }

  getTotalTasksCount(): number {
    return this.tasks.length;
  }
}

export const taskManager = new DownloadTaskManager();
