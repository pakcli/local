import { setIcon } from "obsidian";
import type { VideoPreview } from "../../types";
import { formatTime } from "../../utils/fileHelpers";

export interface DownloadHeroOptions {
  onUrlChange?: (url: string) => void;
  onEnter?: () => void;
}

export class DownloadHero {
  private containerEl: HTMLElement;
  private bgEl: HTMLElement;
  private contentEl: HTMLElement;
  private inputEl: HTMLInputElement;
  private previewMetaEl: HTMLElement;
  private options: DownloadHeroOptions;

  constructor(parentEl: HTMLElement, options: DownloadHeroOptions = {}) {
    this.options = options;

    this.containerEl = parentEl.createDiv({ cls: "ytec-hero-container" });
    this.bgEl = this.containerEl.createDiv({ cls: "ytec-hero-bg" });
    this.contentEl = this.containerEl.createDiv({ cls: "ytec-hero-content" });

    // 1. URL Input Box (Clean, without a fetch button beside it)
    const inputWrapper = this.contentEl.createDiv({ cls: "ytec-hero-input-wrapper" });
    const iconEl = inputWrapper.createSpan({ cls: "ytec-hero-input-icon" });
    setIcon(iconEl, "link");

    this.inputEl = inputWrapper.createEl("input", {
      type: "text",
      placeholder: "Paste YouTube or Instagram link here...",
      cls: "ytec-hero-input",
    });

    this.inputEl.addEventListener("input", () => {
      this.options.onUrlChange?.(this.inputEl.value.trim());
    });

    this.inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        this.options.onEnter?.();
      }
    });

    // 2. Metadata preview area (visible after fetch)
    this.previewMetaEl = this.contentEl.createDiv({ cls: "ytec-hero-meta is-hidden" });
  }

  getUrl(): string {
    return this.inputEl.value.trim();
  }

  setUrl(url: string): void {
    this.inputEl.value = url;
    this.options.onUrlChange?.(url);
  }

  focus(): void {
    this.inputEl.focus();
  }

  setPreview(preview: VideoPreview | null): void {
    this.previewMetaEl.empty();

    if (!preview) {
      this.bgEl.style.backgroundImage = "none";
      this.containerEl.removeClass("has-preview");
      this.previewMetaEl.addClass("is-hidden");
      return;
    }

    this.containerEl.addClass("has-preview");
    this.previewMetaEl.removeClass("is-hidden");

    // Update blurred background
    if (preview.thumbnail) {
      this.bgEl.style.backgroundImage = `url("${preview.thumbnail}")`;
    }

    // Small thumbnail avatar + video info
    const metaCard = this.previewMetaEl.createDiv({ cls: "ytec-hero-meta-card" });

    if (preview.thumbnail) {
      const thumbEl = metaCard.createDiv({ cls: "ytec-hero-meta-thumb" });
      thumbEl.createEl("img", { attr: { src: preview.thumbnail, alt: preview.title } });
      if (preview.duration > 0) {
        thumbEl.createSpan({ cls: "ytec-thumb-duration", text: formatTime(preview.duration) });
      }
    }

    const textEl = metaCard.createDiv({ cls: "ytec-hero-meta-text" });
    const titleEl = textEl.createEl("h3", { cls: "ytec-hero-meta-title", text: preview.title });
    titleEl.title = preview.title;

    const subEl = textEl.createDiv({ cls: "ytec-hero-meta-sub" });
    subEl.createSpan({
      cls: `ytec-badge ytec-badge-${preview.platform}`,
      text: preview.platform === "youtube" ? "🎬 YouTube" : "📸 Instagram",
    });

    if (preview.channel) {
      subEl.createSpan({ cls: "ytec-hero-channel", text: preview.channel });
    }

    if (preview.duration > 0) {
      subEl.createSpan({ cls: "ytec-hero-duration", text: `· ${formatTime(preview.duration)}` });
    }
  }

  setLoading(loading: boolean): void {
    if (loading) {
      this.inputEl.disabled = true;
      this.containerEl.addClass("is-loading");
    } else {
      this.inputEl.disabled = false;
      this.containerEl.removeClass("is-loading");
    }
  }
}
