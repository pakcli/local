import { App, Notice, setIcon, TFile } from "obsidian";
import type PakCLIPlugin from "../../../../main";
import type {
  PlaylistDeltaResult,
  PlaylistSyncItem,
  VideoQuality,
  VideoFps,
  DownloadTask,
} from "../../types";
import { formatTime } from "../../utils/fileHelpers";
import {
  executeFileReorders,
  generateOrUpdatePlaylistNote,
} from "../../utils/playlistSync";
import { ScopedClipTrimmer, type ClipRange } from "./ScopedClipTrimmer";
import { taskManager } from "../../utils/taskManager";

export interface PlaylistQueueDownloadItem {
  url: string;
  title: string;
  thumbnail: string;
  channel: string;
  quality: VideoQuality;
  fps: VideoFps;
  start: number;
  end: number;
  isFull: boolean;
  folder: string;
  duration: number;
}

export interface PlaylistQueueViewOptions {
  delta: PlaylistDeltaResult;
  targetFolder: string;
  onClose?: () => void;
  onSyncComplete?: (noteFile: TFile) => void;
  onQueueDownload?: (item: PlaylistQueueDownloadItem) => void;
}

interface ItemQueueState {
  item: PlaylistSyncItem;
  selected: boolean;
  quality: VideoQuality;
  clipRange?: ClipRange;
  isTrimmerOpen: boolean;
}

export class PlaylistQueueView {
  private app: App;
  private plugin: PakCLIPlugin;
  private containerEl: HTMLElement;
  private delta: PlaylistDeltaResult;
  private targetFolder: string;
  private options: PlaylistQueueViewOptions;

  private queueStates: ItemQueueState[] = [];
  private autoReorderFiles = true;
  private globalQuality: VideoQuality = "1080p";

  constructor(
    parentEl: HTMLElement,
    app: App,
    plugin: PakCLIPlugin,
    options: PlaylistQueueViewOptions
  ) {
    this.app = app;
    this.plugin = plugin;
    this.options = options;
    this.delta = options.delta;
    this.targetFolder = options.targetFolder;
    this.globalQuality = this.plugin.settings?.ytCaptureQuality || "1080p";

    // Initialize per-item state
    this.queueStates = this.delta.items.map((it) => ({
      item: it,
      selected: it.status === "new", // Auto-select new items by default
      quality: this.globalQuality,
      isTrimmerOpen: false,
    }));

    this.containerEl = parentEl.createDiv({ cls: "pakcli-playlist-queue-view" });
    this.render();
  }

  private render(): void {
    this.containerEl.empty();
    this.containerEl.style.padding = "12px";
    this.containerEl.style.backgroundColor = "var(--background-secondary)";
    this.containerEl.style.borderRadius = "8px";
    this.containerEl.style.margin = "12px 0";

    this.renderHeader();
    this.renderGlobalToolbar();
    this.renderQueueTable();
    this.renderActionButtons();
  }

  private renderHeader(): void {
    const header = this.containerEl.createDiv();
    header.style.marginBottom = "12px";

    const titleRow = header.createDiv();
    titleRow.style.display = "flex";
    titleRow.style.justifyContent = "space-between";
    titleRow.style.alignItems = "center";

    const h3 = titleRow.createEl("h3", { text: `📺 ${this.delta.playlistTitle}` });
    h3.style.margin = "0";

    const badgeBar = header.createDiv();
    badgeBar.style.display = "flex";
    badgeBar.style.gap = "8px";
    badgeBar.style.marginTop = "6px";

    const addBadge = (text: string, bg: string, color = "#fff") => {
      const b = badgeBar.createSpan({ text });
      b.style.padding = "2px 8px";
      b.style.borderRadius = "4px";
      b.style.fontSize = "0.8em";
      b.style.fontWeight = "bold";
      b.style.backgroundColor = bg;
      b.style.color = color;
    };

    addBadge(`🆕 ${this.delta.newItems.length} New to Download`, "var(--color-green)");
    addBadge(`🔄 ${this.delta.movedItems.length} Reordered (0 MB)`, "var(--color-orange)");
    addBadge(`⚡ ${this.delta.unchangedItems.length} Cached`, "var(--background-tertiary)", "var(--text-normal)");
  }

  private renderGlobalToolbar(): void {
    const toolbar = this.containerEl.createDiv();
    toolbar.style.display = "flex";
    toolbar.style.flexWrap = "wrap";
    toolbar.style.gap = "12px";
    toolbar.style.alignItems = "center";
    toolbar.style.padding = "8px";
    toolbar.style.backgroundColor = "var(--background-primary)";
    toolbar.style.borderRadius = "6px";
    toolbar.style.marginBottom = "12px";

    // Global Quality
    const qGroup = toolbar.createDiv();
    qGroup.style.display = "flex";
    qGroup.style.alignItems = "center";
    qGroup.style.gap = "6px";
    qGroup.createSpan({ text: "Default Quality:", cls: "ytec-label" });

    const qSelect = qGroup.createEl("select");
    const qualities: VideoQuality[] = ["4k", "2k", "1080p", "720p", "480p", "audio"];
    for (const q of qualities) {
      const opt = qSelect.createEl("option", { value: q, text: q.toUpperCase() });
      if (q === this.globalQuality) opt.selected = true;
    }
    qSelect.addEventListener("change", () => {
      this.globalQuality = qSelect.value as VideoQuality;
      // Update all items that haven't been manually overridden
      for (const st of this.queueStates) {
        st.quality = this.globalQuality;
      }
      this.renderQueueTable();
    });

    // Auto-reorder files checkbox
    const reorderLabel = toolbar.createEl("label");
    reorderLabel.style.display = "flex";
    reorderLabel.style.alignItems = "center";
    reorderLabel.style.gap = "6px";
    reorderLabel.style.cursor = "pointer";

    const reorderCheck = reorderLabel.createEl("input", { type: "checkbox" });
    reorderCheck.checked = this.autoReorderFiles;
    reorderCheck.addEventListener("change", () => {
      this.autoReorderFiles = reorderCheck.checked;
    });
    reorderLabel.createSpan({ text: "Auto-reorder shifted files (Instant, 0 MB)" });
  }

  private renderQueueTable(): void {
    let tableWrapper = this.containerEl.querySelector(".pakcli-playlist-table-wrapper") as HTMLElement | null;
    if (!tableWrapper) {
      tableWrapper = this.containerEl.createDiv({ cls: "pakcli-playlist-table-wrapper" });
    }
    tableWrapper.empty();
    tableWrapper.style.maxHeight = "360px";
    tableWrapper.style.overflowY = "auto";
    tableWrapper.style.border = "1px solid var(--background-modifier-border)";
    tableWrapper.style.borderRadius = "6px";

    const table = tableWrapper.createEl("table");
    table.style.width = "100%";
    table.style.borderCollapse = "collapse";
    table.style.fontSize = "0.85em";

    // Table Header
    const thead = table.createEl("thead");
    const trHead = thead.createEl("tr");
    trHead.style.backgroundColor = "var(--background-secondary-alt)";
    trHead.style.textAlign = "left";

    const thSelect = trHead.createEl("th", { text: "" });
    thSelect.style.width = "30px";
    thSelect.style.padding = "6px";

    const thNo = trHead.createEl("th", { text: "No" });
    thNo.style.width = "35px";

    const thTitle = trHead.createEl("th", { text: "Title" });

    const thDuration = trHead.createEl("th", { text: "Duration & Range Controls" });
    thDuration.style.width = "220px";

    const thQuality = trHead.createEl("th", { text: "Quality" });
    thQuality.style.width = "90px";

    const thStatus = trHead.createEl("th", { text: "Status" });
    thStatus.style.width = "110px";

    // Table Body
    const tbody = table.createEl("tbody");

    this.queueStates.forEach((st, idx) => {
      const it = st.item;
      const row = tbody.createEl("tr");
      row.style.borderBottom = "1px solid var(--background-modifier-border)";
      if (st.selected) {
        row.style.backgroundColor = "rgba(var(--interactive-accent-rgb), 0.05)";
      }

      // 1. Checkbox
      const tdCheck = row.createEl("td");
      tdCheck.style.textAlign = "center";
      tdCheck.style.padding = "6px";
      if (it.status === "new") {
        const cb = tdCheck.createEl("input", { type: "checkbox" });
        cb.checked = st.selected;
        cb.addEventListener("change", () => {
          st.selected = cb.checked;
          row.style.backgroundColor = st.selected ? "rgba(var(--interactive-accent-rgb), 0.05)" : "";
        });
      } else {
        tdCheck.createSpan({ text: "-" });
      }

      // 2. Index No
      const tdNo = row.createEl("td", { text: String(it.originalIndex).padStart(2, "0") });
      tdNo.style.fontWeight = "bold";

      // 3. Title + link
      const tdTitle = row.createEl("td");
      const link = tdTitle.createEl("a", { text: it.title, href: it.url });
      link.style.color = "var(--text-normal)";
      link.style.textDecoration = "none";
      link.title = it.title;

      // 4. Duration with 2 buttons [✂️ Edit Range] and [↺ Full Range]
      const tdDuration = row.createEl("td");
      this.renderDurationCell(tdDuration, st, tbody);

      // 5. Quality override
      const tdQuality = row.createEl("td");
      if (it.status === "new") {
        const qSel = tdQuality.createEl("select");
        qSel.style.fontSize = "0.8em";
        qSel.style.padding = "1px 4px";
        for (const q of ["4k", "1080p", "720p", "audio"]) {
          const opt = qSel.createEl("option", { value: q, text: q });
          if (q === st.quality) opt.selected = true;
        }
        qSel.addEventListener("change", () => {
          st.quality = qSel.value as VideoQuality;
        });
      } else {
        tdQuality.createSpan({ text: "Cached", cls: "ytec-badge-cached" });
      }

      // 6. Status Badge
      const tdStatus = row.createEl("td");
      if (it.status === "new") {
        tdStatus.createSpan({ text: "🆕 Ready to DL", cls: "ytec-status-new" });
        tdStatus.style.color = "var(--color-green)";
        tdStatus.style.fontWeight = "bold";
      } else if (it.status === "existing_moved") {
        tdStatus.createSpan({ text: `🔄 Shifted (#${it.previousIndex})` });
        tdStatus.style.color = "var(--color-orange)";
      } else {
        tdStatus.createSpan({ text: "⚡ In Vault", cls: "ytec-status-cached" });
        tdStatus.style.color = "var(--text-muted)";
      }
    });
  }

  private renderDurationCell(
    cell: HTMLElement,
    st: ItemQueueState,
    tbody: HTMLElement
  ): void {
    cell.empty();
    const durContainer = cell.createDiv();
    durContainer.style.display = "flex";
    durContainer.style.alignItems = "center";
    durContainer.style.gap = "6px";
    durContainer.style.flexWrap = "wrap";

    const totalSecs = typeof st.item.duration === "number" ? st.item.duration : 0;
    const isClip = Boolean(st.clipRange && !st.clipRange.isFull);

    // Duration Text
    const textSpan = durContainer.createSpan();
    if (isClip && st.clipRange) {
      const diff = st.clipRange.end - st.clipRange.start;
      textSpan.setText(`✂️ ${formatTime(st.clipRange.start)}-${formatTime(st.clipRange.end)} (${formatTime(diff)})`);
      textSpan.style.color = "var(--color-green)";
      textSpan.style.fontWeight = "bold";
    } else {
      textSpan.setText(totalSecs > 0 ? formatTime(totalSecs) : "-");
      textSpan.style.color = "var(--text-normal)";
    }

    // Button 1: [✂️ Edit Range]
    const editBtn = durContainer.createEl("button", {
      text: "✂️ Edit",
      cls: "ytec-btn ytec-btn-xs",
      title: "Edit clip range (Non-blocking, sidepanel-scoped)",
    });
    editBtn.style.fontSize = "0.75em";
    editBtn.style.padding = "1px 5px";

    // Button 2: [↺ Full Range]
    const fullBtn = durContainer.createEl("button", {
      text: "↺ Full",
      cls: "ytec-btn ytec-btn-xs",
      title: "Reset to 100% full video duration",
    });
    fullBtn.style.fontSize = "0.75em";
    fullBtn.style.padding = "1px 5px";

    fullBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      st.clipRange = undefined;
      st.isTrimmerOpen = false;
      this.removeInlineTrimmer(st);
      this.renderDurationCell(cell, st, tbody);
      new Notice(`Reset '${st.item.title}' to full range.`);
    });

    editBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      st.isTrimmerOpen = !st.isTrimmerOpen;
      if (st.isTrimmerOpen) {
        this.renderInlineTrimmer(st, tbody, cell);
      } else {
        this.removeInlineTrimmer(st);
      }
    });
  }

  private renderInlineTrimmer(
    st: ItemQueueState,
    tbody: HTMLElement,
    durationCell: HTMLElement
  ): void {
    this.removeInlineTrimmer(st);

    const totalSecs = typeof st.item.duration === "number" ? st.item.duration : 600;
    const trimmerRow = tbody.createEl("tr", { cls: `pakcli-trimmer-row-${st.item.videoId}` });
    trimmerRow.style.backgroundColor = "var(--background-secondary-alt)";

    const trimmerCell = trimmerRow.createEl("td");
    trimmerCell.colSpan = 6;
    trimmerCell.style.padding = "4px 8px";

    new ScopedClipTrimmer(trimmerCell, {
      totalDuration: totalSecs,
      initialRange: st.clipRange,
      onApply: (range) => {
        st.clipRange = range;
        st.isTrimmerOpen = false;
        this.removeInlineTrimmer(st);
        this.renderDurationCell(durationCell, st, tbody);
        new Notice(`Applied clip range: ${formatTime(range.start)} - ${formatTime(range.end)}`);
      },
      onCancel: () => {
        st.isTrimmerOpen = false;
        this.removeInlineTrimmer(st);
      },
      onResetFull: () => {
        st.clipRange = undefined;
        st.isTrimmerOpen = false;
        this.removeInlineTrimmer(st);
        this.renderDurationCell(durationCell, st, tbody);
      },
    });
  }

  private removeInlineTrimmer(st: ItemQueueState): void {
    const existing = this.containerEl.querySelector(`.pakcli-trimmer-row-${st.item.videoId}`);
    if (existing) existing.remove();
  }

  private renderActionButtons(): void {
    const actionRow = this.containerEl.createDiv();
    actionRow.style.display = "flex";
    actionRow.style.gap = "10px";
    actionRow.style.marginTop = "14px";

    const selectedCount = this.queueStates.filter((s) => s.selected).length;

    const btnSync = actionRow.createEl("button", {
      text: `⚡ Run Smart Sync (${selectedCount} New + ${this.delta.movedItems.length} Reordered)`,
      cls: "mod-cta",
    });
    btnSync.style.flex = "1";

    btnSync.addEventListener("click", async () => {
      btnSync.disabled = true;
      btnSync.setText("Executing Smart Sync...");

      try {
        const folder = `${this.targetFolder}/${this.delta.playlistTitle}`;

        // 1. Instant local renames (0 KB download)
        let reorderedCount = 0;
        if (this.autoReorderFiles && this.delta.movedItems.length > 0) {
          const res = await executeFileReorders(this.app, this.delta, folder);
          reorderedCount = res.movedCount;
        }

        // 2. Queue selected new downloads via onQueueDownload or fallback
        const newSelected = this.queueStates.filter((s) => s.selected && s.item.status === "new");
        for (const q of newSelected) {
          const dur = typeof q.item.duration === "number" ? q.item.duration : 0;
          const payload: PlaylistQueueDownloadItem = {
            url: q.item.url,
            title: q.item.title,
            channel: this.delta.channelTitle,
            thumbnail: q.item.thumbnailUrl,
            quality: q.quality,
            fps: "auto",
            start: q.clipRange?.start || 0,
            end: q.clipRange?.end || dur,
            isFull: !q.clipRange || q.clipRange.isFull,
            folder: folder,
            duration: dur,
          };

          if (this.options.onQueueDownload) {
            this.options.onQueueDownload(payload);
          } else {
            const task: DownloadTask = {
              id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
              url: q.item.url,
              title: q.item.title,
              channel: this.delta.channelTitle,
              thumbnail: q.item.thumbnailUrl,
              platform: "youtube",
              quality: q.quality,
              fps: "auto",
              timeRange: {
                start: q.clipRange?.start || 0,
                end: q.clipRange?.end || dur,
                isFull: !q.clipRange || q.clipRange.isFull,
              },
              duration: dur,
              status: "queued",
              currentStep: "deps",
              progress: {
                percent: 0,
                downloaded: "0 MB",
                total: "0 MB",
                speed: "0 MB/s",
                eta: "--:--",
                rawMsg: "Queued",
              },
              logs: [],
              createdAt: Date.now(),
            };
            taskManager.addTask(task);
          }
        }

        // 3. Generate or update Obsidian Markdown Note
        const noteFile = await generateOrUpdatePlaylistNote(this.app, this.delta, folder);

        new Notice(
          `✔ Sync Complete! Reordered ${reorderedCount} files (0 MB). Queued ${newSelected.length} new downloads.`
        );

        this.options.onSyncComplete?.(noteFile);

        // Open Note in editor
        const leaf = this.app.workspace.getLeaf(false);
        await leaf.openFile(noteFile);
      } catch (err: any) {
        new Notice(`Sync failed: ${err?.message || err}`);
      } finally {
        btnSync.disabled = false;
        const count = this.queueStates.filter((s) => s.selected).length;
        btnSync.setText(`⚡ Run Smart Sync (${count} New + ${this.delta.movedItems.length} Reordered)`);
      }
    });

    const btnNoteOnly = actionRow.createEl("button", {
      text: "📝 Update Note Only",
      cls: "ytec-btn",
      title: "Update note table and links without downloading any videos",
    });

    btnNoteOnly.addEventListener("click", async () => {
      try {
        const folder = `${this.targetFolder}/${this.delta.playlistTitle}`;
        const noteFile = await generateOrUpdatePlaylistNote(this.app, this.delta, folder);
        new Notice(`Updated playlist note: ${noteFile.path}`);
        const leaf = this.app.workspace.getLeaf(false);
        await leaf.openFile(noteFile);
      } catch (err: any) {
        new Notice(`Failed to update note: ${err?.message || err}`);
      }
    });
  }

  destroy(): void {
    this.containerEl.remove();
  }
}
