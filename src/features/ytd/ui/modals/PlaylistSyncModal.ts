import { App, Modal, Setting, Notice, setIcon } from "obsidian";
import type PakCLIPlugin from "../../../../main";
import {
  extractPlaylistId,
  fetchRemotePlaylist,
  calculatePlaylistDelta,
  executeFileReorders,
  generateOrUpdatePlaylistNote,
} from "../../utils/playlistSync";
import {
  fetchYouTubeProfilePosts,
  fetchInstagramProfilePosts,
  createProfileMarkdownNote,
} from "../../utils/profileFetcher";
import type { PlaylistDeltaResult, ProfileFetchResult } from "../../types";

export class PlaylistSyncModal extends Modal {
  private plugin: PakCLIPlugin;
  private activeTab: "playlist" | "profile" = "playlist";

  // Playlist State
  private playlistInput = "";
  private playlistTargetFolder = "YT Captures/Playlists";
  private isAnalyzingPlaylist = false;
  private playlistDelta: PlaylistDeltaResult | null = null;
  private autoReorderFiles = true;

  // Profile State
  private profilePlatform: "youtube" | "instagram" = "youtube";
  private profileInput = "";
  private profileLimit = 10;
  private isFetchingProfile = false;
  private profileResult: ProfileFetchResult | null = null;

  constructor(app: App, plugin: PakCLIPlugin) {
    super(app);
    this.plugin = plugin;
    this.playlistTargetFolder = `${this.plugin.settings?.ytCaptureOutputFolder || "YT Captures"}/Playlists`;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("pakcli-playlist-sync-modal");

    this.renderHeader(contentEl);
    this.renderTabs(contentEl);

    const bodyContainer = contentEl.createDiv({ cls: "pakcli-modal-body" });
    if (this.activeTab === "playlist") {
      this.renderPlaylistView(bodyContainer);
    } else {
      this.renderProfileView(bodyContainer);
    }
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }

  private renderHeader(container: HTMLElement): void {
    const header = container.createDiv({ cls: "pakcli-modal-header" });
    const title = header.createEl("h2", { text: "Media Sync & Profile Fetcher" });
    title.style.margin = "0 0 8px 0";

    const desc = header.createEl("p", {
      text: "Smart playlist sync with instant reordering and 0x re-download, plus creator profile post extraction.",
    });
    desc.style.color = "var(--text-muted)";
    desc.style.fontSize = "0.9em";
    desc.style.margin = "0 0 16px 0";
  }

  private renderTabs(container: HTMLElement): void {
    const tabRow = container.createDiv({ cls: "pakcli-tab-nav" });
    tabRow.style.display = "flex";
    tabRow.style.gap = "8px";
    tabRow.style.borderBottom = "1px solid var(--background-modifier-border)";
    tabRow.style.paddingBottom = "8px";
    tabRow.style.marginBottom = "16px";

    const btnPlaylist = tabRow.createEl("button", {
      text: "📺 YouTube Playlist Sync",
      cls: this.activeTab === "playlist" ? "mod-cta" : "",
    });
    btnPlaylist.onclick = () => {
      this.activeTab = "playlist";
      this.onOpen();
    };

    const btnProfile = tabRow.createEl("button", {
      text: "👤 Profile Fetcher (YT / IG)",
      cls: this.activeTab === "profile" ? "mod-cta" : "",
    });
    btnProfile.onclick = () => {
      this.activeTab = "profile";
      this.onOpen();
    };
  }

  // =========================================================================
  // View 1: YouTube Playlist Sync & Reorder Engine
  // =========================================================================
  private renderPlaylistView(container: HTMLElement): void {
    new Setting(container)
      .setName("YouTube Playlist URL or ID")
      .setDesc("Enter playlist URL (e.g. https://www.youtube.com/playlist?list=PL...)")
      .addText((text) => {
        text
          .setPlaceholder("https://www.youtube.com/playlist?list=PL...")
          .setValue(this.playlistInput)
          .onChange((val) => {
            this.playlistInput = val;
          });
        text.inputEl.style.width = "100%";
      });

    new Setting(container)
      .setName("Target Vault Folder")
      .setDesc("Folder where the playlist note and videos are stored")
      .addText((text) => {
        text.setValue(this.playlistTargetFolder).onChange((val) => {
          this.playlistTargetFolder = val;
        });
      });

    new Setting(container)
      .setName("Auto-reorder existing files")
      .setDesc("When videos change positions (e.g. #3 -> #7), instantly rename local files without re-downloading")
      .addToggle((toggle) => {
        toggle.setValue(this.autoReorderFiles).onChange((val) => {
          this.autoReorderFiles = val;
        });
      });

    const actionRow = container.createDiv({ cls: "pakcli-action-row" });
    actionRow.style.margin = "16px 0";
    actionRow.style.display = "flex";
    actionRow.style.gap = "12px";

    const btnAnalyze = actionRow.createEl("button", {
      text: this.isAnalyzingPlaylist ? "Analyzing..." : "🔍 Analyze Playlist",
      cls: "mod-cta",
    });
    btnAnalyze.disabled = this.isAnalyzingPlaylist;
    btnAnalyze.onclick = async () => {
      await this.handleAnalyzePlaylist();
    };

    if (this.playlistDelta) {
      this.renderPlaylistDeltaSummary(container);
    }
  }

  private async handleAnalyzePlaylist(): Promise<void> {
    if (!this.playlistInput.trim()) {
      new Notice("Please enter a YouTube Playlist URL or ID.");
      return;
    }

    const playlistId = extractPlaylistId(this.playlistInput) || this.playlistInput.trim();
    this.isAnalyzingPlaylist = true;
    this.onOpen();

    try {
      new Notice("Fetching remote playlist entries...");
      const remote = await fetchRemotePlaylist(playlistId, this.plugin.settings);

      new Notice("Comparing with vault files...");
      const folder = `${this.playlistTargetFolder}/${remote.playlistTitle}`;
      this.playlistDelta = await calculatePlaylistDelta(this.app, remote.items, remote, folder);

      new Notice(
        `Analysis complete! ${this.playlistDelta.newItems.length} New, ${this.playlistDelta.movedItems.length} Reordered, ${this.playlistDelta.unchangedItems.length} Cached.`
      );
    } catch (err: any) {
      console.error(err);
      new Notice(`Error analyzing playlist: ${err?.message || err}`);
    } finally {
      this.isAnalyzingPlaylist = false;
      this.onOpen();
    }
  }

  private renderPlaylistDeltaSummary(container: HTMLElement): void {
    if (!this.playlistDelta) return;
    const delta = this.playlistDelta;

    const summaryCard = container.createDiv({ cls: "pakcli-delta-summary" });
    summaryCard.style.padding = "16px";
    summaryCard.style.backgroundColor = "var(--background-secondary)";
    summaryCard.style.borderRadius = "8px";
    summaryCard.style.margin = "16px 0";

    summaryCard.createEl("h3", { text: `📺 ${delta.playlistTitle}`, cls: "pakcli-summary-title" });
    summaryCard.createEl("p", {
      text: `Channel: ${delta.channelTitle} • Total Videos: ${delta.totalRemoteCount}`,
    });

    const badgeContainer = summaryCard.createDiv();
    badgeContainer.style.display = "flex";
    badgeContainer.style.gap = "8px";
    badgeContainer.style.margin = "12px 0";

    const createBadge = (text: string, bg: string, color: string) => {
      const b = badgeContainer.createSpan({ text });
      b.style.padding = "4px 8px";
      b.style.borderRadius = "4px";
      b.style.fontSize = "0.85em";
      b.style.fontWeight = "bold";
      b.style.backgroundColor = bg;
      b.style.color = color;
    };

    createBadge(`🆕 ${delta.newItems.length} New`, "var(--color-green)", "#fff");
    createBadge(`🔄 ${delta.movedItems.length} Reordered`, "var(--color-orange)", "#fff");
    createBadge(`⚡ ${delta.unchangedItems.length} Cached`, "var(--background-tertiary)", "var(--text-normal)");

    const btnSyncNow = summaryCard.createEl("button", {
      text: "⚡ Apply Sync & Update Markdown Note",
      cls: "mod-cta",
    });
    btnSyncNow.style.marginTop = "12px";

    btnSyncNow.onclick = async () => {
      btnSyncNow.disabled = true;
      btnSyncNow.setText("Syncing...");

      try {
        const folder = `${this.playlistTargetFolder}/${delta.playlistTitle}`;

        let movedCount = 0;
        if (this.autoReorderFiles && delta.movedItems.length > 0) {
          const reorderResult = await executeFileReorders(this.app, delta, folder);
          movedCount = reorderResult.movedCount;
        }

        const noteFile = await generateOrUpdatePlaylistNote(this.app, delta, folder);

        new Notice(
          `Playlist Synced! Note updated with ${delta.totalRemoteCount} videos. Reordered: ${movedCount} (0 MB download).`
        );
        this.close();

        // Open generated note
        const leaf = this.app.workspace.getLeaf(false);
        await leaf.openFile(noteFile);
      } catch (err: any) {
        new Notice(`Failed to apply sync: ${err?.message || err}`);
      } finally {
        btnSyncNow.disabled = false;
      }
    };
  }

  // =========================================================================
  // View 2: Creator Profile Fetcher (YouTube & Instagram)
  // =========================================================================
  private renderProfileView(container: HTMLElement): void {
    new Setting(container)
      .setName("Platform")
      .setDesc("Choose platform to fetch profile from")
      .addDropdown((drop) => {
        drop
          .addOption("youtube", "YouTube (@channel)")
          .addOption("instagram", "Instagram (@username)")
          .setValue(this.profilePlatform)
          .onChange((val: any) => {
            this.profilePlatform = val;
            this.onOpen();
          });
      });

    new Setting(container)
      .setName("Creator Handle or URL")
      .setDesc(
        this.profilePlatform === "youtube"
          ? "e.g. @veritasium or https://youtube.com/@veritasium"
          : "e.g. @natgeo or https://instagram.com/natgeo"
      )
      .addText((text) => {
        text.setPlaceholder("@handle").setValue(this.profileInput).onChange((val) => {
          this.profileInput = val;
        });
        text.inputEl.style.width = "100%";
      });

    new Setting(container)
      .setName("Max Posts to Fetch")
      .setDesc("Number of latest posts to inspect and preview")
      .addSlider((slider) => {
        slider
          .setLimits(3, 30, 1)
          .setValue(this.profileLimit)
          .setDynamicTooltip()
          .onChange((val) => {
            this.profileLimit = val;
          });
      });

    const actionRow = container.createDiv();
    actionRow.style.margin = "16px 0";

    const btnFetch = actionRow.createEl("button", {
      text: this.isFetchingProfile ? "Fetching..." : "📸 Fetch Latest Posts & Previews",
      cls: "mod-cta",
    });
    btnFetch.disabled = this.isFetchingProfile;
    btnFetch.onclick = async () => {
      await this.handleFetchProfile();
    };

    if (this.profileResult) {
      this.renderProfilePreview(container);
    }
  }

  private async handleFetchProfile(): Promise<void> {
    if (!this.profileInput.trim()) {
      new Notice("Please enter a creator handle or URL.");
      return;
    }

    this.isFetchingProfile = true;
    this.onOpen();

    try {
      new Notice(`Fetching latest posts for ${this.profileInput}...`);
      if (this.profilePlatform === "youtube") {
        this.profileResult = await fetchYouTubeProfilePosts(
          this.profileInput,
          this.profileLimit,
          this.plugin.settings
        );
      } else {
        this.profileResult = await fetchInstagramProfilePosts(
          this.profileInput,
          this.profileLimit,
          this.plugin.settings
        );
      }
      new Notice(`Fetched ${this.profileResult.posts.length} posts with previews!`);
    } catch (err: any) {
      console.error(err);
      new Notice(`Error fetching profile: ${err?.message || err}`);
    } finally {
      this.isFetchingProfile = false;
      this.onOpen();
    }
  }

  private renderProfilePreview(container: HTMLElement): void {
    if (!this.profileResult) return;
    const res = this.profileResult;

    const previewContainer = container.createDiv();
    previewContainer.style.marginTop = "16px";
    previewContainer.style.padding = "16px";
    previewContainer.style.backgroundColor = "var(--background-secondary)";
    previewContainer.style.borderRadius = "8px";

    previewContainer.createEl("h3", { text: `👤 ${res.displayName} (@${res.username})` });
    if (res.bio) {
      previewContainer.createEl("p", { text: res.bio, cls: "pakcli-profile-bio" });
    }

    const grid = previewContainer.createDiv();
    grid.style.display = "grid";
    grid.style.gridTemplateColumns = "repeat(auto-fill, minmax(130px, 1fr))";
    grid.style.gap = "8px";
    grid.style.maxHeight = "240px";
    grid.style.overflowY = "auto";
    grid.style.margin = "12px 0";

    for (const post of res.posts) {
      const card = grid.createDiv();
      card.style.border = "1px solid var(--background-modifier-border)";
      card.style.borderRadius = "6px";
      card.style.overflow = "hidden";

      if (post.thumbnailUrl) {
        const img = card.createEl("img");
        img.src = post.thumbnailUrl;
        img.style.width = "100%";
        img.style.height = "85px";
        img.style.objectFit = "cover";
      }

      const info = card.createDiv();
      info.style.padding = "4px 6px";
      info.style.fontSize = "0.75em";

      const titleP = info.createEl("div", { text: post.title.slice(0, 40) + "..." });
      titleP.style.fontWeight = "bold";
      titleP.style.whiteSpace = "nowrap";
      titleP.style.overflow = "hidden";
      titleP.style.textOverflow = "ellipsis";

      info.createEl("div", {
        text: post.mediaType.toUpperCase(),
        cls: "nav-file-tag",
      });
    }

    const btnSaveNote = previewContainer.createEl("button", {
      text: "💾 Save Profile to Obsidian Note",
      cls: "mod-cta",
    });
    btnSaveNote.style.marginTop = "12px";

    btnSaveNote.onclick = async () => {
      btnSaveNote.disabled = true;
      try {
        const outFolder = `${this.plugin.settings?.ytCaptureOutputFolder || "YT Captures"}/Profiles`;
        const noteFile = await createProfileMarkdownNote(this.app, res, outFolder);
        new Notice(`Saved profile note to ${noteFile.path}!`);
        this.close();

        const leaf = this.app.workspace.getLeaf(false);
        await leaf.openFile(noteFile);
      } catch (err: any) {
        new Notice(`Failed to save note: ${err?.message || err}`);
      } finally {
        btnSaveNote.disabled = false;
      }
    };
  }
}
