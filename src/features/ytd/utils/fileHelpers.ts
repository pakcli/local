/** File helper utilities */

/**
 * Sanitize title for filenames and Obsidian notes.
 * - Keeps original spaces as spaces ("keep them spasi, no need extra -").
 * - Strips characters illegal on Windows filesystem (/ \ : * ? " < > |) and Obsidian Wikilinks (# ^ [ ]).
 * - Collapses multiple spaces/tabs into a single space.
 * - Truncates to maxLen (default 20 characters) including spaces and underscores.
 * - Trims leading/trailing whitespace and trailing dots.
 */
export function sanitizeFilename(name: string, maxLen: number = 20): string {
  if (!name) return "media";

  let clean = name
    // Strip illegal filesystem and Obsidian Wikilink characters
    .replace(/[/\\:*?"<>|#^[\]]/g, "")
    // Collapse newlines, tabs, and multiple spaces into a single space
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Enforce maximum length limit (default 20 characters)
  if (maxLen > 0 && clean.length > maxLen) {
    clean = clean.slice(0, maxLen);
  }

  // Remove trailing dots, hyphens, or spaces that could be problematic on Windows
  clean = clean.replace(/[. ]+$/, "").trim();

  return clean || "media";
}

export function formatTime(seconds: number | undefined): string {
  if (!seconds) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function parseTimeInput(input: string): number {
  const parts = input.trim().split(":").map(Number);
  if (parts.some(isNaN)) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 1) return parts[0];
  return 0;
}

/**
 * Extract total duration in seconds from any yt-dlp metadata object.
 * Handles duration number, video_duration, duration_string ("3:14"), or format streams.
 */
export function extractVideoDuration(info: any): number {
  if (!info) return 0;
  if (typeof info.duration === "number" && !isNaN(info.duration) && info.duration > 0) {
    return Math.round(info.duration);
  }
  if (typeof info.video_duration === "number" && !isNaN(info.video_duration) && info.video_duration > 0) {
    return Math.round(info.video_duration);
  }
  if (typeof info.duration === "string") {
    const parsed = parseTimeInput(info.duration);
    if (parsed > 0) return parsed;
    const num = parseFloat(info.duration);
    if (!isNaN(num) && num > 0) return Math.round(num);
  }
  if (typeof info.duration_string === "string") {
    const parsed = parseTimeInput(info.duration_string);
    if (parsed > 0) return parsed;
  }
  if (Array.isArray(info.formats)) {
    for (const f of info.formats) {
      if (typeof f?.duration === "number" && f.duration > 0) {
        return Math.round(f.duration);
      }
    }
  }
  return 0;
}

/**
 * Format timestamp into dd-hh-mm-ss-ss (day-jam-minute-second-frame)
 */
export function formatDetailedTimestamp(seconds: number): string {
  const total = Math.max(0, seconds || 0);
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  const f = Math.floor((total % 1) * 100);

  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d)}-${pad(h)}-${pad(m)}-${pad(s)}-${pad(f)}`;
}

/**
 * Format date and time stamp using hyphens: YYYY-MM-DD and HH-mm-ss
 */
export function formatDateTimeStamp(d: Date = new Date()): {
  dateStr: string;
  timeStr: string;
  dateTimeStr: string;
} {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");

  const dateStr = `${yyyy}-${mm}-${dd}`;
  const timeStr = `${hh}-${min}-${ss}`;
  const dateTimeStr = `${dateStr}_${timeStr}`;

  return { dateStr, timeStr, dateTimeStr };
}

/**
 * Sanitize channel or author name for filename components.
 * Strips special chars and replaces spaces with hyphens.
 */
export function sanitizeChannelName(name?: string, defaultPrefix: string = "channel"): string {
  if (!name) return defaultPrefix;
  let clean = name
    .replace(/[/\\:*?"<>|#^[\]@]/g, "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
  if (clean.length > 20) {
    clean = clean.slice(0, 20);
  }
  clean = clean.replace(/[-_.]+$/, "").trim();
  return clean || defaultPrefix;
}

/**
 * Sanitize title for filename components:
 * Strips special chars, converts spaces to hyphens to maintain clear separation
 * between underscore-delimited metadata fields, and limits to maxLen (default 15 characters).
 */
export function sanitizeTitlePart(name: string, maxLen: number = 15): string {
  if (!name) return "post";
  let clean = name
    .replace(/[/\\:*?"<>|#^[\]]/g, "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
  if (maxLen > 0 && clean.length > maxLen) {
    clean = clean.slice(0, maxLen);
  }
  clean = clean.replace(/[-_.]+$/, "").trim();
  return clean || "post";
}

export interface BuildMediaBaseNameOptions {
  title: string;
  channel?: string;
  startSec?: number;
  endSec?: number;
  quality?: string;
  fps?: string;
  platform?: "youtube" | "instagram" | string;
  date?: Date;
  maxTitleLen?: number;
  mediaType?: "video" | "image";
  slideIndex?: number;
}

/**
 * Build structured filename base following pattern:
 * {channel/profile}_{title/first15letters}_{date(YYYY-MM-DD)}_{time(HH-mm-ss)}_s{XX}_{format(mp3/mp4/jpg)}_{quality}
 *
 * Suffixes:
 * - Description/Markdown Note: s00 (e.g. ..._s00_note.md) — always sorts at top in Obsidian!
 * - Media assets / Slides: s01, s02, etc. (e.g. ..._s01_jpg_1080p.jpg, ..._s01_mp4_1080p.mp4)
 * - Video Thumbnail: s01_thumb (e.g. ..._s01_thumb.jpg)
 */
export function buildMediaBaseName(
  titleOrOpts: string | BuildMediaBaseNameOptions,
  startSec?: number,
  endSec?: number,
  quality: string = "best",
  fps: string = "auto",
  platform: "youtube" | "instagram" | string = "youtube",
  date: Date = new Date(),
  maxTitleLen: number = 15,
  mediaType: "video" | "image" = "video",
  channel?: string,
  slideIndex: number = 1
): {
  baseName: string;
  noteBaseName: string;
  thumbBaseName: string;
  formatExt: "mp4" | "mp3" | "jpg";
  resolution: string;
  prefix: string;
  cleanTitle: string;
  cleanChannel: string;
  dateTimeStr: string;
  slideTag: string;
  noteSlideTag: string;
} {
  let opts: BuildMediaBaseNameOptions;
  if (typeof titleOrOpts === "object" && titleOrOpts !== null) {
    opts = titleOrOpts;
  } else {
    opts = {
      title: typeof titleOrOpts === "string" ? titleOrOpts : "",
      startSec,
      endSec,
      quality,
      fps,
      platform,
      date,
      maxTitleLen,
      mediaType,
      channel,
      slideIndex,
    };
  }

  const resolvedDate = opts.date || new Date();
  const { dateStr, timeStr, dateTimeStr } = formatDateTimeStamp(resolvedDate);

  const isIg = opts.platform === "instagram" || String(opts.platform).toLowerCase().includes("instagram");
  const fallbackPlatform = isIg ? "instagram" : "youtube";
  const cleanChannel = sanitizeChannelName(opts.channel, fallbackPlatform);

  const titleLength = typeof opts.maxTitleLen === "number" && opts.maxTitleLen > 0 ? opts.maxTitleLen : 15;
  const cleanTitle = sanitizeTitlePart(opts.title || "", titleLength);

  const isImage = opts.mediaType === "image";
  const isAudio = opts.quality === "audio";
  const formatExt: "mp4" | "mp3" | "jpg" = isImage ? "jpg" : isAudio ? "mp3" : "mp4";

  // Normalize quality representation in filename (e.g. 1080p, 4k, 720p, 144p, audio, best)
  let cleanQuality = "best";
  if (isAudio) {
    cleanQuality = "audio";
  } else if (opts.quality && opts.quality !== "best") {
    cleanQuality = opts.quality.toLowerCase();
  } else if (isImage) {
    cleanQuality = "original";
  } else {
    cleanQuality = "1080p";
  }

  const sIndex = Math.max(1, opts.slideIndex || 1);
  const slideTag = `s${String(sIndex).padStart(2, "0")}`;
  const noteSlideTag = "s00";

  // Structured filenames:
  // Note:    {channel}_{title15}_{YYYY-MM-DD}_{HH-mm-ss}_s00_note
  // Media:   {channel}_{title15}_{YYYY-MM-DD}_{HH-mm-ss}_s01_{format}_{quality}
  // Thumb:   {channel}_{title15}_{YYYY-MM-DD}_{HH-mm-ss}_s01_thumb
  const noteBaseName = `${cleanChannel}_${cleanTitle}_${dateStr}_${timeStr}_${noteSlideTag}_note`;
  const baseName = `${cleanChannel}_${cleanTitle}_${dateStr}_${timeStr}_${slideTag}_${formatExt}_${cleanQuality}`;
  const thumbBaseName = `${cleanChannel}_${cleanTitle}_${dateStr}_${timeStr}_${slideTag}_thumb`;

  return {
    baseName,
    noteBaseName,
    thumbBaseName,
    formatExt,
    resolution: cleanQuality,
    prefix: cleanChannel,
    cleanTitle,
    cleanChannel,
    dateTimeStr,
    slideTag,
    noteSlideTag,
  };
}

export interface WebEmbedInfo {
  platform: "youtube" | "instagram";
  embedUrl: string;
  iframeHtml: string;
  markdownEmbed: string;
}

export function buildWebEmbed(
  platformInput?: string,
  videoId?: string,
  rawUrl?: string,
  clipStart = 0,
  title = "Video player",
  width = "100%",
  height = "520"
): WebEmbedInfo {
  const url = rawUrl || "";
  const isInstagram =
    platformInput === "instagram" ||
    url.includes("instagram.com") ||
    url.includes("instagr.am");
  const id = videoId || "";

  if (isInstagram) {
    let embedUrl = `https://www.instagram.com/reel/${id}/embed/`;
    if (url.includes("/p/")) {
      embedUrl = `https://www.instagram.com/p/${id}/embed/`;
    } else if (url.includes("/tv/")) {
      embedUrl = `https://www.instagram.com/tv/${id}/embed/`;
    }

    const iframeHtml = `<iframe width="${width}" height="${height}" src="${embedUrl}" frameborder="0" scrolling="no" allowtransparency="true"></iframe>`;
    const markdownEmbed = `[📸 View on Instagram](${url || `https://www.instagram.com/reel/${id}/`})`;

    return {
      platform: "instagram",
      embedUrl,
      iframeHtml,
      markdownEmbed,
    };
  }

  // YouTube
  const startSec = Math.floor(clipStart);
  const startQuery = startSec > 0 ? `?start=${startSec}` : "";
  const embedUrl = `https://www.youtube-nocookie.com/embed/${id}${startQuery}`;
  const iframeHtml = `<iframe width="${width}" height="${height}" src="${embedUrl}" title="${title.replace(/"/g, "&quot;")}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>`;
  const markdownEmbed = `![](https://www.youtube.com/watch?v=${id})`;

  return {
    platform: "youtube",
    embedUrl,
    iframeHtml,
    markdownEmbed,
  };
}

export interface NoteParams {
  title: string;
  url: string;
  videoId: string;
  platform?: "youtube" | "instagram" | string;
  mediaType?: "video" | "image";
  channel: string;
  channelUrl: string;
  uploadDate: string;
  videoDuration: number;
  capturedAt: string;
  clipStart: number;
  clipEnd: number;
  clipDuration: number;
  viewCount: number;
  tags: string[];
  clipTranscript: string;
  description: string;
  fullTranscript: string;
  mediaEmbeds?: {
    mp4Filename?: string;
    thumbFilename?: string;
    imageFilename?: string;
  };
  webEmbed?: {
    enabled?: boolean;
    width?: string;
    height?: string;
  };
  frontmatterKeys?: {
    titleKey?: string;
    urlKey?: string;
    channelKey?: string;
    uploadDateKey?: string;
    thumbnailKey?: string;
    timeRangeKey?: string;
    descriptionKey?: string;
  };
}

export function buildNotesMarkdown(p: NoteParams): string {
  const isImage = p.mediaType === "image";
  const mp4Name = p.mediaEmbeds?.mp4Filename || "clip.mp4";
  const thumbName = p.mediaEmbeds?.thumbFilename || "thumb.jpg";
  const imageName = p.mediaEmbeds?.imageFilename || thumbName || "image.jpg";
  const keys = p.frontmatterKeys || {};

  const titleK = keys.titleKey || "yt_title";
  const urlK = keys.urlKey || "yt_url";
  const channelK = keys.channelKey || "yt_channel";
  const uploadK = keys.uploadDateKey || "yt_upload_date";
  const thumbK = keys.thumbnailKey || "yt_thumbnail";
  const timeRangeK = keys.timeRangeKey || "capture_time_range";
  const descK = keys.descriptionKey || "yt_description";

  const timeRangeVal = isImage ? "Full Image" : `${formatTime(p.clipStart)}–${formatTime(p.clipEnd)}`;
  const cleanDesc = (p.description || "").replace(/"/g, '\\"').replace(/\r?\n/g, " ");

  const includeWebEmbed = p.webEmbed?.enabled !== false;
  const embedWidth = p.webEmbed?.width || "100%";
  const embedHeight = p.webEmbed?.height || "520";
  const webEmbed = buildWebEmbed(
    p.platform,
    p.videoId,
    p.url,
    p.clipStart,
    p.title,
    embedWidth,
    embedHeight
  );

  const frontmatter = [
    "---",
    `${titleK}: "${p.title.replace(/"/g, '\\"')}"`,
    `${urlK}: "${p.url}"`,
    `platform: "${webEmbed.platform}"`,
    `media_type: "${isImage ? "image" : "video"}"`,
    `${channelK}: "${p.channel}"`,
    `${uploadK}: "${p.uploadDate}"`,
    `${thumbK}: "[[${isImage ? imageName : thumbName}]]"`,
    `${timeRangeK}: "${timeRangeVal}"`,
    `${descK}: "${cleanDesc}"`,
    `video_id: "${p.videoId}"`,
    `embed_url: "${webEmbed.embedUrl}"`,
    `embed_iframe: '${webEmbed.iframeHtml.replace(/'/g, "\\'")}'`,
    `captured_at: "${p.capturedAt}"`,
    `clip_duration_seconds: ${p.clipDuration}`,
    `view_count: ${p.viewCount}`,
    `tags: [${p.tags.map((t) => `"${t}"`).join(", ")}]`,
    isImage ? `image_file: "[[${imageName}]]"` : `clip_file: "[[${mp4Name}]]"`,
    "---",
  ].join("\n");

  const mediaSections: string[] = [];
  if (p.mediaEmbeds) {
    if (isImage) {
      mediaSections.push(
        "## Media Attachments",
        "",
        `![[${imageName}]]`,
        ""
      );
    } else {
      mediaSections.push(
        "## Media Attachments",
        "",
        `![[${mp4Name}]]`,
        "",
        `![[${thumbName}]]`,
        ""
      );
    }
  }

  if (includeWebEmbed) {
    const platformLabel = webEmbed.platform === "instagram" ? "Instagram" : "YouTube";
    mediaSections.push(
      `## Web Player & Embed (${platformLabel})`,
      "",
      webEmbed.iframeHtml,
      "",
      webEmbed.markdownEmbed,
      ""
    );
  }

  return [
    frontmatter,
    "",
    `# ${p.title}`,
    "",
    ...mediaSections,
    `## Clip transcript (${timeRangeVal})`,
    "",
    p.clipTranscript,
    "",
    "## Description",
    "",
    p.description || "*No description.*",
    "",
    "## Full transcript",
    "",
    p.fullTranscript,
  ].join("\n");
}
