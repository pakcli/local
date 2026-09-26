import { setIcon } from "obsidian";
import type { VideoQuality, VideoFps, YTPreset, YTCaptureSettings, VideoPreview } from "../../types";
import { formatTime, parseTimeInput } from "../../utils/fileHelpers";

export interface DownloadFormState {
  quality: VideoQuality;
  fps: VideoFps;
  start: number;
  end: number;
  isFull: boolean;
  presetId: string;
  folder: string;
}

export interface DownloadFormCallbacks {
  onFetchOnly: (state: DownloadFormState) => void;
  onFetchAndDownload: (state: DownloadFormState) => void;
  onChange?: (state: DownloadFormState) => void;
}

const QUALITY_OPTIONS: Array<{ value: VideoQuality; label: string }> = [
  { value: "4k", label: "4K" },
  { value: "2k", label: "1440p" },
  { value: "1080p", label: "1080p" },
  { value: "720p", label: "720p" },
  { value: "480p", label: "480p" },
  { value: "360p", label: "360p" },
  { value: "audio", label: "Audio" },
];

const FPS_OPTIONS: Array<{ value: VideoFps; label: string }> = [
  { value: "auto", label: "Auto" },
  { value: "60", label: "60fps" },
  { value: "30", label: "30fps" },
];

export class DownloadForm {
  private containerEl: HTMLElement;
  private qualityPillsEl: HTMLElement;
  private formatNoteEl: HTMLElement;
  private fpsPillsEl: HTMLElement;
  private rangeSectionEl: HTMLElement;
  private startInputEl!: HTMLInputElement;
  private endInputEl!: HTMLInputElement;
  private rangeMinEl!: HTMLInputElement;
  private rangeMaxEl!: HTMLInputElement;
  private highlightEl!: HTMLElement;
  private fullBtnEl!: HTMLElement;
  private actionBtnsContainer: HTMLElement;
  private fetchOnlyBtn!: HTMLButtonElement;
  private fetchAndDownloadBtn!: HTMLButtonElement;

  private state: DownloadFormState;
  private totalDuration: number = 0;
  private callbacks: DownloadFormCallbacks;

  constructor(
    parentEl: HTMLElement,
    settings: YTCaptureSettings,
    callbacks: DownloadFormCallbacks
  ) {
    this.callbacks = callbacks;
    this.state = {
      quality: settings.ytCaptureQuality || "1080p",
      fps: settings.ytCaptureFps || "auto",
      start: 0,
      end: settings.ytCaptureDefaultDuration || 10,
      isFull: true,
      presetId: settings.activePresetId || "yt_evidence_standard",
      folder: settings.ytCaptureOutputFolder || "YT Captures",
    };

    this.containerEl = parentEl.createDiv({ cls: "ytec-form-container" });

    // 1. Quality Row (with File format note: mp3 | mp4 beside it)
    const qualityRow = this.containerEl.createDiv({ cls: "ytec-form-row ytec-quality-row" });
    qualityRow.createSpan({ cls: "ytec-form-label", text: "Quality" });
    this.qualityPillsEl = qualityRow.createDiv({ cls: "ytec-pill-group" });
    this.formatNoteEl = qualityRow.createDiv({ cls: "ytec-format-note" });
    this.renderQualityPills();

    // 2. FPS Row
    const fpsRow = this.containerEl.createDiv({ cls: "ytec-form-row" });
    fpsRow.createSpan({ cls: "ytec-form-label", text: "FPS" });
    this.fpsPillsEl = fpsRow.createDiv({ cls: "ytec-pill-group" });
    this.renderFpsPills();

    // 3. Range Controls (Dual-handle slider + compact Full button)
    this.rangeSectionEl = this.containerEl.createDiv({ cls: "ytec-form-row ytec-range-row" });
    this.renderRangeControls();

    // 4. Action Buttons (The 2 Buttons requested by user)
    this.actionBtnsContainer = this.containerEl.createDiv({ cls: "ytec-form-actions" });
    this.renderActionButtons();
  }

  private renderQualityPills(): void {
    this.qualityPillsEl.empty();
    for (const opt of QUALITY_OPTIONS) {
      const pill = this.qualityPillsEl.createEl("button", {
        cls: `ytec-pill-btn ${this.state.quality === opt.value ? "is-active" : ""}`,
        text: opt.label,
        type: "button",
      });
      pill.addEventListener("click", () => {
        this.state.quality = opt.value;
        this.renderQualityPills();
        this.renderFpsPills();
        this.callbacks.onChange?.(this.state);
      });
    }

    // Render "File format: mp3 | mp4" note beside quality
    this.renderFormatNote();
  }

  private renderFormatNote(): void {
    this.formatNoteEl.empty();
    const isAudio = this.state.quality === "audio";

    this.formatNoteEl.createSpan({ text: "File format: ", cls: "ytec-fmt-label" });

    const mp3Tag = this.formatNoteEl.createSpan({
      cls: `ytec-fmt-tag ${isAudio ? "is-active" : ""}`,
      text: "mp3",
    });
    mp3Tag.title = "Switch to MP3 Audio";
    mp3Tag.addEventListener("click", () => {
      this.state.quality = "audio";
      this.renderQualityPills();
      this.renderFpsPills();
      this.callbacks.onChange?.(this.state);
    });

    this.formatNoteEl.createSpan({ text: " | ", cls: "ytec-fmt-sep" });

    const mp4Tag = this.formatNoteEl.createSpan({
      cls: `ytec-fmt-tag ${!isAudio ? "is-active" : ""}`,
      text: "mp4",
    });
    mp4Tag.title = "Switch to MP4 Video";
    mp4Tag.addEventListener("click", () => {
      this.state.quality = "1080p";
      this.renderQualityPills();
      this.renderFpsPills();
      this.callbacks.onChange?.(this.state);
    });
  }

  private renderFpsPills(): void {
    this.fpsPillsEl.empty();
    const isAudio = this.state.quality === "audio";
    for (const opt of FPS_OPTIONS) {
      const pill = this.fpsPillsEl.createEl("button", {
        cls: `ytec-pill-btn ${this.state.fps === opt.value ? "is-active" : ""} ${isAudio ? "is-disabled" : ""}`,
        text: opt.label,
        type: "button",
      });
      if (!isAudio) {
        pill.addEventListener("click", () => {
          this.state.fps = opt.value;
          this.renderFpsPills();
          this.callbacks.onChange?.(this.state);
        });
      }
    }
  }

  private renderRangeControls(): void {
    const headerRow = this.rangeSectionEl.createDiv({ cls: "ytec-range-header-row" });
    headerRow.createSpan({ cls: "ytec-form-label", text: "Range" });

    // Full button (compact, aligned to right of Range header)
    this.fullBtnEl = headerRow.createEl("button", {
      cls: `ytec-btn ytec-btn-full ${this.state.isFull ? "is-active" : ""}`,
      text: "⚡ Full",
      type: "button",
    });
    this.fullBtnEl.title = "Reset range to full duration";
    this.fullBtnEl.addEventListener("click", () => {
      this.state.isFull = true;
      this.state.start = 0;
      if (this.totalDuration > 0) {
        this.state.end = this.totalDuration;
      }
      this.syncRangeUI();
      this.callbacks.onChange?.(this.state);
    });

    const controls = this.rangeSectionEl.createDiv({ cls: "ytec-range-controls" });

    // Start input
    this.startInputEl = controls.createEl("input", {
      type: "text",
      cls: "ytec-time-input",
      value: formatTime(this.state.start),
    });
    this.startInputEl.title = "Start timestamp (e.g. 00:00 or 1:30)";
    this.startInputEl.addEventListener("change", () => {
      const parsed = parseTimeInput(this.startInputEl.value);
      this.state.start = Math.max(0, Math.min(parsed, this.state.end - 1));
      this.state.isFull = false;
      this.syncRangeUI();
      this.callbacks.onChange?.(this.state);
    });

    // Dual Slider Container (with 2 handles for the range)
    const dualContainer = controls.createDiv({ cls: "ytec-dual-range-container" });
    dualContainer.createDiv({ cls: "ytec-dual-range-track" });
    this.highlightEl = dualContainer.createDiv({ cls: "ytec-dual-range-highlight" });

    const totalMax = this.totalDuration > 0
      ? this.totalDuration
      : Math.max(60, this.state.end || 60);

    // Handle 1: Start Handle
    this.rangeMinEl = dualContainer.createEl("input", {
      type: "range",
      cls: "ytec-range-input ytec-range-min",
      attr: {
        min: "0",
        max: String(totalMax),
        step: "1",
        value: String(this.state.start),
      },
    });

    this.rangeMinEl.addEventListener("input", () => {
      const val = parseInt(this.rangeMinEl.value, 10);
      if (val >= this.state.end) {
        this.state.start = Math.max(0, this.state.end - 1);
        this.rangeMinEl.value = String(this.state.start);
      } else {
        this.state.start = val;
      }
      this.state.isFull = false;
      this.syncRangeUI();
      this.callbacks.onChange?.(this.state);
    });

    // Handle 2: End Handle
    this.rangeMaxEl = dualContainer.createEl("input", {
      type: "range",
      cls: "ytec-range-input ytec-range-max",
      attr: {
        min: "0",
        max: String(totalMax),
        step: "1",
        value: String(this.state.end),
      },
    });

    this.rangeMaxEl.addEventListener("input", () => {
      const val = parseInt(this.rangeMaxEl.value, 10);
      if (val <= this.state.start) {
        this.state.end = Math.min(totalMax, this.state.start + 1);
        this.rangeMaxEl.value = String(this.state.end);
      } else {
        this.state.end = val;
      }
      this.state.isFull = false;
      this.syncRangeUI();
      this.callbacks.onChange?.(this.state);
    });

    // End input
    this.endInputEl = controls.createEl("input", {
      type: "text",
      cls: "ytec-time-input",
      value: formatTime(this.state.end),
    });
    this.endInputEl.title = "End timestamp (e.g. 05:00 or 18:42)";
    this.endInputEl.addEventListener("change", () => {
      const parsed = parseTimeInput(this.endInputEl.value);
      this.state.end = Math.max(this.state.start + 1, parsed);
      this.state.isFull = false;
      this.syncRangeUI();
      this.callbacks.onChange?.(this.state);
    });

    this.syncRangeUI();
  }

  private syncRangeUI(): void {
    const totalMax = this.totalDuration > 0
      ? this.totalDuration
      : Math.max(60, this.state.end || 60);

    this.startInputEl.value = formatTime(this.state.start);
    this.endInputEl.value = formatTime(this.state.end);

    this.rangeMinEl.max = String(totalMax);
    this.rangeMaxEl.max = String(totalMax);
    this.rangeMinEl.value = String(this.state.start);
    this.rangeMaxEl.value = String(this.state.end);

    // Calculate percent positions for highlight bar
    const leftPercent = Math.max(0, Math.min(100, (this.state.start / totalMax) * 100));
    const rightPercent = Math.max(0, Math.min(100, (this.state.end / totalMax) * 100));

    this.highlightEl.style.left = `${leftPercent}%`;
    this.highlightEl.style.width = `${Math.max(0, rightPercent - leftPercent)}%`;

    if (this.state.isFull) {
      this.fullBtnEl.addClass("is-active");
    } else {
      this.fullBtnEl.removeClass("is-active");
    }
  }

  private renderActionButtons(): void {
    this.actionBtnsContainer.empty();

    // 1. [ 🔍 Fetch Only ]
    this.fetchOnlyBtn = this.actionBtnsContainer.createEl("button", {
      cls: "ytec-btn ytec-btn-fetch-only",
      type: "button",
    });
    const fetchIcon = this.fetchOnlyBtn.createSpan({ cls: "ytec-btn-icon" });
    setIcon(fetchIcon, "search");
    this.fetchOnlyBtn.createSpan({ text: "Fetch Only" });

    this.fetchOnlyBtn.addEventListener("click", () => {
      this.callbacks.onFetchOnly(this.state);
    });

    // 2. [ ⚡ Fetch & Download ]
    this.fetchAndDownloadBtn = this.actionBtnsContainer.createEl("button", {
      cls: "ytec-btn ytec-btn-fetch-download mod-cta",
      type: "button",
    });
    const dlIcon = this.fetchAndDownloadBtn.createSpan({ cls: "ytec-btn-icon" });
    setIcon(dlIcon, "zap");
    this.fetchAndDownloadBtn.createSpan({ text: "Fetch & Download" });

    this.fetchAndDownloadBtn.addEventListener("click", () => {
      this.callbacks.onFetchAndDownload(this.state);
    });
  }

  setPreview(preview: VideoPreview | null): void {
    if (!preview) {
      this.totalDuration = 0;
      return;
    }
    const dur = preview.duration || preview.video_duration || 0;
    this.totalDuration = dur;
    if (this.state.isFull && dur > 0) {
      this.state.start = 0;
      this.state.end = dur;
    } else if (this.state.end > dur && dur > 0) {
      this.state.end = dur;
    }
    this.syncRangeUI();
  }

  getState(): DownloadFormState {
    return { ...this.state };
  }

  setLoading(loading: boolean): void {
    this.fetchOnlyBtn.disabled = loading;
    this.fetchAndDownloadBtn.disabled = loading;
    if (loading) {
      this.containerEl.addClass("is-loading");
    } else {
      this.containerEl.removeClass("is-loading");
    }
  }
}
