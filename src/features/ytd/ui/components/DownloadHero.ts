import { Notice, setIcon } from "obsidian";
import type { VideoPreview } from "../../types";
import { formatTime, buildWebEmbed } from "../../utils/fileHelpers";
import { downloadThumbnail } from "../../utils/ytdlp";

export interface DownloadHeroOptions {
  onUrlChange?: (url: string) => void;
  onEnter?: () => void;
  getEmbedSettings?: () => { width?: string; height?: string };
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
      const img = thumbEl.createEl("img", {
        attr: {
          src: preview.thumbnail,
          alt: preview.title,
          referrerpolicy: "no-referrer",
        },
      });
      img.onerror = async () => {
        if (!img.src.startsWith("data:") && preview.thumbnail) {
          try {
            const arr = await downloadThumbnail(preview.thumbnail);
            if (arr && arr.byteLength > 0) {
              let b64 = "";
              if (typeof Buffer !== "undefined") {
                b64 = Buffer.from(arr).toString("base64");
              } else {
                const u8 = new Uint8Array(arr);
                let binary = "";
                const chunkSize = 8192;
                for (let i = 0; i < u8.length; i += chunkSize) {
                  binary += String.fromCharCode.apply(null, Array.from(u8.subarray(i, i + chunkSize)));
                }
                b64 = btoa(binary);
              }
              img.src = `data:image/jpeg;base64,${b64}`;
            }
          } catch {}
        }
      };
      if (preview.duration > 0) {
        thumbEl.createSpan({ cls: "ytec-thumb-duration", text: formatTime(preview.duration) });
      }
    }

    const textEl = metaCard.createDiv({ cls: "ytec-hero-meta-text" });
    const titleEl = textEl.createEl("h3", { cls: "ytec-hero-meta-title", text: preview.title });
    titleEl.title = preview.title;

    const isImage = preview.media_type === "image";
    let platformBadgeText = preview.platform === "youtube" ? "🎬 YouTube" : "📸 Instagram";
    if (preview.platform === "instagram" && isImage) {
      platformBadgeText = "📸 Instagram (Photo)";
    }

    const subEl = textEl.createDiv({ cls: "ytec-hero-meta-sub" });
    subEl.createSpan({
      cls: `ytec-badge ytec-badge-${preview.platform}`,
      text: platformBadgeText,
    });

    if (preview.channel) {
      subEl.createSpan({ cls: "ytec-hero-channel", text: preview.channel });
    }

    if (preview.duration > 0) {
      subEl.createSpan({ cls: "ytec-hero-duration", text: `· ${formatTime(preview.duration)}` });
    } else if (isImage) {
      subEl.createSpan({ cls: "ytec-hero-duration", text: "· 📷 Photo / Image Post" });
    }

    const actionsRow = textEl.createDiv({ cls: "ytec-hero-meta-actions" });
    const copyIframeBtn = actionsRow.createEl("button", {
      cls: "ytec-btn ytec-btn-sm",
      text: "📋 Copy iframe",
      type: "button",
      title: "Copy embed iframe HTML",
    });
    copyIframeBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const dims = this.options.getEmbedSettings?.() || {};
      const embed = buildWebEmbed(
        preview.platform,
        preview.video_id,
        this.getUrl(),
        preview.start || 0,
        preview.title,
        dims.width || "100%",
        dims.height || "520"
      );
      try {
        await navigator.clipboard.writeText(embed.iframeHtml);
        new Notice("📋 Copied iframe embed code!");
      } catch {
        new Notice("Failed to copy iframe embed code");
      }
    });

    const copyUrlBtn = actionsRow.createEl("button", {
      cls: "ytec-btn ytec-btn-sm",
      text: "🔗 Copy Embed URL",
      type: "button",
      title: "Copy direct embed player URL",
    });
    copyUrlBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const dims = this.options.getEmbedSettings?.() || {};
      const embed = buildWebEmbed(
        preview.platform,
        preview.video_id,
        this.getUrl(),
        preview.start || 0,
        preview.title,
        dims.width || "100%",
        dims.height || "520"
      );
      try {
        await navigator.clipboard.writeText(embed.embedUrl);
        new Notice("🔗 Copied player embed URL!");
      } catch {
        new Notice("Failed to copy embed URL");
      }
    });
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
