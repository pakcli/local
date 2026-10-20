import { App, TFile, normalizePath, requestUrl } from "obsidian";
import { PathUtils } from "../../../utils/nodeHelpers";
import type {
  YTCaptureSettings,
  ProfileFetchResult,
  ProfilePostItem,
} from "../types";
import { runCommand } from "./process";
import { fetchVideoInfo } from "./ytdlp";
import { sanitizePlaylistFilename } from "./playlistSync";

/**
 * Clean and resolve YouTube Channel handle/URL.
 */
export function resolveYouTubeChannelUrl(input: string): string {
  const trimmed = input.trim();
  if (trimmed.startsWith("http")) return trimmed;
  if (trimmed.startsWith("@")) return `https://www.youtube.com/${trimmed}/videos`;
  if (/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    return `https://www.youtube.com/@${trimmed}/videos`;
  }
  return `https://www.youtube.com/${trimmed}`;
}

/**
 * Clean and resolve Instagram username.
 */
export function cleanInstagramUsername(input: string): string {
  return input
    .trim()
    .replace(/^https?:\/\/(?:www\.)?instagram\.com\//i, "")
    .replace(/^[#@]+/, "")
    .replace(/[/?#].*$/, "")
    .trim();
}

/**
 * Fetch YouTube profile latest videos + poster frames + metadata.
 */
export async function fetchYouTubeProfilePosts(
  channelInput: string,
  maxPosts = 10,
  settings: YTCaptureSettings
): Promise<ProfileFetchResult> {
  const channelUrl = resolveYouTubeChannelUrl(channelInput);

  try {
    const rawJson = await runCommand(settings.ytDlpPath || "yt-dlp", [
      "--flat-playlist",
      "--dump-single-json",
      "--playlist-end",
      maxPosts.toString(),
      "--no-warnings",
      "--no-colors",
      channelUrl,
    ]);

    const data = JSON.parse(rawJson);
    const channelName = data.uploader || data.channel || data.title || "YouTube Channel";
    const entries: any[] = Array.isArray(data.entries) ? data.entries.slice(0, maxPosts) : [];

    const posts: ProfilePostItem[] = entries.map((entry) => {
      const vid = entry.id || "";
      const thumb =
        entry.thumbnails?.[entry.thumbnails.length - 1]?.url ||
        entry.thumbnail ||
        `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`;

      return {
        id: vid,
        platform: "youtube",
        url: `https://www.youtube.com/watch?v=${vid}`,
        title: entry.title || `Video ${vid}`,
        uploadDate: entry.upload_date || "",
        mediaType: "video",
        thumbnailUrl: thumb,
        author: channelName,
        duration: entry.duration || 0,
        views: entry.view_count || undefined,
      };
    });

    return {
      platform: "youtube",
      username: channelInput.replace(/^https?:\/\/(?:www\.)?youtube\.com\//, ""),
      displayName: channelName,
      avatarUrl: data.thumbnails?.[0]?.url,
      bio: data.description || "",
      posts,
      fetchedAt: Date.now(),
    };
  } catch (err) {
    console.warn("[ProfileFetcher] yt-dlp profile fetch failed, attempting RSS fallback:", err);
  }

  // Fallback via RSS if channel ID or username is direct
  throw new Error(`Failed to fetch YouTube profile for '${channelInput}'. Ensure yt-dlp is available in settings or PATH.`);
}

/**
 * Fetch Instagram profile latest posts + first image / first frame previews + metadata.
 */
export async function fetchInstagramProfilePosts(
  userInput: string,
  maxPosts = 12,
  settings: YTCaptureSettings
): Promise<ProfileFetchResult> {
  const trimmed = userInput.trim();

  // 0. Handle Direct Post / Reel URLs seamlessly
  if (trimmed.includes("/p/") || trimmed.includes("/reel/") || trimmed.includes("/tv/")) {
    try {
      const info = await fetchVideoInfo(trimmed, settings);
      const isVideo = Boolean((info.duration && info.duration > 0) || (info as any).is_video);
      return {
        platform: "instagram",
        username: info.uploader || info.channel || "Instagram Post",
        displayName: info.uploader || info.channel || "Instagram Post",
        avatarUrl: info.thumbnail,
        posts: [
          {
            id: info.id,
            platform: "instagram",
            url: trimmed,
            title: info.title || "Instagram Post",
            uploadDate: info.upload_date || "",
            mediaType: isVideo ? "video" : "photo",
            thumbnailUrl: info.thumbnail || "",
            firstImageUrl: info.thumbnail || "",
            author: info.uploader || "Instagram User",
            duration: info.duration,
          },
        ],
        fetchedAt: Date.now(),
      };
    } catch (err: any) {
      console.warn("[ProfileFetcher] Direct post fetch failed:", err);
    }
  }

  const username = cleanInstagramUsername(trimmed);
  const profileUrl = `https://www.instagram.com/${username}/`;
  const sessionId = settings?.instagramSessionId?.trim();

  // 1. Primary: Direct Instagram Web Profile API (Works reliably when sessionId is set)
  try {
    const apiUrl = `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`;
    const headers: Record<string, string> = {
      "x-ig-app-id": "936619743392459",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      "Accept": "*/*",
      "Referer": profileUrl,
    };
    if (sessionId) {
      headers["Cookie"] = `sessionid=${sessionId};`;
    }

    const resp = await requestUrl({
      url: apiUrl,
      headers,
    });

    const body = resp.json;
    const user = body?.data?.user;
    if (user) {
      const edges: any[] = user.edge_owner_to_timeline_media?.edges || [];
      const posts: ProfilePostItem[] = edges.slice(0, maxPosts).map((edge) => {
        const node = edge.node;
        const isVideo = Boolean(node.is_video);
        const isCarousel = Boolean(node.edge_sidecar_to_children?.edges?.length);

        let mediaType: ProfilePostItem["mediaType"] = "photo";
        if (isVideo) mediaType = "video";
        else if (isCarousel) mediaType = "carousel";

        const firstImg =
          node.edge_sidecar_to_children?.edges?.[0]?.node?.display_url ||
          node.display_url ||
          node.thumbnail_src ||
          "";

        const captionText =
          node.edge_media_to_caption?.edges?.[0]?.node?.text || "Instagram Post";

        return {
          id: node.shortcode || node.id,
          platform: "instagram",
          url: `https://www.instagram.com/p/${node.shortcode}/`,
          title: captionText.replace(/\n+/g, " ").slice(0, 150),
          uploadDate: node.taken_at_timestamp
            ? new Date(node.taken_at_timestamp * 1000).toISOString().split("T")[0]
            : "",
          mediaType,
          thumbnailUrl: firstImg,
          firstImageUrl: firstImg,
          author: user.username,
          authorAvatar: user.profile_pic_url_hd || user.profile_pic_url,
          likes: node.edge_liked_by?.count ?? node.edge_media_preview_like?.count,
          comments: node.edge_media_to_comment?.count,
          views: node.video_view_count,
        };
      });

      return {
        platform: "instagram",
        username: user.username,
        displayName: user.full_name || user.username,
        avatarUrl: user.profile_pic_url_hd || user.profile_pic_url,
        bio: user.biography || "",
        totalFollowers: user.edge_followed_by?.count,
        posts,
        fetchedAt: Date.now(),
      };
    }
  } catch (apiErr) {
    console.warn("[ProfileFetcher] Instagram direct API failed, trying yt-dlp fallback:", apiErr);
  }

  // 2. Auxiliary: yt-dlp profile extraction (Passing session cookie if available)
  try {
    const ytdlpArgs = [
      "--flat-playlist",
      "--dump-single-json",
      "--playlist-end",
      maxPosts.toString(),
      "--no-warnings",
      "--no-colors",
    ];
    if (sessionId) {
      ytdlpArgs.push("--add-header", `Cookie: sessionid=${sessionId}`);
    }
    ytdlpArgs.push(profileUrl);

    const rawJson = await runCommand(settings.ytDlpPath || "yt-dlp", ytdlpArgs);

    const data = JSON.parse(rawJson);
    const entries: any[] = Array.isArray(data.entries) ? data.entries.slice(0, maxPosts) : [];

    const posts: ProfilePostItem[] = entries.map((entry) => {
      const shortcode = entry.id || "";
      const thumb =
        entry.thumbnails?.[entry.thumbnails.length - 1]?.url ||
        entry.thumbnail ||
        "";

      return {
        id: shortcode,
        platform: "instagram",
        url: `https://www.instagram.com/p/${shortcode}/`,
        title: (entry.title || "Instagram Post").slice(0, 150),
        uploadDate: entry.upload_date || "",
        mediaType: entry.duration ? "video" : "photo",
        thumbnailUrl: thumb,
        firstImageUrl: thumb,
        author: username,
      };
    });

    if (posts.length > 0) {
      return {
        platform: "instagram",
        username,
        displayName: username,
        posts,
        fetchedAt: Date.now(),
      };
    }
  } catch (ytdlpErr) {
    console.warn("[ProfileFetcher] yt-dlp Instagram extraction failed:", ytdlpErr);
  }

  // Clear, helpful guidance instead of raw yt-dlp stack trace
  throw new Error(
    `Instagram requires login to view profiles (@${username}).\n\n` +
    `💡 Cara Fix:\n` +
    `1. Masukkan Instagram 'sessionid' cookie di pengaturan profil di bawah, ATAU\n` +
    `2. Paste link direct Post / Reel Instagram (misal: instagram.com/p/... atau /reel/...) untuk fetch langsung.`
  );
}

/**
 * Generate a Markdown note for a fetched creator profile.
 */
export async function createProfileMarkdownNote(
  app: App,
  result: ProfileFetchResult,
  outputFolder: string
): Promise<TFile> {
  const normFolder = normalizePath(outputFolder);
  if (!(await app.vault.adapter.exists(normFolder))) {
    await app.vault.adapter.mkdir(normFolder);
  }

  const cleanName = sanitizePlaylistFilename(result.displayName || result.username);
  const notePath = normalizePath(
    PathUtils.join(normFolder, `${result.platform.toUpperCase()} - ${cleanName}.md`)
  );
  const todayStr = new Date().toISOString().split("T")[0];

  const frontmatter = [
    "---",
    `platform: "${result.platform}"`,
    `username: "${result.username}"`,
    `display_name: "${(result.displayName || result.username).replace(/"/g, '\\"')}"`,
    `followers: ${result.totalFollowers || 0}`,
    `fetched_at: "${todayStr}"`,
    `total_posts_fetched: ${result.posts.length}`,
    "tags:",
    `  - ${result.platform}`,
    "  - profile",
    "  - pakcli",
    "---",
    "",
  ].join("\n");

  const avatarMd = result.avatarUrl ? `![](${result.avatarUrl})` : "";
  const header = [
    `# 👤 ${result.displayName} (@${result.username})`,
    "",
    avatarMd ? `> ${avatarMd}` : "",
    `> **Platform**: ${result.platform.toUpperCase()}`,
    result.totalFollowers ? `> **Followers**: ${Number(result.totalFollowers).toLocaleString()}` : "",
    result.bio ? `> **Bio**: ${result.bio.replace(/\n+/g, " ")}` : "",
    `> **Updated**: ${todayStr}`,
    "",
    "---",
    "",
    "## 📸 Latest Posts & Media Previews",
    "",
    "| No | Preview (1st Frame / Img) | Type | Caption / Title | Stats | Link |",
    "| :---: | :---: | :---: | :--- | :---: | :---: |",
  ].filter(Boolean).join("\n");

  const rows = result.posts.map((p, idx) => {
    const pad = String(idx + 1).padStart(2, "0");
    const preview = p.thumbnailUrl ? `<img src="${p.thumbnailUrl}" width="100" />` : "-";
    const typeBadge =
      p.mediaType === "video"
        ? "🎬 Video / Reel"
        : p.mediaType === "carousel"
        ? "📚 Carousel"
        : "📷 Photo";

    const cleanTitle = (p.title || "-").replace(/\|/g, "-");
    let stats = "-";
    if (p.likes !== undefined || p.comments !== undefined) {
      stats = `❤️ ${p.likes?.toLocaleString() || 0} 💬 ${p.comments?.toLocaleString() || 0}`;
    } else if (p.views !== undefined) {
      stats = `👁️ ${p.views.toLocaleString()}`;
    }

    return `| ${pad} | ${preview} | ${typeBadge} | ${cleanTitle} | ${stats} | [Open Post](${p.url}) |`;
  });

  const content = [frontmatter, header, ...rows, ""].join("\n");

  let noteFile = app.vault.getAbstractFileByPath(notePath);
  if (noteFile instanceof TFile) {
    await app.vault.modify(noteFile, content);
  } else {
    noteFile = await app.vault.create(notePath, content);
  }

  return noteFile as TFile;
}
