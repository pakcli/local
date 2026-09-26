<<<<<<< HEAD
import { App, TFile } from "obsidian";
=======
import { App, TFile, normalizePath } from "obsidian";
>>>>>>> feat/stable-features-step-by-step
import type PakCLIPlugin from "../../../main";

export interface CaptureHistoryItem {
  filePath: string;
  mediaPath?: string;
  thumbnail?: string;
<<<<<<< HEAD
=======
  thumbnailPath?: string;
>>>>>>> feat/stable-features-step-by-step
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
      (normalizePath(f.path).startsWith(outputFolderPath + "/") || normalizePath(f.path).startsWith(outputFolderPath + "\\")) &&
      f.extension === "md"
  );

  const currentPaths = new Set(currentFiles.map((f) => f.path));
  let cacheModified = false;

  // Clean up cache entries for deleted files or scratch non-capture notes
  for (const cachedPath of Object.keys(cache.items)) {
    const lower = cachedPath.toLowerCase();
    if (!currentPaths.has(cachedPath) || lower.endsWith("index.md") || lower.endsWith("untitled.md")) {
      delete cache.items[cachedPath];
      cacheModified = true;
    }
  }

  // Pre-index folder image files for fast and reliable thumbnail fallback matching
  const folderImageFiles = app.vault.getFiles().filter(
    (f) =>
      normalizePath(f.path).startsWith(outputFolderPath + "/") &&
      [".jpg", ".jpeg", ".png", ".webp"].includes("." + f.extension.toLowerCase())
  );

  // Incrementally scan new or modified files
  for (const file of currentFiles) {
    // Skip index / scratchpad non-capture files
    const lowerName = file.name.toLowerCase();
    if (lowerName === "index.md" || lowerName === "untitled.md") continue;

    const cachedItem = cache.items[file.path];
<<<<<<< HEAD
    if (cachedItem && cachedItem.mtime === file.stat.mtime && cachedItem.platform && cachedItem.thumbnail !== undefined) {
      // Unchanged file — skip reading/parsing!
=======
    if (
      !forceRescan &&
      cachedItem &&
      cachedItem.mtime === file.stat.mtime &&
      cachedItem.platform &&
      cachedItem.thumbnail &&
      cachedItem.title &&
      cachedItem.title !== "Untitled Video" &&
      cachedItem.title !== file.basename
    ) {
      // Unchanged valid item with thumbnail — skip re-reading
>>>>>>> feat/stable-features-step-by-step
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

      // If note has no url or title or video_id, it's not a YT capture note (e.g. scratchpads)
      const rawUrl = String(parsed.yt_url || parsed.url || "");
      if (!rawUrl && !parsed.video_id && !parsed.clip_file && !file.basename.startsWith("yt_")) {
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
      const rawClip = parsed.clip_file;
      let cleanClip = "";
      if (rawClip) {
        cleanClip = String(rawClip).trim().replace(/^\[\[/, "").replace(/\]\]$/, "").replace(/^['"]+|['"]+$/g, "").trim();
      }
      if (cleanClip) {
        const directFile =
          app.vault.getAbstractFileByPath(normalizePath(`${outputFolderPath}/${cleanClip}`)) ||
          app.metadataCache.getFirstLinkpathDest(cleanClip, file.path);
        if (directFile instanceof TFile) mediaPath = directFile.path;
      }
      if (!mediaPath) {
        for (const ext of possibleExtensions) {
          const candidate = app.vault.getAbstractFileByPath(normalizePath(baseWithoutExt + ext));
          if (candidate instanceof TFile) {
            mediaPath = candidate.path;
            break;
          }
        }
      }

<<<<<<< HEAD
      const thumbFile = app.vault.getAbstractFileByPath(baseWithoutExt + ".jpg");
      let thumbnail = "";
      if (thumbFile instanceof TFile) {
        thumbnail = app.vault.getResourcePath(thumbFile);
      } else if (typeof parsed.yt_thumbnail === "string" && parsed.yt_thumbnail.startsWith("http")) {
        thumbnail = parsed.yt_thumbnail;
      } else if (typeof parsed.thumbnail === "string" && parsed.thumbnail.startsWith("http")) {
        thumbnail = parsed.thumbnail;
=======
      // 5. Thumbnail resolution (stores both direct resource URI and permanent vault path)
      let thumbnail = "";
      let thumbnailPath = "";
      const rawThumb = parsed.thumbnail || parsed.yt_thumbnail;

      if (rawThumb) {
        let thumbRef = String(rawThumb).trim();
        thumbRef = thumbRef.replace(/^\[\[/, "").replace(/\]\]$/, "").replace(/^['"]+|['"]+$/g, "").trim();

        if (thumbRef.startsWith("http://") || thumbRef.startsWith("https://")) {
          thumbnail = thumbRef;
        } else {
          const cleanRef = thumbRef.replace(/^[\\/]+/, "");
          const candidatePath = normalizePath(cleanRef.includes("/") ? cleanRef : `${outputFolderPath}/${cleanRef}`);
          const directThumb =
            app.vault.getAbstractFileByPath(candidatePath) ||
            app.metadataCache.getFirstLinkpathDest(cleanRef, file.path);
          if (directThumb instanceof TFile) {
            thumbnailPath = directThumb.path;
            thumbnail = app.vault.getResourcePath(directThumb);
          }
        }

        // Auto-upgrade plain word thumbnail/clip_file in note frontmatter to linked [[file]]
        if (typeof rawThumb === "string" && !rawThumb.startsWith("[[") && !rawThumb.startsWith("http")) {
          try {
            void app.fileManager.processFrontMatter(file, (fm) => {
              if (fm.thumbnail && typeof fm.thumbnail === "string" && !fm.thumbnail.startsWith("[[") && !fm.thumbnail.startsWith("http")) {
                fm.thumbnail = `[[${fm.thumbnail}]]`;
              }
              if (fm.yt_thumbnail && typeof fm.yt_thumbnail === "string" && !fm.yt_thumbnail.startsWith("[[") && !fm.yt_thumbnail.startsWith("http")) {
                fm.yt_thumbnail = `[[${fm.yt_thumbnail}]]`;
              }
              if (fm.clip_file && typeof fm.clip_file === "string" && !fm.clip_file.startsWith("[[")) {
                fm.clip_file = `[[${fm.clip_file}]]`;
              }
            });
          } catch {}
        }
      }

      // Fallback A: same base filename with image extensions
      if (!thumbnail) {
        for (const imgExt of [".jpg", ".jpeg", ".png", ".webp"]) {
          const candidatePath = normalizePath(baseWithoutExt + imgExt);
          const tFile = app.vault.getAbstractFileByPath(candidatePath);
          if (tFile instanceof TFile) {
            thumbnailPath = tFile.path;
            thumbnail = app.vault.getResourcePath(tFile);
            break;
          }
        }
      }

      // Fallback B: search folder image files for matching basename or video_id
      if (!thumbnail && folderImageFiles.length > 0) {
        const match = folderImageFiles.find((f) => {
          return (
            f.basename === file.basename ||
            (parsed.video_id && f.basename.includes(parsed.video_id)) ||
            (file.basename.length > 12 && f.basename.startsWith(file.basename.slice(0, 12)))
          );
        });
        if (match instanceof TFile) {
          thumbnailPath = match.path;
          thumbnail = app.vault.getResourcePath(match);
        }
      }

      // 6. Time Range
      let timeRange = String(parsed.capture_time_range || parsed.time_range || "").trim();
      if (!timeRange && (parsed.clip_start || parsed.clip_end)) {
        timeRange = `${parsed.clip_start || "0:00"} → ${parsed.clip_end || "End"}`;
      }
      if (!timeRange) {
        timeRange = "Full";
>>>>>>> feat/stable-features-step-by-step
      }

      cache.items[file.path] = {
        filePath: file.path,
        mediaPath,
        thumbnail,
<<<<<<< HEAD
        title: parsed.yt_title || parsed.title || file.basename,
=======
        thumbnailPath,
        title,
>>>>>>> feat/stable-features-step-by-step
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

  // Return items sorted by mtime descending (newest first!), excluding non-video notes
  return Object.values(cache.items)
    .filter((it) => {
      const p = it.filePath.toLowerCase();
      const t = it.title.toLowerCase();
      return (
        !p.endsWith("index.md") &&
        !p.endsWith("untitled.md") &&
        t !== "untitled" &&
        t !== "yt captures" &&
        Boolean(it.url || it.videoId)
      );
    })
    .sort((a, b) => b.mtime - a.mtime);
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
