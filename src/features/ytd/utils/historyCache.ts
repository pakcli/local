import { App, TFile } from "obsidian";
import type PakCLIPlugin from "../../../main";

export interface CaptureHistoryItem {
  filePath: string;
  mediaPath?: string;
  thumbnail?: string;
  title: string;
  url: string;
  videoId: string;
  channel: string;
  uploadDate: string;
  capturedAt: string;
  timeRange: string;
  mtime: number;
  platform: "youtube" | "instagram";
  resolution?: string;
}

export interface YTHistoryCache {
  lastScannedAt: number;
  items: Record<string, CaptureHistoryItem>;
}

/**
 * Perform incremental scan of vault output folder for YT Captures.
 * Only parses files that are new or modified since last scan.
 */
export async function getIncrementalCaptureHistory(
  app: App,
  plugin: PakCLIPlugin,
  forceRescan = false
): Promise<CaptureHistoryItem[]> {
  const rawFolder = plugin.settings.ytCaptureOutputFolder || "YT Captures";
  const outputFolderPath = rawFolder.replace(/^[\\/]+|[\\/]+$/g, "");

  if (!plugin.settings.ytHistoryCache || forceRescan) {
    plugin.settings.ytHistoryCache = {
      lastScannedAt: 0,
      items: {},
    };
  }

  const cache = plugin.settings.ytHistoryCache;
  const currentFiles = app.vault.getFiles().filter(
    (f) =>
      (f.path.startsWith(outputFolderPath + "/") || f.path.startsWith(outputFolderPath + "\\")) &&
      f.extension === "md"
  );

  const currentPaths = new Set(currentFiles.map((f) => f.path));
  let cacheModified = false;

  // Clean up cache entries for deleted files
  for (const cachedPath of Object.keys(cache.items)) {
    if (!currentPaths.has(cachedPath)) {
      delete cache.items[cachedPath];
      cacheModified = true;
    }
  }

  // Incrementally scan new or modified files
  for (const file of currentFiles) {
    // Skip index / non-capture files
    if (file.name.toLowerCase() === "index.md") continue;

    const cachedItem = cache.items[file.path];
    if (
      !forceRescan &&
      cachedItem &&
      cachedItem.mtime === file.stat.mtime &&
      cachedItem.platform &&
      cachedItem.title &&
      cachedItem.title !== "Untitled Video" &&
      cachedItem.title !== file.basename
    ) {
      // Unchanged valid item — skip re-reading
      continue;
    }

    try {
      // 1. Read metadata (use Obsidian's metadata cache if available, fallback to file content)
      let parsed: Record<string, any> = {};
      const fileCache = app.metadataCache.getFileCache(file);
      if (fileCache?.frontmatter) {
        parsed = { ...fileCache.frontmatter };
      } else {
        const content = await app.vault.read(file);
        parsed = parseYamlFrontmatter(content);
      }

      // If note has no url or title or video_id, it's not a YT capture note (e.g. Untitled.md scratchpad)
      const rawUrl = String(parsed.yt_url || parsed.url || "");
      if (!rawUrl && !parsed.video_id && !file.basename.startsWith("yt_")) {
        continue;
      }

      const isIg =
        rawUrl.includes("instagram.com") ||
        rawUrl.includes("instagr.am") ||
        parsed.platform === "instagram";

      // 2. Clean title
      let title = String(parsed.title || parsed.yt_title || "").trim();
      if (!title) {
        title = file.basename
          .replace(/^yt_/i, "")
          .replace(/_(4k|2k|1080p|720p|480p|360p|240p|144p|audio).*$/i, "")
          .trim();
      }
      if (!title) title = file.basename;

      // 3. Resolution
      let resolution = String(parsed.quality || parsed.resolution || "").trim();
      if (!resolution) {
        const resMatch = file.basename.match(/_(4k|2k|1080p|720p|480p|360p|240p|144p|audio)/i);
        if (resMatch) resolution = resMatch[1].toLowerCase();
      }
      if (!resolution && parsed.clip_file) {
        const clipMatch = String(parsed.clip_file).match(/_(4k|2k|1080p|720p|480p|360p|240p|144p|audio)/i);
        if (clipMatch) resolution = clipMatch[1].toLowerCase();
      }
      if (!resolution && file.name.toLowerCase().includes("audio")) {
        resolution = "audio";
      }

      // 4. Media file path
      const baseWithoutExt = file.path.slice(0, -3);
      const possibleExtensions = [".mp4", ".mp3", ".m4a", ".webm", ".zip"];
      let mediaPath = "";
      if (parsed.clip_file) {
        const directFile = app.vault.getAbstractFileByPath(`${outputFolderPath}/${parsed.clip_file}`);
        if (directFile instanceof TFile) mediaPath = directFile.path;
      }
      if (!mediaPath) {
        for (const ext of possibleExtensions) {
          if (app.vault.getAbstractFileByPath(baseWithoutExt + ext)) {
            mediaPath = baseWithoutExt + ext;
            break;
          }
        }
      }

      // 5. Thumbnail resolution
      let thumbnail = "";
      if (parsed.thumbnail || parsed.yt_thumbnail) {
        const thumbRef = String(parsed.thumbnail || parsed.yt_thumbnail).trim();
        if (thumbRef.startsWith("http://") || thumbRef.startsWith("https://")) {
          thumbnail = thumbRef;
        } else {
          const directThumb =
            app.vault.getAbstractFileByPath(thumbRef.includes("/") ? thumbRef : `${outputFolderPath}/${thumbRef}`) ||
            app.metadataCache.getFirstLinkpathDest(thumbRef, file.path);
          if (directThumb instanceof TFile) {
            thumbnail = app.vault.getResourcePath(directThumb);
          }
        }
      }
      if (!thumbnail) {
        for (const imgExt of [".jpg", ".jpeg", ".png", ".webp"]) {
          const tFile = app.vault.getAbstractFileByPath(baseWithoutExt + imgExt);
          if (tFile instanceof TFile) {
            thumbnail = app.vault.getResourcePath(tFile);
            break;
          }
        }
      }

      // 6. Time Range
      let timeRange = String(parsed.capture_time_range || parsed.time_range || "").trim();
      if (!timeRange && (parsed.clip_start || parsed.clip_end)) {
        timeRange = `${parsed.clip_start || "0:00"} → ${parsed.clip_end || "End"}`;
      }
      if (!timeRange) {
        timeRange = "Full";
      }

      cache.items[file.path] = {
        filePath: file.path,
        mediaPath,
        thumbnail,
        title,
        url: rawUrl,
        videoId: String(parsed.video_id || ""),
        channel: String(parsed.yt_channel || parsed.channel || parsed.uploader || ""),
        uploadDate: String(parsed.yt_upload_date || parsed.upload_date || ""),
        capturedAt: String(parsed.captured_at || new Date(file.stat.ctime).toISOString()),
        timeRange,
        mtime: file.stat.mtime,
        platform: isIg ? "instagram" : "youtube",
        resolution: resolution || "1080p",
      };
      cacheModified = true;
    } catch {
      // Skip invalid file
    }
  }

  cache.lastScannedAt = Date.now();

  if (cacheModified) {
    await plugin.saveSettings();
  }

  // Return items sorted by mtime descending (newest first!)
  return Object.values(cache.items).sort((a, b) => b.mtime - a.mtime);
}

/** Lightweight YAML frontmatter parser using regex line extraction */
function parseYamlFrontmatter(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!content.startsWith("---")) return result;

  const endIdx = content.indexOf("\n---", 3);
  if (endIdx === -1) return result;

  const yamlBlock = content.slice(3, endIdx);
  const lines = yamlBlock.split(/\r?\n/);

  for (const line of lines) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).trim();
    let val = line.slice(colonIdx + 1).trim();

    // Strip surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }

    if (key) {
      result[key] = val;
    }
  }

  return result;
}
