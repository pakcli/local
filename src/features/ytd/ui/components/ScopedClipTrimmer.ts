import { setIcon } from "obsidian";
import { formatTime, parseTimeInput } from "../../utils/fileHelpers";

export interface ClipRange {
  start: number;
  end: number;
  isFull: boolean;
}

export interface ScopedClipTrimmerOptions {
  totalDuration: number;
  initialRange?: ClipRange;
  onApply: (range: ClipRange) => void;
  onCancel: () => void;
  onResetFull: () => void;
}

/**
 * Non-blocking, sidepanel-scoped Clip Trimmer widget.
 * Renders directly inside the container leaf without any fullscreen dark modal overlay,
 * ensuring the user can freely read, edit, and navigate their Obsidian note while trimming.
 */
export class ScopedClipTrimmer {
  private containerEl: HTMLElement;
  private totalDuration: number;
  private currentStart: number;
  private currentEnd: number;
  private options: ScopedClipTrimmerOptions;

  private startInputEl!: HTMLInputElement;
  private endInputEl!: HTMLInputElement;
  private durationBadgeEl!: HTMLElement;
  private sliderMinEl!: HTMLInputElement;
  private sliderMaxEl!: HTMLInputElement;

  constructor(parentEl: HTMLElement, options: ScopedClipTrimmerOptions) {
    this.options = options;
    this.totalDuration = Math.max(1, Math.round(options.totalDuration));
    this.currentStart = options.initialRange?.start ?? 0;
    this.currentEnd = options.initialRange?.end ?? this.totalDuration;

    this.containerEl = parentEl.createDiv({ cls: "pakcli-scoped-clip-trimmer" });
    this.applyContainerStyles();
    this.render();
  }

  private applyContainerStyles(): void {
    const el = this.containerEl;
    el.style.backgroundColor = "var(--background-secondary-alt)";
    el.style.border = "1px solid var(--interactive-accent)";
    el.style.borderRadius = "8px";
    el.style.padding = "10px 12px";
    el.style.margin = "8px 0";
    el.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.15)";
    el.style.position = "relative";
    el.style.zIndex = "10";
  }

  private render(): void {
    this.containerEl.empty();

    // 1. Header with title & close icon
    const headerRow = this.containerEl.createDiv();
    headerRow.style.display = "flex";
    headerRow.style.justifyContent = "space-between";
    headerRow.style.alignItems = "center";
    headerRow.style.marginBottom = "8px";

    const titleEl = headerRow.createSpan({ text: "✂️ Edit Clip Range" });
    titleEl.style.fontWeight = "bold";
    titleEl.style.fontSize = "0.9em";
    titleEl.style.color = "var(--text-accent)";

    const closeBtn = headerRow.createEl("button", {
      cls: "ytec-icon-btn",
      title: "Close range editor",
      type: "button",
    });
    setIcon(closeBtn, "x");
    closeBtn.style.padding = "2px 4px";
    closeBtn.addEventListener("click", () => this.options.onCancel());

    // 2. Timeline Sliders (Dual range)
    const sliderContainer = this.containerEl.createDiv();
    sliderContainer.style.margin = "6px 0";

    const trackRow = sliderContainer.createDiv();
    trackRow.style.display = "flex";
    trackRow.style.gap = "8px";
    trackRow.style.alignItems = "center";

    this.sliderMinEl = trackRow.createEl("input", { type: "range" });
    this.sliderMinEl.min = "0";
    this.sliderMinEl.max = this.totalDuration.toString();
    this.sliderMinEl.value = this.currentStart.toString();
    this.sliderMinEl.style.flex = "1";

    this.sliderMaxEl = trackRow.createEl("input", { type: "range" });
    this.sliderMaxEl.min = "0";
    this.sliderMaxEl.max = this.totalDuration.toString();
    this.sliderMaxEl.value = this.currentEnd.toString();
    this.sliderMaxEl.style.flex = "1";

    this.sliderMinEl.addEventListener("input", () => {
      this.currentStart = Math.min(Number(this.sliderMinEl.value), this.currentEnd - 1);
      this.sliderMinEl.value = this.currentStart.toString();
      this.updateInputDisplay();
    });

    this.sliderMaxEl.addEventListener("input", () => {
      this.currentEnd = Math.max(Number(this.sliderMaxEl.value), this.currentStart + 1);
      this.sliderMaxEl.value = this.currentEnd.toString();
      this.updateInputDisplay();
    });

    // 3. Manual Inputs: Start & End
    const inputGrid = this.containerEl.createDiv();
    inputGrid.style.display = "grid";
    inputGrid.style.gridTemplateColumns = "1fr 1fr";
    inputGrid.style.gap = "8px";
    inputGrid.style.margin = "8px 0";

    // Start Input
    const startGroup = inputGrid.createDiv();
    startGroup.createEl("label", { text: "Start Time", cls: "ytec-time-label" });
    this.startInputEl = startGroup.createEl("input", {
      type: "text",
      value: formatTime(this.currentStart),
      cls: "ytec-time-input",
    });
    this.startInputEl.style.width = "100%";
    this.startInputEl.addEventListener("change", () => {
      const parsed = parseTimeInput(this.startInputEl.value.trim());
      if (parsed !== null && parsed >= 0 && parsed < this.currentEnd) {
        this.currentStart = parsed;
        this.sliderMinEl.value = parsed.toString();
        this.updateInputDisplay();
      } else {
        this.startInputEl.value = formatTime(this.currentStart);
      }
    });

    // End Input
    const endGroup = inputGrid.createDiv();
    endGroup.createEl("label", { text: "End Time", cls: "ytec-time-label" });
    this.endInputEl = endGroup.createEl("input", {
      type: "text",
      value: formatTime(this.currentEnd),
      cls: "ytec-time-input",
    });
    this.endInputEl.style.width = "100%";
    this.endInputEl.addEventListener("change", () => {
      const parsed = parseTimeInput(this.endInputEl.value.trim());
      if (parsed !== null && parsed > this.currentStart && parsed <= this.totalDuration) {
        this.currentEnd = parsed;
        this.sliderMaxEl.value = parsed.toString();
        this.updateInputDisplay();
      } else {
        this.endInputEl.value = formatTime(this.currentEnd);
      }
    });

    // 4. Clip duration badge & quick presets
    const metaRow = this.containerEl.createDiv();
    metaRow.style.display = "flex";
    metaRow.style.justifyContent = "space-between";
    metaRow.style.alignItems = "center";
    metaRow.style.margin = "8px 0";

    this.durationBadgeEl = metaRow.createSpan();
    this.updateBadgeDisplay();

    const presetsRow = metaRow.createDiv();
    presetsRow.style.display = "flex";
    presetsRow.style.gap = "4px";

    const addPresetBtn = (label: string, startSec: number, endSec: number) => {
      const b = presetsRow.createEl("button", { text: label, cls: "ytec-btn ytec-btn-xs" });
      b.style.fontSize = "0.75em";
      b.style.padding = "2px 6px";
      b.addEventListener("click", () => {
        this.currentStart = Math.max(0, startSec);
        this.currentEnd = Math.min(this.totalDuration, endSec);
        this.sliderMinEl.value = this.currentStart.toString();
        this.sliderMaxEl.value = this.currentEnd.toString();
        this.updateInputDisplay();
      });
    };

    if (this.totalDuration > 60) addPresetBtn("1m", 0, 60);
    if (this.totalDuration > 300) addPresetBtn("5m", 0, 300);

    const fullBtn = presetsRow.createEl("button", { text: "↺ Full", cls: "ytec-btn ytec-btn-xs" });
    fullBtn.style.fontSize = "0.75em";
    fullBtn.style.padding = "2px 6px";
    fullBtn.addEventListener("click", () => {
      this.currentStart = 0;
      this.currentEnd = this.totalDuration;
      this.sliderMinEl.value = "0";
      this.sliderMaxEl.value = this.totalDuration.toString();
      this.updateInputDisplay();
    });

    // 5. Action Buttons (Apply & Cancel)
    const actionRow = this.containerEl.createDiv();
    actionRow.style.display = "flex";
    actionRow.style.gap = "8px";
    actionRow.style.marginTop = "10px";

    const applyBtn = actionRow.createEl("button", {
      text: "✔ Apply Clip Range",
      cls: "mod-cta",
    });
    applyBtn.style.flex = "1";
    applyBtn.style.fontSize = "0.85em";
    applyBtn.addEventListener("click", () => {
      const isFull = this.currentStart === 0 && this.currentEnd >= this.totalDuration;
      this.options.onApply({
        start: this.currentStart,
        end: this.currentEnd,
        isFull,
      });
    });

    const cancelBtn = actionRow.createEl("button", {
      text: "Cancel",
      cls: "ytec-btn",
    });
    cancelBtn.style.fontSize = "0.85em";
    cancelBtn.addEventListener("click", () => this.options.onCancel());
  }

  private updateInputDisplay(): void {
    if (this.startInputEl) this.startInputEl.value = formatTime(this.currentStart);
    if (this.endInputEl) this.endInputEl.value = formatTime(this.currentEnd);
    this.updateBadgeDisplay();
  }

  private updateBadgeDisplay(): void {
    if (!this.durationBadgeEl) return;
    const diff = Math.max(0, this.currentEnd - this.currentStart);
    const isFull = this.currentStart === 0 && this.currentEnd >= this.totalDuration;

    if (isFull) {
      this.durationBadgeEl.setText(`Full Video: ${formatTime(this.totalDuration)}`);
      this.durationBadgeEl.style.color = "var(--text-muted)";
      this.durationBadgeEl.style.fontSize = "0.8em";
    } else {
      const savedPct = Math.round((1 - diff / this.totalDuration) * 100);
      this.durationBadgeEl.setText(`✂️ Clip: ${formatTime(diff)} (${savedPct}% saved)`);
      this.durationBadgeEl.style.color = "var(--color-green)";
      this.durationBadgeEl.style.fontWeight = "bold";
      this.durationBadgeEl.style.fontSize = "0.85em";
    }
  }

  destroy(): void {
    this.containerEl.remove();
  }
}
