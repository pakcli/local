/**
 * InfoModal — "How YT Downloader Works" popup dialog
 * Explains architecture, smart fallback vs force upscale, and related GitHub repositories.
 */
import { App, Modal, setIcon } from "obsidian";
import type PakCLIPlugin from "../../../main";
import { runCommand } from "../utils/process";

export class InfoModal extends Modal {
  private plugin: PakCLIPlugin;

  constructor(app: App, plugin: PakCLIPlugin) {
    super(app);
    this.plugin = plugin;
    this.modalEl.addClass("ytec-modal");
    this.modalEl.addClass("ytec-info-modal");
  }

  onOpen(): void {
    this.render();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();

    // 1. Header
    const hdr = contentEl.createDiv({ cls: "ytec-header" });
    const logoEl = hdr.createDiv({ cls: "ytec-logo" });
    setIcon(logoEl, "info");
    hdr.createEl("h2", { cls: "ytec-title", text: "How YT Downloader Works" });
    hdr.createEl("p", {
      cls: "ytec-subtitle",
      text: "Understanding the stream extraction pipeline, resolution fallback, and dependencies.",
    });

    const body = contentEl.createDiv({ cls: "ytec-info-body" });

    // 2. Feature Cards
    // Card 1: Core Engine Pipeline
    const card1 = body.createDiv({ cls: "ytec-info-card" });
    const c1Header = card1.createDiv({ cls: "ytec-info-card-header" });
    const c1Icon = c1Header.createSpan({ cls: "ytec-info-icon" });
    setIcon(c1Icon, "layers");
    c1Header.createEl("h3", { text: "1. DASH Stream Extraction & Remuxing" });
    card1.createEl("p", {
      text: "YouTube stores high-resolution videos (1080p, 1440p, 4K) as separate video and audio streams (DASH). yt-dlp downloads the highest quality video and audio streams simultaneously, and FFmpeg automatically remuxes them into a single, clean MP4 container without re-encoding loss.",
    });

    // Card 2: Smart Resolution Fallback vs Force
    const card2 = body.createDiv({ cls: "ytec-info-card" });
    const c2Header = card2.createDiv({ cls: "ytec-info-card-header" });
    const c2Icon = c2Header.createSpan({ cls: "ytec-info-icon" });
    setIcon(c2Icon, "sliders");
    c2Header.createEl("h3", { text: "2. Auto Fallback vs. ⚡ Force Resolution" });
    
    const fallbackBox = card2.createDiv({ cls: "ytec-info-subbox" });
    fallbackBox.createEl("strong", { text: "• Force: OFF (Smart Auto-Fallback)" });
    fallbackBox.createEl("p", {
      text: "If you ask for 1080p but the YouTube video is only available up to 720p (or 480p), the downloader automatically adapts to the highest available quality without throwing an error. The output filename and metadata will accurately reflect the true resolution (e.g. _720p_).",
    });

    const forceBox = card2.createDiv({ cls: "ytec-info-subbox" });
    forceBox.createEl("strong", { text: "• ⚡ Force: ON (Resolution Upscaler)" });
    forceBox.createEl("p", {
      text: "If you request 1080p and the source is only 720p, the plugin will download the best available source and immediately trigger FFmpeg's Lanczos scaling filter (scale=-2:1080). The physical video file properties in Windows Explorer will be exactly 1920x1080 as requested.",
    });

    // Card 3: Official Repositories
    const card3 = body.createDiv({ cls: "ytec-info-card" });
    const c3Header = card3.createDiv({ cls: "ytec-info-card-header" });
    const c3Icon = c3Header.createSpan({ cls: "ytec-info-icon" });
    setIcon(c3Icon, "github");
    c3Header.createEl("h3", { text: "3. Related GitHub Repositories" });

    const linksList = card3.createEl("ul", { cls: "ytec-info-links" });

    const createRepoLink = (label: string, url: string, desc: string) => {
      const li = linksList.createEl("li");
      const a = li.createEl("a", {
        href: url,
        text: label,
        cls: "ytec-repo-link",
      });
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noopener noreferrer");
      li.createSpan({ text: ` — ${desc}`, cls: "ytec-repo-desc" });
    };

    createRepoLink("yt-dlp / yt-dlp", "https://github.com/yt-dlp/yt-dlp", "CLI program to download videos from YouTube and hundreds of other sites.");
    createRepoLink("FFmpeg Official", "https://ffmpeg.org", "Universal multimedia solution to record, convert, upscale and stream audio and video.");
    createRepoLink("ffbinaries-prebuilt", "https://github.com/ffbinaries/ffbinaries-prebuilt", "Automated cross-platform precompiled FFmpeg binary builds.");
    createRepoLink("PakCLI Suite", "https://github.com/", "The Obsidian workflow and multi-tool suite plugin.");

    // Card 4: Current System Binary Status
    const card4 = body.createDiv({ cls: "ytec-info-card" });
    const c4Header = card4.createDiv({ cls: "ytec-info-card-header" });
    const c4Icon = c4Header.createSpan({ cls: "ytec-info-icon" });
    setIcon(c4Icon, "terminal");
    c4Header.createEl("h3", { text: "4. System Dependencies & Environment" });

    const statusEl = card4.createDiv({ cls: "ytec-info-status" });
    statusEl.createEl("p", { text: `yt-dlp binary: ${this.plugin.settings.ytDlpPath || "yt-dlp"}` });
    statusEl.createEl("p", { text: `ffmpeg binary: ${this.plugin.settings.ffmpegPath || "ffmpeg"}` });

    const checkBtn = card4.createEl("button", {
      cls: "ytec-btn ytec-btn-info-check",
      text: "Verify yt-dlp Version",
      type: "button",
    });
    const verResultEl = card4.createDiv({ cls: "ytec-info-ver-result" });

    checkBtn.addEventListener("click", () => {
      checkBtn.disabled = true;
      verResultEl.setText("Checking version...");
      void (async () => {
        try {
          const v = await runCommand(this.plugin.settings.ytDlpPath || "yt-dlp", ["--version"]);
          verResultEl.setText(`✓ yt-dlp is active: v${v.trim()}`);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : typeof err === "string" ? err : JSON.stringify(err);
          verResultEl.setText(`✗ Error: ${msg}`);
        } finally {
          checkBtn.disabled = false;
        }
      })();
    });

    // 3. Footer with Close Button
    const footer = contentEl.createDiv({ cls: "ytec-modal-footer" });
    const closeBtn = footer.createEl("button", {
      cls: "ytec-btn mod-cta",
      text: "Got It",
      type: "button",
    });
    closeBtn.addEventListener("click", () => this.close());
  }
}
