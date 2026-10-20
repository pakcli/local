/** YT Extension — shared types (inside PakCLI Suite) */

export type VideoQuality =
  | "best"
  | "4k"
  | "2k"
  | "1080p"
  | "720p"
  | "480p"
  | "360p"
  | "240p"
  | "144p"
  | "audio";
export type VideoFps = "auto" | "60" | "30";

export interface YTPreset {
  id: string;
  name: string;
  lastUsedAt: number;
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

export const DEFAULT_PRESETS: YTPreset[] = [
  {
    id: "yt_evidence_standard",
    name: "YT Evidence (yt_title, yt_url, yt_channel, yt_upload_date, yt_thumbnail, capture_time_range, yt_description)",
    lastUsedAt: Date.now(),
    frontmatterKeys: {
      titleKey: "yt_title",
      urlKey: "yt_url",
      channelKey: "yt_channel",
      uploadDateKey: "yt_upload_date",
      thumbnailKey: "yt_thumbnail",
      timeRangeKey: "capture_time_range",
      descriptionKey: "yt_description",
    },
  },
  {
    id: "yt_minimal",
    name: "Minimal (title, url, channel, time_range, description)",
    lastUsedAt: Date.now() - 1000,
    frontmatterKeys: {
      titleKey: "title",
      urlKey: "url",
      channelKey: "channel",
      uploadDateKey: "upload_date",
      thumbnailKey: "thumbnail",
      timeRangeKey: "time_range",
      descriptionKey: "description",
    },
  },
  {
    id: "yt_raw_meta",
    name: "Full Raw Metadata (yt_title, yt_url, etc.)",
    lastUsedAt: Date.now() - 2000,
    frontmatterKeys: {
      titleKey: "yt_title",
      urlKey: "yt_url",
      channelKey: "yt_channel",
      uploadDateKey: "yt_upload_date",
      thumbnailKey: "yt_thumbnail",
      timeRangeKey: "capture_time_range",
      descriptionKey: "yt_description",
    },
  },
];

import type { YTHistoryCache } from "./utils/historyCache";

export interface YTCaptureSettings {
  ytDlpPath: string;
  ffmpegPath: string;
  ytCaptureOutputFolder: string;
  ytCaptureDefaultDuration: number;
  ytCaptureQuality?: VideoQuality;
  ytCaptureFps?: VideoFps;
  ytCaptureCreateZip?: boolean;
  ytCaptureForceResolution?: boolean;
  maxTitleLength?: number;
  presets?: YTPreset[];
  activePresetId?: string;
  ytHistoryCache?: YTHistoryCache;
  ytCaptureIncludeWebEmbed?: boolean;
  ytCaptureEmbedWidth?: string;
  ytCaptureEmbedHeight?: string;
  instagramSessionId?: string;
  recentFetches?: VideoPreview[];
}

export const DEFAULT_YTCAPTURE_SETTINGS: YTCaptureSettings = {
  ytDlpPath: "yt-dlp",
  ffmpegPath: "ffmpeg",
  ytCaptureOutputFolder: "YT Captures",
  ytCaptureDefaultDuration: 10,
  ytCaptureQuality: "best",
  ytCaptureFps: "auto",
  ytCaptureCreateZip: false,
  ytCaptureForceResolution: false,
  maxTitleLength: 20,
  presets: DEFAULT_PRESETS,
  activePresetId: "yt_evidence_standard",
  ytCaptureIncludeWebEmbed: true,
  ytCaptureEmbedWidth: "100%",
  ytCaptureEmbedHeight: "520",
  instagramSessionId: "",
  recentFetches: [],
};

// ── yt-dlp raw metadata shape ─────────────────────────────────────────────────

export interface YtDlpInfo {
  id: string;
  title: string;
  uploader?: string;
  channel?: string;
  channel_url?: string;
  uploader_url?: string;
  upload_date?: string;
  duration?: number;
  duration_string?: string;
  video_duration?: number;
  view_count?: number;
  description?: string;
  thumbnail?: string;
  thumbnails?: Array<{ url: string; width?: number; height?: number }>;
  tags?: string[];
  webpage_url?: string;
  is_live?: boolean;
  was_live?: boolean;
  live_status?: string;
  subtitles?: Record<string, unknown>;
  automatic_captions?: Record<string, unknown>;
  formats?: Array<{ duration?: number }>;
  media_type?: "video" | "image";
}

// ── Preview state (across modal steps) ───────────────────────────────────────

export interface VideoPreview {
  video_id: string;
  original_url: string;
  platform: "youtube" | "instagram";
  title: string;
  channel: string;
  uploader?: string;
  channel_url: string;
  thumbnail: string;
  start: number;
  end: number;
  duration: number;
  has_transcript: boolean;
  is_live?: boolean;
  was_live?: boolean;
  live_status?: string;
  video_duration: number;
  upload_date: string;
  view_count: number;
  tags: string[];
  description: string;
  quality: VideoQuality;
  fps: VideoFps;
  media_type?: "video" | "image";
  is_playlist?: boolean;
  playlist_id?: string;
  playlist_items?: PlaylistSyncItem[];
}

export interface CaptureResult {
  filename: string;
  vaultPath: string;
  fsDirPath: string;
}

export interface TranscriptEntry {
  startMs: number;
  endMs: number;
  text: string;
}

export interface ProgressInfo {
  percent: number;
  downloaded: string;
  total: string;
  speed: string;
  eta: string;
  rawMsg: string;
}

export type TaskStatus =
  | "queued"
  | "deps"
  | "fetching"
  | "downloading"
  | "done"
  | "error"
  | "cancelled";

export type PipelineStep = "deps" | "fetch" | "download" | "done";

export interface DownloadTask {
  id: string;
  url: string;
  title: string;
  channel: string;
  thumbnail: string;
  platform: "youtube" | "instagram";
  quality: VideoQuality;
  fps: VideoFps;
  timeRange: {
    start: number;
    end: number;
    isFull: boolean;
  };
  duration: number;
  status: TaskStatus;
  currentStep: PipelineStep;
  progress: ProgressInfo;
  error?: string;
  logs: string[];
  isFetchOnly?: boolean;
  isRetried?: boolean;
  forceResolution?: boolean;
  createdAt: number;
  completedAt?: number;
  abortFn?: () => void;
  outputFilePath?: string;
}

export type TableFilter = "youtube" | "instagram" | "both";
export type TableViewMode = "flat" | "grouped";
export type TableSort = "quality_fps" | "time" | "recent";



// ==========================================
// Playlist Sync & Incremental Delta Types
// ==========================================

export type PlaylistSyncItemStatus =
  | "new"
  | "existing_unchanged"
  | "existing_moved"
  | "removed";

export interface PlaylistSyncItem {
  videoId: string;
  title: string;
  duration?: number | string;
  thumbnailUrl: string;
  originalIndex: number; // 1-based index in remote playlist
  previousIndex?: number; // 1-based index in previous local state
  localFilePath?: string;
  localThumbnailPath?: string;
  status: PlaylistSyncItemStatus;
  uploadDate?: string;
  url: string;
  author?: string;
}

export interface PlaylistSyncHistoryEntry {
  date: string;
  count: number;
  videoIds: string[];
}

export interface PlaylistSyncState {
  playlistId: string;
  playlistTitle: string;
  channelTitle?: string;
  channelUrl?: string;
  lastSync: number;
  history: PlaylistSyncHistoryEntry[];
  items: Record<
    string,
    {
      videoId: string;
      title: string;
      position: number;
      localFilePath?: string;
      localThumbnailPath?: string;
      downloadedAt: number;
    }
  >;
}

export interface PlaylistDeltaResult {
  playlistId: string;
  playlistTitle: string;
  channelTitle: string;
  totalRemoteCount: number;
  items: PlaylistSyncItem[];
  newItems: PlaylistSyncItem[];
  movedItems: PlaylistSyncItem[];
  unchangedItems: PlaylistSyncItem[];
  removedItems: PlaylistSyncItem[];
}

// ==========================================
// Media Profile Fetcher Types (YT & IG)
// ==========================================

export interface ProfilePostItem {
  id: string;
  platform: "youtube" | "instagram";
  url: string;
  title: string;
  uploadDate?: string;
  mediaType: "video" | "photo" | "carousel";
  thumbnailUrl: string;
  firstImageUrl?: string;
  author: string;
  authorAvatar?: string;
  likes?: number;
  comments?: number;
  views?: number;
  duration?: string | number;
}

export interface ProfileFetchResult {
  platform: "youtube" | "instagram";
  username: string;
  displayName: string;
  avatarUrl?: string;
  bio?: string;
  totalFollowers?: number | string;
  posts: ProfilePostItem[];
  fetchedAt: number;
}
