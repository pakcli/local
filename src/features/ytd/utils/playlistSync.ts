import { App, TFile, normalizePath } from "obsidian";
import { requestUrl } from "obsidian";
import { PathUtils, getNodeFs } from "../../../utils/nodeHelpers";
import type {
  YTCaptureSettings,
  PlaylistSyncItem,
  PlaylistSyncState,
  PlaylistDeltaResult,
  PlaylistSyncHistoryEntry,
} from "../types";
import { runCommand } from "./process";

/**
 * Extract YouTube playlist ID from standard URL formats or raw ID.
 */
export function extractPlaylistId(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();

  // Match list= parameter
  const match = trimmed.match(/[?&]list=([a-zA-Z0-9_-]+)/);
  if (match) return match[1];

  // Match raw playlist ID (PL, UU, LL, OLAK5uy, etc.)
  if (/^(?:PL|UU|LL|RD|OLAK5uy)[a-zA-Z0-9_-]{10,}$/i.test(trimmed)) {
    return trimmed;
  }

  return null;
}

/**
 * Sanitize filename for cross-platform desktop filesystems.
 */
export function sanitizePlaylistFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

/**
 * Fetch remote playlist structure (Metadata + item list in order).
 * Fast extraction: uses --flat-playlist for sub-second retrieval.
 * Fallback: uses YouTube RSS feed.
 */
export async function fetchRemotePlaylist(
  playlistUrlOrId: string,
  settings: YTCaptureSettings
): Promise<{
  playlistId: string;
  playlistTitle: string;
  channelTitle: string;
  items: PlaylistSyncItem[];
}> {
  const playlistId = extractPlaylistId(playlistUrlOrId) || playlistUrlOrId.trim();
  const playlistUrl = playlistUrlOrId.includes("http")
    ? playlistUrlOrId
    : `https://www.youtube.com/playlist?list=${playlistId}`;

  // 1. Primary: yt-dlp flat-playlist extraction (extremely fast, full details)
  try {
    const rawJson = await runCommand(settings.ytDlpPath || "yt-dlp", [
      "--flat-playlist",
      "--dump-single-json",
      "--no-warnings",
      "--no-colors",
      playlistUrl,
    ]);

    const data = JSON.parse(rawJson);
    const title = data.title || `Playlist ${playlistId}`;
    const channel = data.uploader || data.channel || "YouTube";
    const entries: any[] = Array.isArray(data.entries) ? data.entries : [];

    const items: PlaylistSyncItem[] = entries.map((entry, idx) => {
      const vid = entry.id || "";
      const vTitle = entry.title || `Video ${vid}`;
      const thumb =
        entry.thumbnails?.[entry.thumbnails.length - 1]?.url ||
        entry.thumbnail ||
        `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`;

      return {
        videoId: vid,
        title: vTitle,
        duration: entry.duration || 0,
        thumbnailUrl: thumb,
        originalIndex: idx + 1, // 1-based index
        status: "new",
        uploadDate: entry.upload_date || "",
        url: `https://www.youtube.com/watch?v=${vid}`,
        author: entry.uploader || channel,
      };
    });

    return {
      playlistId,
      playlistTitle: title,
      channelTitle: channel,
      items,
    };
  } catch (err) {
    console.warn("[PlaylistSync] yt-dlp flat extraction failed, trying RSS fallback:", err);
  }

  // 2. Fallback: YouTube RSS feed parsing (Zero-dependency, native Obsidian requestUrl)
  try {
    const rssUrl = `https://www.youtube.com/feeds/videos.xml?playlist_id=${playlistId}`;
    const resp = await requestUrl({ url: rssUrl });
    const parser = new DOMParser();
    const doc = parser.parseFromString(resp.text, "application/xml");

    const playlistTitle = doc.querySelector("feed > title")?.textContent || `Playlist ${playlistId}`;
    const channelTitle = doc.querySelector("feed > author > name")?.textContent || "YouTube";
    const entryEls = Array.from(doc.querySelectorAll("entry"));

    const items: PlaylistSyncItem[] = entryEls.map((el, idx) => {
      const vid = el.querySelector("videoId")?.textContent || "";
      const vTitle = el.querySelector("title")?.textContent || `Video ${vid}`;
      const thumb =
        el.querySelector("thumbnail")?.getAttribute("url") ||
        `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`;
      const pubDate = el.querySelector("published")?.textContent || "";

      return {
        videoId: vid,
        title: vTitle,
        thumbnailUrl: thumb,
        originalIndex: idx + 1,
        status: "new",
        uploadDate: pubDate,
        url: `https://www.youtube.com/watch?v=${vid}`,
        author: channelTitle,
      };
    });

    if (items.length > 0) {
      return {
        playlistId,
        playlistTitle,
        channelTitle,
        items,
      };
    }
  } catch (rssErr) {
    console.error("[PlaylistSync] RSS fallback also failed:", rssErr);
  }

  throw new Error(`Failed to fetch playlist with ID: ${playlistId}. Please verify the playlist URL or your network connection.`);
}

/**
 * Storage helper: Get the ledger path in vault (.pakcli/playlists/<id>.json).
 */
function getPlaylistStatePath(playlistId: string): string {
  return normalizePath(`.pakcli/playlists/${playlistId}.json`);
}

/**
 * Load saved playlist state from local vault ledger.
 */
export async function loadPlaylistState(
  app: App,
  playlistId: string
): Promise<PlaylistSyncState | null> {
  const path = getPlaylistStatePath(playlistId);
  try {
    if (await app.vault.adapter.exists(path)) {
      const raw = await app.vault.adapter.read(path);
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn(`[PlaylistSync] Could not read state for ${playlistId}:`, e);
  }
  return null;
}

/**
 * Save updated playlist state to local vault ledger.
 */
export async function savePlaylistState(
  app: App,
  state: PlaylistSyncState
): Promise<void> {
  const path = getPlaylistStatePath(state.playlistId);
  const dir = PathUtils.dirname(path);

  if (!(await app.vault.adapter.exists(dir))) {
    await app.vault.adapter.mkdir(dir);
  }

  await app.vault.adapter.write(path, JSON.stringify(state, null, 2));
}

/**
 * Calculate Playlist Delta (Diff between remote and local vault state).
 * Deduplication logic:
 * - Identifies existing files by videoId in targetFolder or vault history.
 * - Detects shifted/reordered video index (e.g. #3 -> #7).
 * - Identifies newly added videos.
 */
export async function calculatePlaylistDelta(
  app: App,
  remoteItems: PlaylistSyncItem[],
  playlistInfo: { playlistId: string; playlistTitle: string; channelTitle: string },
  targetFolder: string
): Promise<PlaylistDeltaResult> {
  const previousState = await loadPlaylistState(app, playlistInfo.playlistId);
  const normFolder = normalizePath(targetFolder);

  // Scan files in targetFolder to find existing video files
  const existingFiles = app.vault.getFiles().filter((f) => {
    const parentPath = normalizePath(f.parent?.path || "");
    return parentPath === normFolder || parentPath.startsWith(normFolder + "/");
  });

  // Map videoId to local file
  const videoFileMap = new Map<string, TFile>();
  for (const f of existingFiles) {
    // Check if filename contains [videoId] or match state
    for (const item of remoteItems) {
      if (f.name.includes(item.videoId) || f.basename.includes(item.videoId)) {
        videoFileMap.set(item.videoId, f);
        break;
      }
    }
  }

  const items: PlaylistSyncItem[] = [];
  const newItems: PlaylistSyncItem[] = [];
  const movedItems: PlaylistSyncItem[] = [];
  const unchangedItems: PlaylistSyncItem[] = [];

  for (const remote of remoteItems) {
    const prevItem = previousState?.items[remote.videoId];
    const existingFile = videoFileMap.get(remote.videoId);

    // Try extracting previous index from existing filename or state
    let prevIndex = prevItem?.position;
    if (prevIndex === undefined && existingFile) {
      const idxMatch = existingFile.name.match(/^\[?(\d+)\]?[\s_-]/);
      if (idxMatch) {
        prevIndex = parseInt(idxMatch[1], 10);
      }
    }

    const itemCopy: PlaylistSyncItem = {
      ...remote,
      previousIndex: prevIndex,
      localFilePath: existingFile?.path || prevItem?.localFilePath,
      localThumbnailPath: prevItem?.localThumbnailPath,
    };

    const hasLocalCopy = Boolean(existingFile || prevItem?.localFilePath);

    if (!hasLocalCopy) {
      itemCopy.status = "new";
      newItems.push(itemCopy);
    } else if (prevIndex !== undefined && prevIndex !== remote.originalIndex) {
      itemCopy.status = "existing_moved";
      movedItems.push(itemCopy);
    } else {
      itemCopy.status = "existing_unchanged";
      unchangedItems.push(itemCopy);
    }

    items.push(itemCopy);
  }

  // Detect removed items (was in previous state, but no longer in remote playlist)
  const currentVideoIds = new Set(remoteItems.map((r) => r.videoId));
  const removedItems: PlaylistSyncItem[] = [];
  if (previousState) {
    for (const [vid, entry] of Object.entries(previousState.items)) {
      if (!currentVideoIds.has(vid)) {
        removedItems.push({
          videoId: vid,
          title: entry.title,
          thumbnailUrl: "",
          originalIndex: entry.position,
          previousIndex: entry.position,
          localFilePath: entry.localFilePath,
          localThumbnailPath: entry.localThumbnailPath,
          status: "removed",
          url: `https://www.youtube.com/watch?v=${vid}`,
        });
      }
    }
  }

  return {
    playlistId: playlistInfo.playlistId,
    playlistTitle: playlistInfo.playlistTitle,
    channelTitle: playlistInfo.channelTitle,
    totalRemoteCount: remoteItems.length,
    items,
    newItems,
    movedItems,
    unchangedItems,
    removedItems,
  };
}

/**
 * Reorder existing downloaded files locally when playlist order changes.
 * INSTANT (0 bytes downloaded, uses disk rename).
 */
export async function executeFileReorders(
  app: App,
  delta: PlaylistDeltaResult,
  targetFolder: string
): Promise<{ movedCount: number; errors: string[] }> {
  let movedCount = 0;
  const errors: string[] = [];
  const normFolder = normalizePath(targetFolder);

  for (const item of delta.movedItems) {
    if (!item.localFilePath) continue;

    const file = app.vault.getAbstractFileByPath(item.localFilePath);
    if (!(file instanceof TFile)) continue;

    const ext = file.extension;
    const cleanTitle = sanitizePlaylistFilename(item.title);
    const newPadIndex = String(item.originalIndex).padStart(2, "0");
    const newFilename = `[${newPadIndex}] ${cleanTitle} [${item.videoId}].${ext}`;
    const newPath = normalizePath(PathUtils.join(normFolder, newFilename));

    if (newPath === file.path) continue;

    try {
      await app.fileManager.renameFile(file, newPath);
      item.localFilePath = newPath;
      movedCount++;
    } catch (err: any) {
      errors.push(`Failed to rename ${file.name} to ${newFilename}: ${err?.message || err}`);
    }
  }

  return { movedCount, errors };
}

/**
 * Generate or update the Obsidian Playlist Summary Markdown Note.
 */
export async function generateOrUpdatePlaylistNote(
  app: App,
  delta: PlaylistDeltaResult,
  targetFolder: string
): Promise<TFile> {
  const normFolder = normalizePath(targetFolder);
  if (!(await app.vault.adapter.exists(normFolder))) {
    await app.vault.adapter.mkdir(normFolder);
  }

  const cleanTitle = sanitizePlaylistFilename(delta.playlistTitle);
  const notePath = normalizePath(PathUtils.join(normFolder, `Playlist - ${cleanTitle}.md`));
  const todayStr = new Date().toISOString().split("T")[0];

  let summaryStatus = "Synced";
  if (delta.newItems.length > 0 && delta.movedItems.length > 0) {
    summaryStatus = `${delta.newItems.length} New, ${delta.movedItems.length} Reordered`;
  } else if (delta.newItems.length > 0) {
    summaryStatus = `${delta.newItems.length} New Videos`;
  } else if (delta.movedItems.length > 0) {
    summaryStatus = `${delta.movedItems.length} Videos Reordered`;
  } else {
    summaryStatus = "Up-to-date (No Changes)";
  }

  const frontmatter = [
    "---",
    `playlist_id: "${delta.playlistId}"`,
    `playlist_title: "${delta.playlistTitle.replace(/"/g, '\\"')}"`,
    `channel_title: "${delta.channelTitle.replace(/"/g, '\\"')}"`,
    `last_sync: "${todayStr}"`,
    `total_videos: ${delta.totalRemoteCount}`,
    `sync_status: "${summaryStatus}"`,
    "tags:",
    "  - youtube",
    "  - playlist",
    "  - pakcli",
    "---",
    "",
  ].join("\n");

  const header = [
    `# 📺 ${delta.playlistTitle}`,
    "",
    `> [!INFO] **Playlist Overview**`,
    `> - **Channel**: ${delta.channelTitle}`,
    `> - **Total Videos**: ${delta.totalRemoteCount}`,
    `> - **Last Sync**: ${todayStr} — \`${summaryStatus}\``,
    `> - **Playlist URL**: [Open on YouTube](https://www.youtube.com/playlist?list=${delta.playlistId})`,
    "",
    "---",
    "",
    "## 📋 Videos",
    "",
    "| No | Preview | Title | Duration | Status | Local File |",
    "| :---: | :---: | :--- | :---: | :---: | :--- |",
  ].join("\n");

  const rows = delta.items.map((it) => {
    const padNo = String(it.originalIndex).padStart(2, "0");
    const preview = it.thumbnailUrl ? `<img src="${it.thumbnailUrl}" width="100" />` : "-";
    const titleLink = `[${it.title.replace(/\|/g, "-")}](${it.url})`;

    let durStr = "-";
    if (typeof it.duration === "number" && it.duration > 0) {
      const mins = Math.floor(it.duration / 60);
      const secs = it.duration % 60;
      durStr = `${mins}:${String(secs).padStart(2, "0")}`;
    }

    let statusBadge = "⚡ Cached";
    if (it.status === "new") {
      statusBadge = "🆕 **New**";
    } else if (it.status === "existing_moved") {
      statusBadge = `🔄 Shifted (was #${it.previousIndex})`;
    }

    const localLink = it.localFilePath ? `\`[[${PathUtils.basename(it.localFilePath)}]]\`` : "*Not downloaded*";

    return `| ${padNo} | ${preview} | ${titleLink} | ${durStr} | ${statusBadge} | ${localLink} |`;
  });

  const content = [frontmatter, header, ...rows, ""].join("\n");

  let noteFile = app.vault.getAbstractFileByPath(notePath);
  if (noteFile instanceof TFile) {
    await app.vault.modify(noteFile, content);
  } else {
    noteFile = await app.vault.create(notePath, content);
  }

  // Update State in ledger
  const currentHistory: PlaylistSyncHistoryEntry = {
    date: todayStr,
    count: delta.totalRemoteCount,
    videoIds: delta.items.map((i) => i.videoId),
  };

  const prevState = await loadPlaylistState(app, delta.playlistId);
  const updatedHistory = prevState?.history || [];
  updatedHistory.push(currentHistory);

  const stateItems: PlaylistSyncState["items"] = {};
  for (const it of delta.items) {
    stateItems[it.videoId] = {
      videoId: it.videoId,
      title: it.title,
      position: it.originalIndex,
      localFilePath: it.localFilePath,
      localThumbnailPath: it.localThumbnailPath,
      downloadedAt: it.localFilePath ? (prevState?.items[it.videoId]?.downloadedAt || Date.now()) : 0,
    };
  }

  await savePlaylistState(app, {
    playlistId: delta.playlistId,
    playlistTitle: delta.playlistTitle,
    channelTitle: delta.channelTitle,
    lastSync: Date.now(),
    history: updatedHistory,
    items: stateItems,
  });

  return noteFile as TFile;
}
