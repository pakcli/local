import { ItemView, WorkspaceLeaf, setIcon, Notice, Platform, TFile } from "obsidian";
import type PakCLIPlugin from "../../../main";
import { DownloadHero } from "./components/DownloadHero";
import { DownloadForm, type DownloadFormState } from "./components/DownloadForm";
import { DebugPanel } from "./components/DebugPanel";
import { TableView } from "./components/TableView";
import { TaskFooter } from "./components/TaskFooter";
import { taskManager } from "../utils/taskManager";
import type {
  DownloadTask,
  VideoPreview,
  VideoQuality,
  VideoFps,
  YtDlpInfo,
} from "../types";
import { parseMediaUrl } from "../utils/urlParser";
import {
  fetchVideoInfo,
  downloadClip,
  downloadThumbnail,
  downloadSubtitles,
  findSubtitleFile,
} from "../utils/ytdlp";
import { parseSubtitleFile, extractClipTranscript, formatTranscriptForMarkdown } from "../utils/transcript";
import { parseYtDlpProgress } from "../utils/progressParser";
import { buildNotesMarkdown, buildMediaBaseName, formatTime, extractVideoDuration } from "../utils/fileHelpers";
import { PathUtils, getNodeFs, getNodeOs } from "../../../utils/nodeHelpers";

export const YT_DOWNLOADER_VIEW_TYPE = "ytd-downloader-view";

export class YTDownloaderView extends ItemView {
  private plugin: PakCLIPlugin;
  private activeTab: "download" | "table" = "download";

  // UI Component references
  private headerEl!: HTMLElement;
  private tabsNavEl!: HTMLElement;
  private contentElContainer!: HTMLElement;
  private footerElContainer!: HTMLElement;

  private hero!: DownloadHero;
  private form!: DownloadForm;
  private debugPanel!: DebugPanel;
  private recentTable!: TableView;
  private fullTable!: TableView;
  private taskFooter!: TaskFooter;

  private currentPreview: VideoPreview | null = null;
  private currentTaskId: string | null = null;
  private recentDownloadsCollapsed: boolean = false;

  constructor(leaf: WorkspaceLeaf, plugin: PakCLIPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return YT_DOWNLOADER_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "YT & IG Downloader";
  }

  getIcon(): string {
    return "video";
  }

  async onOpen(): Promise<void> {
    const root = this.containerEl.children[1] as HTMLElement;
    root.empty();
    root.addClass("ytec-downloader-view");

    // 1. Header Toolbar
    this.renderHeader(root);

    // 2. Tab Navigation Bar: [📥 Download New] [📊 Table View]
    this.renderTabsNav(root);

    // 3. Tab Content Area
    this.contentElContainer = root.createDiv({ cls: "ytec-view-body" });
    this.renderActiveTab();

    // 4. Global Persistent Footer
    this.footerElContainer = root.createDiv({ cls: "ytec-view-footer" });
    this.taskFooter = new TaskFooter(this.footerElContainer, {
      onViewAllTasks: () => this.switchTab("table"),
    });
  }

  async onClose(): Promise<void> {
    this.debugPanel?.destroy();
    this.recentTable?.destroy();
    this.fullTable?.destroy();
    this.taskFooter?.destroy();
  }

  async refreshData(forceRescan = true): Promise<void> {
    if (this.recentTable) {
      await this.recentTable.renderTable(forceRescan);
    }
    if (this.fullTable) {
      await this.fullTable.renderTable(forceRescan);
    }
  }

  private renderHeader(parentEl: HTMLElement): void {
    this.headerEl = parentEl.createDiv({ cls: "ytec-view-header" });

    // Left: Title
    const titleGroup = this.headerEl.createDiv({ cls: "ytec-view-title-group" });
    const logoIcon = titleGroup.createSpan({ cls: "ytec-view-logo" });
    setIcon(logoIcon, "video");
    titleGroup.createEl("h2", { text: "YT & IG Downloader", cls: "ytec-view-title" });

    // Right: Dock side panel toggle & Close
    const actionsGroup = this.headerEl.createDiv({ cls: "ytec-view-header-actions" });

    const dockBtn = actionsGroup.createEl("button", {
      cls: "ytec-icon-btn",
      title: "Dock to side panel / Expand",
      type: "button",
    });
    setIcon(dockBtn, "sidebar");
    dockBtn.addEventListener("click", () => this.toggleDock());

    const closeBtn = actionsGroup.createEl("button", {
      cls: "ytec-icon-btn",
      title: "Close view",
      type: "button",
    });
    setIcon(closeBtn, "x");
    closeBtn.addEventListener("click", () => this.leaf.detach());
  }

  private renderTabsNav(parentEl: HTMLElement): void {
    this.tabsNavEl = parentEl.createDiv({ cls: "ytec-view-tabs" });

    const dlTab = this.tabsNavEl.createEl("button", {
      cls: `ytec-tab-btn ${this.activeTab === "download" ? "is-active" : ""}`,
      text: "📥 Download New",
      type: "button",
    });
    dlTab.addEventListener("click", () => this.switchTab("download"));

    const tableTab = this.tabsNavEl.createEl("button", {
      cls: `ytec-tab-btn ${this.activeTab === "table" ? "is-active" : ""}`,
      text: "📊 Table View",
      type: "button",
    });
    tableTab.addEventListener("click", () => this.switchTab("table"));
  }

  private switchTab(tab: "download" | "table"): void {
    if (this.activeTab === tab) return;
    this.activeTab = tab;

    // Update tab bar styles
    const btns = this.tabsNavEl.querySelectorAll(".ytec-tab-btn");
    btns.forEach((btn, idx) => {
      if ((idx === 0 && tab === "download") || (idx === 1 && tab === "table")) {
        btn.addClass("is-active");
      } else {
        btn.removeClass("is-active");
      }
    });

    this.renderActiveTab();
  }

  private renderActiveTab(): void {
    this.recentTable?.destroy();
    this.recentTable = null as any;
    this.fullTable?.destroy();
    this.fullTable = null as any;

    this.contentElContainer.empty();

    if (this.activeTab === "download") {
      this.renderDownloadTab();
    } else {
      this.renderTableTab();
    }
  }

  // ── Tab 1: Download New ──────────────────────────────────────────────────

  private renderDownloadTab(): void {
    const tabContainer = this.contentElContainer.createDiv({ cls: "ytec-tab-content ytec-tab-download" });

    // 1. Hero with blurred thumbnail bg + clean URL input
    this.hero = new DownloadHero(tabContainer, {
      onUrlChange: (url) => this.handleUrlChanged(url),
      onEnter: () => {
        const state = this.form.getState();
        this.handleFetchAndDownload(state);
      },
    });

    // 2. Controls & 2 Action buttons (Fetch Only | Fetch & Download)
    this.form = new DownloadForm(tabContainer, this.plugin.settings, {
      onFetchOnly: (state) => this.handleFetchOnly(state),
      onFetchAndDownload: (state) => this.handleFetchAndDownload(state),
    });

    if (this.currentPreview) {
      this.hero.setPreview(this.currentPreview);
      this.form.setPreview(this.currentPreview);
    }

    // 3. Top Debug Panel
    this.debugPanel = new DebugPanel(tabContainer);
    if (this.currentTaskId) {
      this.debugPanel.setCurrentTaskId(this.currentTaskId);
    }

    // Divider
    tabContainer.createEl("hr", { cls: "ytec-section-divider" });

    // 4. Collapsible Recent Downloads Header
    const recentHeader = tabContainer.createDiv({ cls: "ytec-section-header" });
    const titleSpan = recentHeader.createSpan({ cls: "ytec-section-title" });
    const toggleIcon = titleSpan.createSpan({ cls: "ytec-section-toggle-icon" });
    setIcon(toggleIcon, this.recentDownloadsCollapsed ? "chevron-right" : "chevron-down");
    titleSpan.createSpan({ text: "🕐 Recent Downloads" });

    const recentActions = recentHeader.createDiv({ cls: "ytec-section-actions" });
    const refreshBtn = recentActions.createEl("button", {
      cls: "ytec-icon-btn ytec-recent-rescan-btn",
      title: "Rescan and refresh downloads from vault",
      type: "button",
    });
    setIcon(refreshBtn, "refresh-cw");
    refreshBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      void this.refreshData(true);
      new Notice("🔄 Scanned YT Captures folder");
    });

    recentHeader.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest(".ytec-recent-rescan-btn")) return;
      this.recentDownloadsCollapsed = !this.recentDownloadsCollapsed;
      setIcon(toggleIcon, this.recentDownloadsCollapsed ? "chevron-right" : "chevron-down");
      if (recentContainer) {
        recentContainer.style.display = this.recentDownloadsCollapsed ? "none" : "block";
      }
    });

    // 5. Recent TableView (Flat mode, capped to ~10)
    const recentContainer = tabContainer.createDiv({ cls: "ytec-recent-table-container" });
    if (this.recentDownloadsCollapsed) recentContainer.style.display = "none";

    this.recentTable = new TableView(recentContainer, this.app, this.plugin, {
      mode: "flat",
      isRecentOnly: true,
      onRefreshItem: (url) => {
        this.hero.setUrl(url);
        this.handleFetchOnly(this.form.getState());
      },
      onDownloadOtherQuality: (url, quality, fps, start, end) => {
        this.startDownloadPipeline({
          url,
          quality,
          fps,
          start,
          end,
          isFull: start === 0 && end === 0,
          presetId: this.plugin.settings.activePresetId || "yt_evidence_standard",
          folder: this.plugin.settings.ytCaptureOutputFolder || "YT Captures",
        });
      },
    });
  }

  // ── Tab 2: Full History Table View ──────────────────────────────────────

  private renderTableTab(): void {
    const tabContainer = this.contentElContainer.createDiv({ cls: "ytec-tab-content ytec-tab-table" });

    this.fullTable = new TableView(tabContainer, this.app, this.plugin, {
      mode: "flat",
      isRecentOnly: false,
      showAddBar: true,
      onAddNewDownload: (url) => {
        this.hero.setUrl(url);
        this.switchTab("download");
        this.handleFetchOnly(this.form.getState());
      },
      onRefreshItem: (url) => {
        this.hero.setUrl(url);
        this.switchTab("download");
        this.handleFetchOnly(this.form.getState());
      },
      onDownloadOtherQuality: (url, quality, fps, start, end) => {
        this.startDownloadPipeline({
          url,
          quality,
          fps,
          start,
          end,
          isFull: start === 0 && end === 0,
          presetId: this.plugin.settings.activePresetId || "yt_evidence_standard",
          folder: this.plugin.settings.ytCaptureOutputFolder || "YT Captures",
        });
      },
    });
  }

  // ── Core Business Actions ────────────────────────────────────────────────

  private async handleUrlChanged(url: string): Promise<void> {
    const parsed = parseMediaUrl(url);
    if (!parsed) return;
    // Auto preview or prepare
  }

  private async handleFetchOnly(formState: DownloadFormState): Promise<void> {
    const url = this.hero.getUrl();
    if (!url) {
      new Notice("Please enter a YouTube or Instagram link first.");
      this.hero.focus();
      return;
    }

    this.hero.setLoading(true);
    this.form.setLoading(true);

    try {
      const info = await fetchVideoInfo(url, this.plugin.settings);
      const parsed = parseMediaUrl(url);
      const platform = parsed?.platform || "youtube";
      const totalDur = extractVideoDuration(info);

      const preview: VideoPreview = {
        video_id: info.id,
        original_url: url,
        platform,
        title: info.title || "Untitled Video",
        channel: info.channel || info.uploader || "",
        channel_url: info.channel_url || info.uploader_url || "",
        thumbnail: info.thumbnail || "",
        start: formState.isFull ? 0 : formState.start,
        end: formState.isFull ? (totalDur || formState.end) : formState.end,
        duration: totalDur,
        has_transcript: Boolean(info.subtitles && Object.keys(info.subtitles).length > 0),
        video_duration: totalDur,
        upload_date: info.upload_date || "",
        view_count: info.view_count || 0,
        tags: info.tags || [],
        description: info.description || "",
        quality: formState.quality,
        fps: formState.fps,
      };

      this.currentPreview = preview;
      this.hero.setPreview(preview);
      this.form.setPreview(preview);

      // Create a "Fetches Only" task in taskManager
      const taskId = "fetch_" + Date.now();
      const task: DownloadTask = {
        id: taskId,
        url,
        title: preview.title,
        channel: preview.channel,
        thumbnail: preview.thumbnail,
        platform: preview.platform,
        quality: preview.quality,
        fps: preview.fps,
        timeRange: { start: preview.start, end: preview.end, isFull: formState.isFull },
        duration: preview.duration,
        status: "done",
        currentStep: "done",
        progress: { percent: 100, downloaded: "0MB", total: "0MB", speed: "--", eta: "--", rawMsg: "Metadata fetched" },
        logs: [`Fetched metadata: ${preview.title}`],
        isFetchOnly: true,
        createdAt: Date.now(),
      };

      this.currentTaskId = taskId;
      taskManager.addTask(task);
      this.debugPanel?.setCurrentTaskId(taskId);
      new Notice(`✓ Fetched info for "${preview.title.slice(0, 30)}..."`);
    } catch (err: any) {
      new Notice(`⚠️ Fetch failed: ${err.message || String(err)}`);
    } finally {
      this.hero.setLoading(false);
      this.form.setLoading(false);
    }
  }

  private async handleFetchAndDownload(formState: DownloadFormState): Promise<void> {
    const url = this.hero.getUrl();
    if (!url) {
      new Notice("Please enter a YouTube or Instagram link first.");
      this.hero.focus();
      return;
    }

    // If info not fetched yet, fetch first then download
    if (!this.currentPreview || this.currentPreview.original_url !== url) {
      this.hero.setLoading(true);
      this.form.setLoading(true);
      try {
        const info = await fetchVideoInfo(url, this.plugin.settings);
        const parsed = parseMediaUrl(url);
        const platform = parsed?.platform || "youtube";

        const totalDur = extractVideoDuration(info);
        this.currentPreview = {
          video_id: info.id,
          original_url: url,
          platform,
          title: info.title || "Untitled Video",
          channel: info.channel || info.uploader || "",
          channel_url: info.channel_url || info.uploader_url || "",
          thumbnail: info.thumbnail || "",
          start: formState.isFull ? 0 : formState.start,
          end: formState.isFull ? (totalDur || formState.end) : formState.end,
          duration: totalDur,
          has_transcript: Boolean(info.subtitles && Object.keys(info.subtitles).length > 0),
          video_duration: totalDur,
          upload_date: info.upload_date || "",
          view_count: info.view_count || 0,
          tags: info.tags || [],
          description: info.description || "",
          quality: formState.quality,
          fps: formState.fps,
        };

        this.hero.setPreview(this.currentPreview);
        this.form.setPreview(this.currentPreview);
      } catch (e: any) {
        new Notice(`Fetch error: ${e.message}`);
        this.hero.setLoading(false);
        this.form.setLoading(false);
        return;
      }
      this.hero.setLoading(false);
      this.form.setLoading(false);
    }

    // Launch pipeline
    this.startDownloadPipeline({
      url,
      quality: formState.quality,
      fps: formState.fps,
      start: formState.start,
      end: formState.end,
      isFull: formState.isFull,
      presetId: formState.presetId,
      folder: formState.folder,
      preview: this.currentPreview,
    });
  }

  private async startDownloadPipeline(params: {
    url: string;
    quality: VideoQuality;
    fps: VideoFps;
    start: number;
    end: number;
    isFull: boolean;
    presetId: string;
    folder: string;
    preview?: VideoPreview | null;
  }): Promise<void> {
    const { url, quality, fps, start, end, isFull, presetId, folder } = params;
    const preview = params.preview || this.currentPreview;

    const taskId = "task_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
    this.currentTaskId = taskId;
    this.debugPanel?.setCurrentTaskId(taskId);

    const abortController = new AbortController();

    const task: DownloadTask = {
      id: taskId,
      url,
      title: preview?.title || "Downloading Video...",
      channel: preview?.channel || "",
      thumbnail: preview?.thumbnail || "",
      platform: preview?.platform || (url.includes("instagram.com") ? "instagram" : "youtube"),
      quality,
      fps,
      timeRange: { start, end, isFull },
      duration: preview?.duration || 0,
      status: "deps",
      currentStep: "deps",
      progress: { percent: 0, downloaded: "0MB", total: "--", speed: "--", eta: "--", rawMsg: "Verifying dependencies..." },
      logs: [`Initiating download pipeline for ${url}`],
      createdAt: Date.now(),
      abortFn: () => abortController.abort(),
    };

    taskManager.addTask(task);

    // Run async pipeline in background
    (async () => {
      try {
        const fs = getNodeFs();
        const os = getNodeOs();
        if (!fs || !os) throw new Error("Node file system is not available on this platform.");

        // Step 1: Deps
        taskManager.log(taskId, "Verifying yt-dlp & ffmpeg binaries...");
        taskManager.setStep(taskId, "fetch", "fetching");

        // Step 2: Fetch if not already available
        let activePreview = preview;
        if (!activePreview || activePreview.original_url !== url) {
          taskManager.log(taskId, "Fetching stream metadata via yt-dlp...");
          const info = await fetchVideoInfo(url, this.plugin.settings);
          const totalDur = extractVideoDuration(info);
          activePreview = {
            video_id: info.id,
            original_url: url,
            platform: task.platform,
            title: info.title || "Untitled Video",
            channel: info.channel || info.uploader || "",
            channel_url: info.channel_url || info.uploader_url || "",
            thumbnail: info.thumbnail || "",
            start,
            end: end > 0 ? end : (totalDur || 10),
            duration: totalDur,
            has_transcript: Boolean(info.subtitles && Object.keys(info.subtitles).length > 0),
            video_duration: totalDur,
            upload_date: info.upload_date || "",
            view_count: info.view_count || 0,
            tags: info.tags || [],
            description: info.description || "",
            quality,
            fps,
          };
          taskManager.updateTask(taskId, {
            title: activePreview.title,
            channel: activePreview.channel,
            thumbnail: activePreview.thumbnail,
            duration: activePreview.duration,
          });
        }

        // Step 3: Download
        taskManager.setStep(taskId, "download", "downloading");
        taskManager.log(taskId, `Starting clip download: ${quality} @ ${fps} (${formatTime(start)} → ${formatTime(end)})`);

        const tempDir = PathUtils.join(os.tmpdir(), `ytd_${Date.now()}`);
        fs.mkdirSync(tempDir, { recursive: true });

        const clipOutExt = quality === "audio" ? "mp3" : "mp4";
        const clipOutPath = PathUtils.join(tempDir, `clip.${clipOutExt}`);

        await downloadClip(
          url,
          start,
          end,
          clipOutPath,
          this.plugin.settings,
          quality,
          fps,
          (msg) => {
            const clean = msg.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "").trim();
            if (!clean) return;

            const prog = parseYtDlpProgress(clean);
            if (prog) {
              taskManager.updateProgress(taskId, prog);
            } else if (clean.includes("[ExtractAudio]") || clean.includes("Destination: ") || clean.includes("[ffmpeg]")) {
              taskManager.log(taskId, clean.slice(0, 100));
              taskManager.updateProgress(taskId, {
                percent: 100,
                downloaded: "--",
                total: "--",
                eta: "",
                speed: "",
                rawMsg: quality === "audio" ? "Converting audio to MP3..." : "Merging video & audio...",
              });
            } else if (clean.startsWith("[download]") || clean.startsWith("[Merger]")) {
              taskManager.log(taskId, clean.slice(0, 100));
            }
          },
          isFull
        );

        if (abortController.signal.aborted) {
          taskManager.cancelTask(taskId);
          return;
        }

        // Dynamically find actual downloaded media file in temp directory
        const expectedClipPath = PathUtils.join(tempDir, quality === "audio" ? "clip.mp3" : "clip.mp4");
        let actualClipPath = expectedClipPath;
        if (!fs.existsSync(actualClipPath)) {
          const mediaExts = [".mp3", ".m4a", ".mp4", ".webm", ".opus", ".mkv", ".wav", ".aac"];
          const candidates = fs
            .readdirSync(tempDir)
            .filter((f: string) => {
              const lower = f.toLowerCase();
              return (
                mediaExts.some((ext) => lower.endsWith(ext)) &&
                !lower.endsWith(".part") &&
                !lower.endsWith(".ytdl") &&
                !lower.endsWith(".json") &&
                !lower.endsWith(".json3") &&
                !lower.endsWith(".jpg")
              );
            })
            .map((f: string) => PathUtils.join(tempDir, f));

          if (candidates.length > 0) {
            const prioritized = candidates.find((f: string) =>
              quality === "audio" ? f.toLowerCase().endsWith(".mp3") : f.toLowerCase().endsWith(".mp4")
            );
            actualClipPath = prioritized || candidates[0];
          }
        }

        taskManager.log(taskId, `Clip download completed (${actualClipPath}). Processing outputs...`);

        // Download thumbnail
        let thumbBuffer: Buffer | Uint8Array | null = null;
        if (activePreview.thumbnail) {
          try {
            const arr = await downloadThumbnail(activePreview.thumbnail);
            thumbBuffer = typeof Buffer !== "undefined" ? Buffer.from(arr) : new Uint8Array(arr);
          } catch {}
        }

        // Subtitles / Transcripts (skip for audio to maximize speed; only fetch for video)
        let transcriptEntries: any[] = [];
        if (quality !== "audio" && activePreview.has_transcript) {
          try {
            taskManager.updateProgress(taskId, {
              percent: 100,
              downloaded: "--",
              total: "--",
              eta: "",
              speed: "",
              rawMsg: "Fetching transcript...",
            });
            await downloadSubtitles(url, tempDir, this.plugin.settings);
            const subFile = findSubtitleFile(tempDir);
            if (subFile) {
              const raw = JSON.parse(fs.readFileSync(subFile, "utf-8"));
              transcriptEntries = parseSubtitleFile(raw);
            }
          } catch {}
        }

        // Resolve target folder in vault
        const outputFolder = folder || this.plugin.settings.ytCaptureOutputFolder || "YT Captures";
        await this.ensureFolder(outputFolder);

        const platform = activePreview.platform || (url.includes("instagram.com") ? "instagram" : "youtube");
        const maxTitleLen = this.plugin.settings.maxTitleLength || 20;
        const { baseName, formatExt } = buildMediaBaseName(
          activePreview.title,
          start,
          end,
          quality,
          fps,
          platform,
          new Date(),
          maxTitleLen
        );
        const actualExt = actualClipPath && fs.existsSync(actualClipPath)
          ? actualClipPath.split(".").pop()?.toLowerCase() || formatExt
          : formatExt;
        const clipFileName = `${baseName}.${actualExt}`;
        const thumbFileName = `${baseName}.jpg`;
        const noteFileName = `${baseName}.md`;

        const targetMediaVaultPath = `${outputFolder}/${clipFileName}`;
        const targetThumbVaultPath = `${outputFolder}/${thumbFileName}`;
        const targetNoteVaultPath = `${outputFolder}/${noteFileName}`;

        // Save downloaded media to vault (both physical disk copy and vault binary registration)
        if (fs.existsSync(actualClipPath)) {
          const adapter = this.app.vault.adapter as any;
          const vaultBasePath = adapter.getBasePath ? adapter.getBasePath() : adapter.basePath;
          if (vaultBasePath) {
            try {
              const destFsDir = PathUtils.join(vaultBasePath, outputFolder);
              if (!fs.existsSync(destFsDir)) {
                fs.mkdirSync(destFsDir, { recursive: true });
              }
              const destFsFile = PathUtils.join(destFsDir, clipFileName);
              fs.copyFileSync(actualClipPath, destFsFile);
              taskManager.log(taskId, `✓ Direct disk copy verified: ${destFsFile}`);
            } catch (copyErr) {
              taskManager.log(taskId, `[WARN] Direct disk copy fallback: ${copyErr}`);
            }
          }

          const clipBuffer = fs.readFileSync(actualClipPath);
          const clipArrayBuf = clipBuffer.buffer.slice(
            clipBuffer.byteOffset,
            clipBuffer.byteOffset + clipBuffer.byteLength
          ) as ArrayBuffer;

          if (await this.app.vault.adapter.exists(targetMediaVaultPath)) {
            await this.app.vault.adapter.writeBinary(targetMediaVaultPath, clipArrayBuf);
          } else {
            try {
              await this.app.vault.createBinary(targetMediaVaultPath, clipArrayBuf);
            } catch {
              await this.app.vault.adapter.writeBinary(targetMediaVaultPath, clipArrayBuf);
            }
          }
          taskManager.log(taskId, `✓ Saved media file: ${targetMediaVaultPath}`);
        } else {
          taskManager.log(taskId, `[WARN] Media file not found in temp directory (${actualClipPath})`);
        }

        // Save thumbnail image to vault if present
        if (thumbBuffer) {
          const thumbArrayBuf = thumbBuffer.buffer.slice(
            thumbBuffer.byteOffset,
            thumbBuffer.byteOffset + thumbBuffer.byteLength
          ) as ArrayBuffer;
          const existingThumb = this.app.vault.getAbstractFileByPath(targetThumbVaultPath);
          if (existingThumb instanceof TFile) {
            await this.app.vault.modifyBinary(existingThumb, thumbArrayBuf);
          } else {
            await this.app.vault.createBinary(targetThumbVaultPath, thumbArrayBuf);
          }
        }

        // Build transcripts
        const clipTranscriptEntries = extractClipTranscript(transcriptEntries, start, end);
        const clipTranscriptText = formatTranscriptForMarkdown(clipTranscriptEntries, false);
        const fullTranscriptText = formatTranscriptForMarkdown(transcriptEntries, true);

        const activePreset = this.plugin.settings.presets?.find((p) => p.id === presetId);

        // Build and save markdown note
        const noteContent = buildNotesMarkdown({
          title: activePreview.title,
          url,
          videoId: activePreview.video_id,
          channel: activePreview.channel,
          channelUrl: activePreview.channel_url,
          uploadDate: activePreview.upload_date,
          videoDuration: activePreview.duration,
          capturedAt: new Date().toISOString(),
          clipStart: start,
          clipEnd: end,
          clipDuration: Math.max(0, end - start),
          viewCount: activePreview.view_count,
          tags: activePreview.tags,
          clipTranscript: clipTranscriptText,
          description: activePreview.description,
          fullTranscript: fullTranscriptText,
          mediaEmbeds: {
            mp4Filename: clipFileName,
            thumbFilename: thumbFileName,
          },
          frontmatterKeys: activePreset?.frontmatterKeys,
        });

        // Write note
        const existingNote = this.app.vault.getAbstractFileByPath(targetNoteVaultPath);
        if (existingNote instanceof TFile) {
          await this.app.vault.modify(existingNote, noteContent);
        } else {
          await this.app.vault.create(targetNoteVaultPath, noteContent);
        }

        // Cleanup temp dir
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
        } catch {}

        // Step 4: Finalize
        taskManager.setStep(taskId, "done", "done");
        taskManager.updateTask(taskId, {
          outputFilePath: targetNoteVaultPath,
          completedAt: Date.now(),
          progress: { percent: 100, downloaded: "Done", total: "Done", speed: "--", eta: "--", rawMsg: "Completed" },
        });
        taskManager.log(taskId, `✓ Successfully saved note to: ${targetNoteVaultPath}`);
        new Notice(`✓ Completed download: "${activePreview.title.slice(0, 28)}..."`);
      } catch (err: any) {
        if (abortController.signal.aborted) {
          taskManager.cancelTask(taskId);
        } else {
          taskManager.updateTask(taskId, {
            status: "error",
            error: err.message || String(err),
            completedAt: Date.now(),
          });
          taskManager.log(taskId, `[ERROR] ${err.message || String(err)}`);
          new Notice(`⚠️ Download failed: ${err.message || String(err)}`);
        }
      }
    })();
  }

  private async ensureFolder(path: string): Promise<void> {
    if (!this.app.vault.getAbstractFileByPath(path)) {
      await this.app.vault.createFolder(path);
    }
  }

  private toggleDock(): void {
    // If currently in main leaf, move to right sidebar leaf and vice versa
    const isRightSplit = (this.leaf as any).parent?.containerEl?.closest(".mod-right-split") !== null;
    if (isRightSplit) {
      const newLeaf = this.app.workspace.getLeaf(true);
      newLeaf.setViewState({ type: YT_DOWNLOADER_VIEW_TYPE, active: true });
      this.leaf.detach();
    } else {
      const rightLeaf = this.app.workspace.getRightLeaf(false);
      if (rightLeaf) {
        rightLeaf.setViewState({ type: YT_DOWNLOADER_VIEW_TYPE, active: true });
        this.leaf.detach();
      }
    }
  }
}
