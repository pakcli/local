import { App, setIcon, Notice, TFile } from "obsidian";
import type PakCLIPlugin from "../../../../main";
import type {
  DownloadTask,
  TableFilter,
  TableViewMode,
  TableSort,
  VideoQuality,
  VideoFps,
} from "../../types";
import { taskManager } from "../../utils/taskManager";
import { PipelineRow } from "./PipelineRow";
import { DebugPanel } from "./DebugPanel";
import { getIncrementalCaptureHistory, type CaptureHistoryItem } from "../../utils/historyCache";
import { formatTime } from "../../utils/fileHelpers";

export interface TableViewOptions {
  mode: TableViewMode; // "flat" or "grouped"
  isRecentOnly?: boolean; // Tab 1 vs Tab 2
  showAddBar?: boolean; // Tab 2 inline [+ Add New Download]
  onAddNewDownload?: (url: string) => void;
  onDownloadOtherQuality?: (url: string, quality: VideoQuality, fps: VideoFps, start: number, end: number) => void;
  onRefreshItem?: (url: string) => void;
}

export class TableView {
  private app: App;
  private plugin: PakCLIPlugin;
  private containerEl: HTMLElement;
  private toolbarEl: HTMLElement;
  private tableEl: HTMLElement;
  private options: TableViewOptions;

  private filter: TableFilter = "both";
  private viewMode: TableViewMode = "flat";
  private sort: TableSort = "quality_fps";
  private expandedDebugRows: Set<string> = new Set();
  private inlineAddBarEl: HTMLElement | null = null;
  private unsubscribe?: () => void;
  private renderId = 0;
  private renderTimer: number | null = null;
  private resizeObserver: ResizeObserver | null = null;

  constructor(parentEl: HTMLElement, app: App, plugin: PakCLIPlugin, options: TableViewOptions) {
    this.app = app;
    this.plugin = plugin;
    this.options = options;
    this.viewMode = options.mode;

    this.containerEl = parentEl.createDiv({ cls: "ytec-tableview-container" });
    this.toolbarEl = this.containerEl.createDiv({ cls: "ytec-tableview-toolbar" });
    this.tableEl = this.containerEl.createDiv({ cls: "ytec-tableview-table" });

    // Responsive compact mode observer for sidebar docks
    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width < 560) {
          this.containerEl.addClass("is-compact");
        } else {
          this.containerEl.removeClass("is-compact");
        }
      }
    });
    this.resizeObserver.observe(this.containerEl);

    this.renderToolbar();
    this.renderTable();

    this.unsubscribe = taskManager.subscribe(() => {
      if (this.renderTimer) window.clearTimeout(this.renderTimer);
      this.renderTimer = window.setTimeout(() => {
        this.renderTable();
      }, 50);
    });
  }

  destroy(): void {
    if (this.renderTimer) {
      window.clearTimeout(this.renderTimer);
      this.renderTimer = null;
    }
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.unsubscribe?.();
  }

  private renderToolbar(): void {
    this.toolbarEl.empty();

    // 1. Platform Filters: [🎬 YouTube] [📸 Instagram] [⊞ Both]
    const filterGroup = this.toolbarEl.createDiv({ cls: "ytec-filter-group" });

    const ytBtn = filterGroup.createEl("button", {
      cls: `ytec-filter-btn ${this.filter === "youtube" ? "is-active" : ""}`,
      text: "🎬 YouTube",
      type: "button",
    });
    ytBtn.addEventListener("click", () => {
      this.filter = "youtube";
      this.renderToolbar();
      this.renderTable();
    });

    const igBtn = filterGroup.createEl("button", {
      cls: `ytec-filter-btn ${this.filter === "instagram" ? "is-active" : ""}`,
      text: "📸 Instagram",
      type: "button",
    });
    igBtn.addEventListener("click", () => {
      this.filter = "instagram";
      this.renderToolbar();
      this.renderTable();
    });

    const bothBtn = filterGroup.createEl("button", {
      cls: `ytec-filter-btn ${this.filter === "both" ? "is-active" : ""}`,
      text: "⊞ Both",
      type: "button",
    });
    bothBtn.addEventListener("click", () => {
      this.filter = "both";
      this.renderToolbar();
      this.renderTable();
    });

    // Right side toolbar actions: View Mode toggle & Add New
    const rightGroup = this.toolbarEl.createDiv({ cls: "ytec-toolbar-right" });

    // Mode Toggle (Only in Tab 2 full history)
    if (!this.options.isRecentOnly) {
      const modeGroup = rightGroup.createDiv({ cls: "ytec-mode-group" });
      const flatBtn = modeGroup.createEl("button", {
        cls: `ytec-mode-btn ${this.viewMode === "flat" ? "is-active" : ""}`,
        text: "≡ Flat",
        type: "button",
      });
      flatBtn.addEventListener("click", () => {
        this.viewMode = "flat";
        this.renderToolbar();
        this.renderTable();
      });

      const groupedBtn = modeGroup.createEl("button", {
        cls: `ytec-mode-btn ${this.viewMode === "grouped" ? "is-active" : ""}`,
        text: "⊞ Grouped",
        type: "button",
      });
      groupedBtn.addEventListener("click", () => {
        this.viewMode = "grouped";
        this.renderToolbar();
        this.renderTable();
      });
    }

    // [+ Add New Download] Button (Tab 2)
    if (this.options.showAddBar) {
      const addBtn = rightGroup.createEl("button", {
        cls: "ytec-btn ytec-btn-sm mod-cta ytec-add-new-btn",
        text: "+ Add New Download",
        type: "button",
      });
      addBtn.addEventListener("click", () => {
        this.toggleInlineAddBar();
      });
    }
  }

  private toggleInlineAddBar(): void {
    if (this.inlineAddBarEl) {
      this.inlineAddBarEl.remove();
      this.inlineAddBarEl = null;
      return;
    }

    this.inlineAddBarEl = this.containerEl.createDiv({ cls: "ytec-inline-add-bar" });
    this.containerEl.insertBefore(this.inlineAddBarEl, this.tableEl);

    const input = this.inlineAddBarEl.createEl("input", {
      type: "text",
      placeholder: "Paste YouTube or Instagram URL...",
      cls: "ytec-inline-add-input",
    });
    input.focus();

    const fetchBtn = this.inlineAddBarEl.createEl("button", {
      cls: "ytec-btn ytec-btn-sm mod-cta",
      text: "Fetch",
      type: "button",
    });

    const submit = () => {
      const val = input.value.trim();
      if (!val) return;
      this.options.onAddNewDownload?.(val);
      this.inlineAddBarEl?.remove();
      this.inlineAddBarEl = null;
    };

    fetchBtn.addEventListener("click", submit);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        submit();
      }
    });
  }

  async renderTable(forceRescan = false): Promise<void> {
    const currentRenderId = ++this.renderId;

    // 1. Collect runtime tasks from taskManager
    const liveTasks = taskManager.getTasks();

    // 2. Collect completed items from vault history cache
    let vaultItems: CaptureHistoryItem[] = [];
    try {
      vaultItems = await getIncrementalCaptureHistory(this.app, this.plugin, forceRescan);
    } catch (e) {
      console.error("[TableView] Error fetching history:", e);
    }

    // Stale render check: if another renderTable was invoked while waiting, abort this stale call!
    if (currentRenderId !== this.renderId) {
      return;
    }

    // Empty table ONLY right before populating to avoid double tables/headers
    this.tableEl.empty();

    // Combine into uniform row models with zero duplication
    const rows = this.mergeRows(liveTasks, vaultItems);

    // Apply platform filter
    const filteredRows = rows.filter((r) => {
      if (this.filter === "both") return true;
      return r.platform === this.filter;
    });

    // Apply sorting
    filteredRows.sort((a, b) => this.compareRows(a, b));

    // Apply recent limit if in Tab 1 (Recent Downloads)
    const displayRows = this.options.isRecentOnly ? filteredRows.slice(0, 10) : filteredRows;

    if (displayRows.length === 0) {
      this.tableEl.createDiv({
        cls: "ytec-table-empty",
        text: "No downloads found in this view.",
      });
      return;
    }

    // Render Table
    const tableTag = this.tableEl.createEl("table", { cls: "ytec-data-table" });

    // Thead
    const thead = tableTag.createEl("thead");
    const headerRow = thead.createEl("tr");
    headerRow.createEl("th", { text: "Thumb", cls: "col-thumb" });
    headerRow.createEl("th", { text: "Title & URL", cls: "col-title" });
    headerRow.createEl("th", { text: "Quality × Range", cls: "col-quality" });
    headerRow.createEl("th", { text: "Platform", cls: "col-plat" });
    headerRow.createEl("th", { text: "Actions", cls: "col-actions" });

    const tbody = tableTag.createEl("tbody");

    for (const row of displayRows) {
      this.renderRow(tbody, row);
    }
  }

  private renderRow(tbody: HTMLElement, row: CombinedRow): void {
    const tr = tbody.createEl("tr", {
      cls: `ytec-table-row ${row.liveTask?.isRetried ? "is-dimmed" : ""}`,
    });

    // 1. Thumb
    const tdThumb = tr.createEl("td", { cls: "col-thumb" });
    if (row.thumbnail) {
      const img = tdThumb.createEl("img", {
        cls: "ytec-row-thumb-img",
        attr: { src: row.thumbnail, alt: row.title },
      });
      img.onerror = () => {
        img.remove();
        if (!tdThumb.querySelector(".ytec-row-thumb-placeholder")) {
          const placeholder = tdThumb.createDiv({ cls: "ytec-row-thumb-placeholder" });
          setIcon(placeholder, row.platform === "youtube" ? "video" : "camera");
        }
      };
    } else {
      const placeholder = tdThumb.createDiv({ cls: "ytec-row-thumb-placeholder" });
      setIcon(placeholder, row.platform === "youtube" ? "video" : "camera");
    }

    // 2. Title & URL
    const tdTitle = tr.createEl("td", { cls: "col-title" });
    const titleLink = tdTitle.createEl("a", {
      cls: "ytec-row-title",
      text: row.title || "Untitled Video",
    });
    titleLink.title = row.title;
    titleLink.addEventListener("click", () => {
      if (row.noteFilePath) {
        this.openNote(row.noteFilePath);
      } else if (row.url) {
        window.open(row.url, "_blank");
      }
    });

    // Compact metadata line (visible in dock sidebar mode when quality/plat columns collapse)
    const metaSub = tdTitle.createDiv({ cls: "ytec-row-meta" });
    metaSub.createSpan({
      cls: `ytec-badge ytec-badge-sm ytec-badge-${row.platform}`,
      text: row.platform === "youtube" ? "🎬 YT" : "📸 IG",
    });
    const qualText = row.quality === "audio"
      ? `Audio · ${row.timeRange}`
      : `${row.quality} ${row.fps === "auto" ? "" : row.fps + "fps"} · ${row.timeRange}`;
    metaSub.createSpan({ cls: "ytec-quality-tag-sm", text: qualText });

    const urlSub = tdTitle.createDiv({ cls: "ytec-row-url" });
    urlSub.setText(row.url);
    urlSub.title = row.url;

    // 3. Quality × Range
    const tdQuality = tr.createEl("td", { cls: "col-quality" });
    if (row.isFetchOnly) {
      tdQuality.createSpan({ cls: "ytec-badge ytec-badge-fetchonly", text: "🔵 Fetches Only" });
    } else {
      tdQuality.createSpan({ cls: "ytec-quality-tag", text: qualText });
    }

    // 4. Platform
    const tdPlat = tr.createEl("td", { cls: "col-plat" });
    tdPlat.createSpan({
      cls: `ytec-badge ytec-badge-${row.platform}`,
      text: row.platform === "youtube" ? "🎬 YT" : "📸 IG",
    });

    // 5. Actions: [🔄] [⬇▾] [📝] [🐛]
    const tdActions = tr.createEl("td", { cls: "col-actions" });
    const btnGroup = tdActions.createDiv({ cls: "ytec-action-btns" });

    // Refresh button
    const refreshBtn = btnGroup.createEl("button", {
      cls: "ytec-icon-btn",
      title: "Re-fetch metadata",
      type: "button",
    });
    setIcon(refreshBtn, "refresh-cw");
    refreshBtn.addEventListener("click", () => {
      this.options.onRefreshItem?.(row.url);
    });

    // Download / Other Quality dropdown
    const dlBtn = btnGroup.createEl("button", {
      cls: "ytec-icon-btn",
      title: row.isFetchOnly ? "Download Video" : "Download other quality...",
      type: "button",
    });
    setIcon(dlBtn, "download");
    dlBtn.addEventListener("click", () => {
      this.showQualityConfirmPopup(row);
    });

    // Open Note button (if exists)
    if (row.noteFilePath) {
      const noteBtn = btnGroup.createEl("button", {
        cls: "ytec-icon-btn",
        title: "Open Note in Vault",
        type: "button",
      });
      setIcon(noteBtn, "file-text");
      noteBtn.addEventListener("click", () => {
        this.openNote(row.noteFilePath!);
      });
    }

    // Debug button
    const debugBtn = btnGroup.createEl("button", {
      cls: `ytec-icon-btn ${this.expandedDebugRows.has(row.id) ? "is-active" : ""}`,
      title: "Toggle inline debug logs",
      type: "button",
    });
    setIcon(debugBtn, "bug");
    debugBtn.addEventListener("click", () => {
      if (this.expandedDebugRows.has(row.id)) {
        this.expandedDebugRows.delete(row.id);
      } else {
        this.expandedDebugRows.add(row.id);
      }
      this.renderTable();
    });

    // 6. Sub-row for Pipeline (if live task is running, failed, or cancelled)
    if (row.liveTask && row.liveTask.status !== "done") {
      const pipelineTr = tbody.createEl("tr", { cls: "ytec-subrow-pipeline" });
      const pipelineTd = pipelineTr.createEl("td", { attr: { colspan: "5" } });
      PipelineRow.render(pipelineTd, row.liveTask, {
        onCancel: (id) => taskManager.cancelTask(id),
        onRetry: (id) => taskManager.retryTask(id),
      });
    }

    // 7. Sub-row for Inline Debug drawer (if expanded)
    if (this.expandedDebugRows.has(row.id)) {
      const debugTr = tbody.createEl("tr", { cls: "ytec-subrow-debug" });
      const debugTd = debugTr.createEl("td", { attr: { colspan: "5" } });
      DebugPanel.renderInlineRowDebug(debugTd, {
        id: row.id,
        title: row.title,
        logs: row.liveTask?.logs || ["Item record saved in vault history cache."],
      });
    }
  }

  private showQualityConfirmPopup(row: CombinedRow): void {
    const overlay = document.body.createDiv({ cls: "ytec-mini-popup-overlay" });
    const popup = overlay.createDiv({ cls: "ytec-mini-popup" });

    popup.createEl("h4", { text: `Download ${row.title.slice(0, 35)}...` });

    // Quality selector
    const qRow = popup.createDiv({ cls: "ytec-popup-row" });
    qRow.createSpan({ text: "Quality:" });
    const qSelect = qRow.createEl("select");
    const qualities: VideoQuality[] = ["1080p", "720p", "480p", "360p", "audio"];
    for (const q of qualities) {
      const opt = qSelect.createEl("option", { value: q, text: q });
      if (q === row.quality) opt.selected = true;
    }

    // Range editor
    const rRow = popup.createDiv({ cls: "ytec-popup-row" });
    rRow.createSpan({ text: "Range:" });
    const rangeInput = rRow.createEl("input", {
      type: "text",
      value: row.timeRange || "00:00 → Full",
    });

    const actions = popup.createDiv({ cls: "ytec-popup-actions" });
    const cancelBtn = actions.createEl("button", { text: "Cancel", cls: "ytec-btn ytec-btn-sm" });
    cancelBtn.addEventListener("click", () => overlay.remove());

    const dlBtn = actions.createEl("button", {
      text: "⬇ Download Now",
      cls: "ytec-btn ytec-btn-sm mod-cta",
    });
    dlBtn.addEventListener("click", () => {
      overlay.remove();
      this.options.onDownloadOtherQuality?.(
        row.url,
        qSelect.value as VideoQuality,
        "auto",
        0,
        0
      );
      new Notice(`Queued download for ${qSelect.value}`);
    });
  }

  private openNote(filePath: string): void {
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (file instanceof TFile) {
      this.app.workspace.getLeaf(false).openFile(file);
    } else {
      new Notice(`Note file not found: ${filePath}`);
    }
  }

  private mergeRows(tasks: DownloadTask[], history: CaptureHistoryItem[]): CombinedRow[] {
    const rowMap = new Map<string, CombinedRow>();

    const getTaskKey = (t: DownloadTask): string => {
      if (t.outputFilePath) {
        return "file:" + t.outputFilePath.toLowerCase();
      }
      const range = t.timeRange.isFull ? "full" : `${t.timeRange.start}-${t.timeRange.end}`;
      return `url:${(t.url || "").trim().toLowerCase()}_${t.quality}_${range}_${t.isFetchOnly ? "fetch" : "dl"}`;
    };

    const getHistoryKey = (h: CaptureHistoryItem): string => {
      return "file:" + h.filePath.toLowerCase();
    };

    // Track URLs that have actual downloads so we can hide redundant "Fetch Only" rows
    const downloadedUrls = new Set<string>();
    for (const h of history) {
      if (h.url) downloadedUrls.add(h.url.trim().toLowerCase());
    }
    for (const t of tasks) {
      if (!t.isFetchOnly && t.url) {
        downloadedUrls.add(t.url.trim().toLowerCase());
      }
    }

    // 1. Live Tasks
    for (const t of tasks) {
      const cleanUrl = (t.url || "").trim().toLowerCase();
      // Hide standalone "Fetch Only" tasks if download already exists for this video
      if (t.isFetchOnly && downloadedUrls.has(cleanUrl)) {
        continue;
      }

      const key = getTaskKey(t);
      const rangeStr = t.timeRange.isFull
        ? "00:00 → Full"
        : `${formatTime(t.timeRange.start)} → ${formatTime(t.timeRange.end)}`;

      const existing = rowMap.get(key);
      if (existing) {
        const isCurrentActive = t.status !== "done" && t.status !== "cancelled";
        const isExistingActive = existing.liveTask && existing.liveTask.status !== "done" && existing.liveTask.status !== "cancelled";

        if (isCurrentActive && !isExistingActive) {
          rowMap.set(key, {
            id: t.id,
            url: t.url,
            title: t.title || existing.title,
            thumbnail: t.thumbnail || existing.thumbnail,
            platform: t.platform,
            quality: t.quality,
            fps: t.fps,
            timeRange: rangeStr,
            isFetchOnly: t.isFetchOnly,
            timestamp: Math.max(t.createdAt, existing.timestamp),
            liveTask: t,
            noteFilePath: t.outputFilePath || existing.noteFilePath,
          });
        } else if (t.createdAt > existing.timestamp) {
          rowMap.set(key, {
            ...existing,
            id: t.id,
            title: t.title || existing.title,
            thumbnail: t.thumbnail || existing.thumbnail,
            timestamp: t.createdAt,
            liveTask: t,
            noteFilePath: t.outputFilePath || existing.noteFilePath,
          });
        }
      } else {
        rowMap.set(key, {
          id: t.id,
          url: t.url,
          title: t.title || "Pending...",
          thumbnail: t.thumbnail,
          platform: t.platform,
          quality: t.quality,
          fps: t.fps,
          timeRange: rangeStr,
          isFetchOnly: t.isFetchOnly,
          timestamp: t.createdAt,
          liveTask: t,
          noteFilePath: t.outputFilePath,
        });
      }
    }

    // 2. Vault History Items
    for (const h of history) {
      const fileKey = getHistoryKey(h);
      const existing = rowMap.get(fileKey);

      if (existing) {
        // Merge vault history with live task
        if (!existing.thumbnail && h.thumbnail) {
          existing.thumbnail = h.thumbnail;
        }
        if (!existing.noteFilePath) {
          existing.noteFilePath = h.filePath;
        }
        if (existing.title === "Pending..." || !existing.title) {
          existing.title = h.title;
        }
      } else {
        // Check if any row in rowMap matches by URL and Quality
        let matchedByProps = false;
        for (const [, row] of rowMap.entries()) {
          const matchUrl = row.url && h.url && row.url.trim().toLowerCase() === h.url.trim().toLowerCase();
          const matchQual = row.quality === (h.resolution || "best");
          if (matchUrl && matchQual) {
            row.noteFilePath = h.filePath;
            if (!row.thumbnail && h.thumbnail) row.thumbnail = h.thumbnail;
            matchedByProps = true;
            break;
          }
        }

        if (!matchedByProps) {
          rowMap.set(fileKey, {
            id: "hist_" + h.filePath,
            url: h.url,
            title: h.title,
            thumbnail: h.thumbnail || "",
            platform: h.platform,
            quality: (h.resolution as VideoQuality) || "best",
            fps: "auto",
            timeRange: h.timeRange || "00:00 → Full",
            timestamp: h.mtime,
            noteFilePath: h.filePath,
          });
        }
      }
    }

    return Array.from(rowMap.values());
  }

  private compareRows(a: CombinedRow, b: CombinedRow): number {
    // 1. Primary: Active downloading tasks come first
    const aActive = a.liveTask && a.liveTask.status !== "done" && a.liveTask.status !== "cancelled";
    const bActive = b.liveTask && b.liveTask.status !== "done" && b.liveTask.status !== "cancelled";
    if (aActive && !bActive) return -1;
    if (!aActive && bActive) return 1;

    // 2. Recent Downloads table: strictly sort by recency (newest first)
    if (this.options.isRecentOnly) {
      return b.timestamp - a.timestamp;
    }

    // 3. Tab 2 History View: check selected sort
    if (this.sort === "time" || this.sort === "recent") {
      return b.timestamp - a.timestamp;
    }

    // Quality hierarchy
    const qRank = (q: string) => {
      const order = ["audio", "144p", "240p", "360p", "480p", "720p", "1080p", "2k", "4k", "best"];
      const idx = order.indexOf(q.toLowerCase());
      return idx === -1 ? 0 : idx;
    };

    const diff = qRank(b.quality) - qRank(a.quality);
    if (diff !== 0) return diff;

    // Tertiary: Newer first
    return b.timestamp - a.timestamp;
  }
}

interface CombinedRow {
  id: string;
  url: string;
  title: string;
  thumbnail: string;
  platform: "youtube" | "instagram";
  quality: VideoQuality;
  fps: VideoFps;
  timeRange: string;
  isFetchOnly?: boolean;
  timestamp: number;
  liveTask?: DownloadTask;
  noteFilePath?: string;
}
