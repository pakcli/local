import { Notice, setIcon } from "obsidian";
import type { VideoPreview } from "../../types";
import { formatTime, buildWebEmbed } from "../../utils/fileHelpers";
import { downloadThumbnail } from "../../utils/ytdlp";

export interface DownloadHeroOptions {
  onUrlChange?: (url: string) => void;
  onEnter?: () => void;
  getEmbedSettings?: () => { width?: string; height?: string };
  getHistoryItems?: () => VideoPreview[];
  onSelectHistoryItem?: (preview: VideoPreview) => void;
  onDirectDownloadHistoryItem?: (preview: VideoPreview) => void;
  onClearHistory?: () => void;
}

export class DownloadHero {
  private containerEl: HTMLElement;
  private bgEl: HTMLElement;
  private contentEl: HTMLElement;
  private inputEl: HTMLInputElement;
  private previewMetaEl: HTMLElement;
  private historyDropdownEl: HTMLElement;
  private historyBtn!: HTMLButtonElement;
  private historyChevronEl!: HTMLElement;
  private isHistoryOpen = false;
  private options: DownloadHeroOptions;

  constructor(parentEl: HTMLElement, options: DownloadHeroOptions = {}) {
    this.options = options;

    this.containerEl = parentEl.createDiv({ cls: "ytec-hero-container" });
    this.bgEl = this.containerEl.createDiv({ cls: "ytec-hero-bg" });
    this.contentEl = this.containerEl.createDiv({ cls: "ytec-hero-content" });

    // 1. URL Input Box (With History button on right)
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

    // History Fetches Dropdown Button
    this.historyBtn = inputWrapper.createEl("button", {
      cls: "ytec-hero-history-btn",
      type: "button",
      title: "Recent Fetches & History (Download without re-fetching)",
    });
    const historyIconSpan = this.historyBtn.createSpan({ cls: "ytec-history-btn-icon" });
    setIcon(historyIconSpan, "history");
    this.historyBtn.createSpan({ text: "Recent", cls: "ytec-history-btn-label" });
    this.historyChevronEl = this.historyBtn.createSpan({ cls: "ytec-history-btn-chevron" });
    setIcon(this.historyChevronEl, "chevron-down");

    this.historyBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.toggleHistoryDropdown();
    });

    // Accordion container positioned directly inside contentEl under the input bar
    this.historyDropdownEl = this.contentEl.createDiv({ cls: "ytec-history-dropdown is-hidden" });

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

  closeHistoryDropdown(): void {
    this.isHistoryOpen = false;
    this.historyDropdownEl.addClass("is-hidden");
    this.historyBtn.removeClass("is-active");
    if (this.historyChevronEl) {
      setIcon(this.historyChevronEl, "chevron-down");
    }
  }

  toggleHistoryDropdown(): void {
    if (this.isHistoryOpen) {
      this.closeHistoryDropdown();
    } else {
      this.renderHistoryDropdown();
      this.isHistoryOpen = true;
      this.historyDropdownEl.removeClass("is-hidden");
      this.historyBtn.addClass("is-active");
      if (this.historyChevronEl) {
        setIcon(this.historyChevronEl, "chevron-up");
      }
    }
  }

  renderHistoryDropdown(): void {
    this.historyDropdownEl.empty();

    const items = this.options.getHistoryItems?.() || [];

    // Header
    const header = this.historyDropdownEl.createDiv({ cls: "ytec-history-dropdown-header" });
    const headerTitle = header.createSpan({ text: `🕒 Recent Fetches (${items.length})` });
    headerTitle.style.fontWeight = "600";

    if (items.length > 0 && this.options.onClearHistory) {
      const clearBtn = header.createEl("button", {
        cls: "ytec-history-clear-btn",
        text: "Clear",
        type: "button",
      });
      clearBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.options.onClearHistory?.();
        this.renderHistoryDropdown();
      });
    }

    // List container
    const listEl = this.historyDropdownEl.createDiv({ cls: "ytec-history-dropdown-list" });

    if (items.length === 0) {
      const emptyEl = listEl.createDiv({ cls: "ytec-history-empty" });
      emptyEl.setText(
        "No recent fetches yet. Fetched videos will appear here so you can download them instantly without re-fetching!"
      );
      return;
    }

    for (const item of items) {
      const row = listEl.createDiv({ cls: "ytec-history-item" });

      // Thumbnail
      const thumbEl = row.createDiv({ cls: "ytec-history-thumb" });
      if (item.thumbnail) {
        const img = thumbEl.createEl("img", {
          attr: { src: item.thumbnail, referrerpolicy: "no-referrer" },
        });
        img.onerror = () => {
          img.style.display = "none";
          setIcon(thumbEl, item.platform === "instagram" ? "camera" : "video");
        };
      } else {
        setIcon(thumbEl, item.platform === "instagram" ? "camera" : "video");
      }

      if (item.duration > 0) {
        thumbEl.createSpan({ cls: "ytec-history-thumb-dur", text: formatTime(item.duration) });
      }

      // Title & sub
      const infoEl = row.createDiv({ cls: "ytec-history-info" });
      const titleEl = infoEl.createSpan({ cls: "ytec-history-title", text: item.title || "Untitled Video" });
      titleEl.title = item.title;

      const subEl = infoEl.createDiv({ cls: "ytec-history-sub" });
      subEl.createSpan({
        text: item.platform === "instagram" ? "📸 Instagram" : "🎬 YouTube",
      });
      if (item.channel) {
        subEl.createSpan({ text: `· ${item.channel}` });
      }

      // Actions
      const actionsEl = row.createDiv({ cls: "ytec-history-actions" });

      const loadBtn = actionsEl.createEl("button", {
        cls: "ytec-history-btn-load",
        text: "⚡ Load",
        title: "Load into form (0s wait, no re-fetch)",
        type: "button",
      });
      loadBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.closeHistoryDropdown();
        this.options.onSelectHistoryItem?.(item);
      });

      const dlBtn = actionsEl.createEl("button", {
        cls: "ytec-history-btn-dl",
        text: "⬇ DL",
        title: "Download immediately without fetch",
        type: "button",
      });
      dlBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.closeHistoryDropdown();
        this.options.onDirectDownloadHistoryItem?.(item);
      });

      // Entire row click defaults to Load
      row.addEventListener("click", () => {
        this.closeHistoryDropdown();
        this.options.onSelectHistoryItem?.(item);
      });
    }
  }

  destroy(): void {
    this.closeHistoryDropdown();
  }
}
