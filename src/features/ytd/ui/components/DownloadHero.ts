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
  onSelectPlaylistHistoryItem?: (preview: VideoPreview) => void;
  onDirectDownloadPlaylistHistoryItem?: (preview: VideoPreview) => void;
  initialViewMode?: "grouped" | "flat";
  onViewModeChange?: (mode: "grouped" | "flat") => void;
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
  private historyMode: "grouped" | "flat" = "grouped";
  private options: DownloadHeroOptions;

  constructor(parentEl: HTMLElement, options: DownloadHeroOptions = {}) {
    this.options = options;
    this.historyMode = options.initialViewMode || "grouped";

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

    // View Mode Toggle (Grouped vs Flat)
    const toggleWrap = header.createDiv({ cls: "ytec-history-mode-toggle" });

    const groupedBtn = toggleWrap.createEl("button", {
      cls: `ytec-mode-btn ${this.historyMode === "grouped" ? "is-active" : ""}`,
      text: "📑 Grouped",
      type: "button",
      attr: { title: "Group playlists into expandable accordions (Default)" },
    });
    groupedBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (this.historyMode !== "grouped") {
        this.historyMode = "grouped";
        this.options.onViewModeChange?.("grouped");
        this.renderHistoryDropdown();
      }
    });

    const flatBtn = toggleWrap.createEl("button", {
      cls: `ytec-mode-btn ${this.historyMode === "flat" ? "is-active" : ""}`,
      text: "☰ Flat",
      type: "button",
      attr: { title: "Flat rows without accordion grouping" },
    });
    flatBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (this.historyMode !== "flat") {
        this.historyMode = "flat";
        this.options.onViewModeChange?.("flat");
        this.renderHistoryDropdown();
      }
    });

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

    const isFlatMode = this.historyMode === "flat";

    for (const item of items) {
      if (!isFlatMode && item.is_playlist && item.playlist_items && item.playlist_items.length > 0) {
        // Grouped Accordion for Playlists
        const groupEl = listEl.createDiv({ cls: "ytec-history-group" });
        const groupHeader = groupEl.createDiv({ cls: "ytec-history-group-header" });

        const chevronEl = groupHeader.createSpan({ cls: "ytec-history-group-chevron" });
        setIcon(chevronEl, "chevron-right");

        const thumbEl = groupHeader.createDiv({ cls: "ytec-history-thumb ytec-history-thumb-playlist" });
        if (item.thumbnail) {
          const img = thumbEl.createEl("img", {
            attr: { src: item.thumbnail, referrerpolicy: "no-referrer" },
          });
          img.onerror = () => {
            img.style.display = "none";
            setIcon(thumbEl, "list-video");
          };
        } else {
          setIcon(thumbEl, "list-video");
        }
        thumbEl.createSpan({ cls: "ytec-history-thumb-dur", text: `${item.playlist_items.length} vids` });

        const infoEl = groupHeader.createDiv({ cls: "ytec-history-info" });
        const titleEl = infoEl.createSpan({ cls: "ytec-history-title", text: `📑 ${item.title || "YouTube Playlist"}` });
        titleEl.title = item.title;

        const subEl = infoEl.createDiv({ cls: "ytec-history-sub" });
        subEl.createSpan({ text: `YouTube Playlist · ${item.playlist_items.length} items` });
        if (item.channel) {
          subEl.createSpan({ text: `· ${item.channel}` });
        }

        const actionsEl = groupHeader.createDiv({ cls: "ytec-history-actions" });

        const loadPlaylistBtn = actionsEl.createEl("button", {
          cls: "ytec-history-btn-load",
          text: "⚡ Load All",
          title: "Load entire playlist into queue (0s wait, no re-fetch)",
          type: "button",
        });
        loadPlaylistBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.closeHistoryDropdown();
          this.options.onSelectPlaylistHistoryItem?.(item);
        });

        const dlAllBtn = actionsEl.createEl("button", {
          cls: "ytec-history-btn-dl",
          text: "⬇ DL All",
          title: "Queue all videos in playlist for sequential download",
          type: "button",
        });
        dlAllBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.closeHistoryDropdown();
          this.options.onDirectDownloadPlaylistHistoryItem?.(item);
        });

        const groupBody = groupEl.createDiv({ cls: "ytec-history-group-body is-collapsed" });

        let isGroupOpen = false;
        groupHeader.addEventListener("click", (e) => {
          if ((e.target as HTMLElement).closest(".ytec-history-actions")) return;
          isGroupOpen = !isGroupOpen;
          if (isGroupOpen) {
            groupBody.removeClass("is-collapsed");
            setIcon(chevronEl, "chevron-down");
            groupHeader.addClass("is-expanded");
          } else {
            groupBody.addClass("is-collapsed");
            setIcon(chevronEl, "chevron-right");
            groupHeader.removeClass("is-expanded");
          }
        });

        // Nested child items inside accordion
        for (let i = 0; i < item.playlist_items.length; i++) {
          const child = item.playlist_items[i];
          const childRow = groupBody.createDiv({ cls: "ytec-history-child-item" });

          childRow.createSpan({
            cls: "ytec-history-child-idx",
            text: `#${child.originalIndex || i + 1}`,
          });

          const dur = typeof child.duration === "number" ? child.duration : (parseInt(String(child.duration || 0), 10) || 0);

          const childThumb = childRow.createDiv({ cls: "ytec-history-thumb ytec-history-thumb-sm" });
          if (child.thumbnailUrl) {
            const img = childThumb.createEl("img", {
              attr: { src: child.thumbnailUrl, referrerpolicy: "no-referrer" },
            });
            img.onerror = () => {
              img.style.display = "none";
              setIcon(childThumb, "video");
            };
          } else {
            setIcon(childThumb, "video");
          }

          if (dur > 0) {
            childThumb.createSpan({ cls: "ytec-history-thumb-dur", text: formatTime(dur) });
          }

          const childInfo = childRow.createDiv({ cls: "ytec-history-info" });
          const childTitle = childInfo.createSpan({ cls: "ytec-history-title", text: child.title });
          childTitle.title = child.title;

          const childSub = childInfo.createDiv({ cls: "ytec-history-sub" });
          if (child.author || item.channel) {
            childSub.createSpan({ text: child.author || item.channel || "" });
          }

          const childActions = childRow.createDiv({ cls: "ytec-history-actions" });

          const toChildPreview = (): VideoPreview => ({
            video_id: child.videoId,
            original_url: child.url,
            platform: "youtube",
            title: child.title,
            channel: child.author || item.channel || "",
            channel_url: "",
            thumbnail: child.thumbnailUrl,
            start: 0,
            end: dur,
            duration: dur,
            video_duration: dur,
            has_transcript: false,
            upload_date: child.uploadDate || "",
            view_count: 0,
            tags: [],
            description: "",
            quality: item.quality || "1080p",
            fps: item.fps || "auto",
            media_type: "video",
          });

          const childLoadBtn = childActions.createEl("button", {
            cls: "ytec-history-btn-load",
            text: "⚡ Load",
            title: "Load this video into form",
            type: "button",
          });
          childLoadBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            this.closeHistoryDropdown();
            this.options.onSelectHistoryItem?.(toChildPreview());
          });

          const childDlBtn = childActions.createEl("button", {
            cls: "ytec-history-btn-dl",
            text: "⬇ DL",
            title: "Download this video immediately without fetch",
            type: "button",
          });
          childDlBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            this.closeHistoryDropdown();
            this.options.onDirectDownloadHistoryItem?.(toChildPreview());
          });

          childRow.addEventListener("click", (e) => {
            if ((e.target as HTMLElement).closest(".ytec-history-actions")) return;
            this.closeHistoryDropdown();
            this.options.onSelectHistoryItem?.(toChildPreview());
          });
        }
      } else {
        // Standard single item row (or playlist in flat mode)
        const row = listEl.createDiv({ cls: "ytec-history-item" });

        const thumbEl = row.createDiv({
          cls: `ytec-history-thumb ${item.is_playlist ? "ytec-history-thumb-playlist" : ""}`
        });
        if (item.thumbnail) {
          const img = thumbEl.createEl("img", {
            attr: { src: item.thumbnail, referrerpolicy: "no-referrer" },
          });
          img.onerror = () => {
            img.style.display = "none";
            setIcon(thumbEl, item.is_playlist ? "list-video" : item.platform === "instagram" ? "camera" : "video");
          };
        } else {
          setIcon(thumbEl, item.is_playlist ? "list-video" : item.platform === "instagram" ? "camera" : "video");
        }

        if (item.is_playlist && item.playlist_items) {
          thumbEl.createSpan({ cls: "ytec-history-thumb-dur", text: `${item.playlist_items.length} vids` });
        } else if (item.duration > 0) {
          thumbEl.createSpan({ cls: "ytec-history-thumb-dur", text: formatTime(item.duration) });
        }

        const infoEl = row.createDiv({ cls: "ytec-history-info" });
        const titleText = item.is_playlist
          ? `📑 ${item.title || "YouTube Playlist"} (${item.playlist_items?.length || 0} vids)`
          : item.title || "Untitled Video";
        const titleEl = infoEl.createSpan({ cls: "ytec-history-title", text: titleText });
        titleEl.title = item.title;

        const subEl = infoEl.createDiv({ cls: "ytec-history-sub" });
        if (item.is_playlist) {
          subEl.createSpan({ text: `YouTube Playlist · ${item.playlist_items?.length || 0} items` });
        } else {
          subEl.createSpan({
            text: item.platform === "instagram" ? "📸 Instagram" : "🎬 YouTube",
          });
        }
        if (item.channel) {
          subEl.createSpan({ text: `· ${item.channel}` });
        }

        const actionsEl = row.createDiv({ cls: "ytec-history-actions" });

        const loadBtn = actionsEl.createEl("button", {
          cls: "ytec-history-btn-load",
          text: item.is_playlist ? "⚡ Load All" : "⚡ Load",
          title: item.is_playlist ? "Load playlist queue into review (0s wait)" : "Load into form (0s wait, no re-fetch)",
          type: "button",
        });
        loadBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.closeHistoryDropdown();
          if (item.is_playlist) {
            this.options.onSelectPlaylistHistoryItem?.(item);
          } else {
            this.options.onSelectHistoryItem?.(item);
          }
        });

        const dlBtn = actionsEl.createEl("button", {
          cls: "ytec-history-btn-dl",
          text: item.is_playlist ? "⬇ DL All" : "⬇ DL",
          title: item.is_playlist ? "Download all videos in playlist sequentially" : "Download immediately without fetch",
          type: "button",
        });
        dlBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.closeHistoryDropdown();
          if (item.is_playlist) {
            this.options.onDirectDownloadPlaylistHistoryItem?.(item);
          } else {
            this.options.onDirectDownloadHistoryItem?.(item);
          }
        });

        row.addEventListener("click", (e) => {
          if ((e.target as HTMLElement).closest(".ytec-history-actions")) return;
          this.closeHistoryDropdown();
          if (item.is_playlist) {
            this.options.onSelectPlaylistHistoryItem?.(item);
          } else {
            this.options.onSelectHistoryItem?.(item);
          }
        });
      }
    }
  }

  destroy(): void {
    this.closeHistoryDropdown();
  }
}
