/**
 * yt-dlp wrapper functions for PakCLI Suite.
 */
import { requestUrl } from "obsidian";
import { PathUtils, getNodeFs } from "../../../utils/nodeHelpers";
import type { YTCaptureSettings, YtDlpInfo, VideoQuality, VideoFps } from "../types";
import { runCommand, resolveBinary } from "./process";

export async function fetchVideoInfo(
  url: string,
  settings: YTCaptureSettings
): Promise<YtDlpInfo> {
  const baseArgs = [
    "--dump-json",
    "--skip-download",
    "--no-playlist",
    "--no-colors",
    "--no-live-from-start",
    url,
  ];

  let stdout = "";
  try {
    stdout = await runCommand(settings.ytDlpPath, baseArgs);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // If live event ended error or extractor error, retry with player_client fallback
    if (msg.toLowerCase().includes("live event has ended") || msg.toLowerCase().includes("this live event has ended")) {
      try {
        stdout = await runCommand(settings.ytDlpPath, [
          "--dump-json",
          "--skip-download",
          "--no-playlist",
          "--no-colors",
          "--no-live-from-start",
          "--extractor-args",
          "youtube:player_client=android,ios,mweb,web",
          url,
        ]);
      } catch {
        throw new Error("This live stream has ended and YouTube is still processing the recording. Please wait a few minutes and try again.");
      }
    } else {
      throw err;
    }
  }

  // Robust JSON parsing: find first '{' and last '}' to ignore any stdout warning lines
  const jsonStart = stdout.indexOf("{");
  const jsonEnd = stdout.lastIndexOf("}");

  if (jsonStart !== -1 && jsonEnd > jsonStart) {
    const jsonStr = stdout.substring(jsonStart, jsonEnd + 1);
    try {
      return JSON.parse(jsonStr) as YtDlpInfo;
    } catch {
      // Fallback parse attempt
    }
  }

  try {
    return JSON.parse(stdout) as YtDlpInfo;
  } catch {
    throw new Error("yt-dlp returned invalid metadata. Try updating yt-dlp via plugin settings.");
  }
}

export async function downloadClip(
  url: string,
  start: number,
  end: number,
  outputPath: string,
  settings: YTCaptureSettings,
  quality: VideoQuality = "best",
  fps: VideoFps = "auto",
  onProgress?: (msg: string) => void,
  isFull: boolean = false
): Promise<void> {
  const isInstagram = url.includes("instagram.com") || url.includes("instagr.am");
  const isAudio = quality === "audio";

  let formatStr = "bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best";

  if (isInstagram) {
    formatStr = isAudio ? "bestaudio/best" : "best";
  } else if (isAudio) {
    formatStr = "bestaudio/best";
  } else {
    let maxH = "";
    if (quality === "4k") maxH = "[height<=2160]";
    else if (quality === "2k") maxH = "[height<=1440]";
    else if (quality === "1080p") maxH = "[height<=1080]";
    else if (quality === "720p") maxH = "[height<=720]";
    else if (quality === "480p") maxH = "[height<=480]";
    else if (quality === "360p") maxH = "[height<=360]";
    else if (quality === "240p") maxH = "[height<=240]";
    else if (quality === "144p") maxH = "[height<=144]";

    let maxFps = "";
    if (fps === "60") maxFps = "[fps<=60]";
    else if (fps === "30") maxFps = "[fps<=30]";

    formatStr = `bestvideo${maxH}${maxFps}[ext=mp4]+bestaudio[ext=m4a]/bestvideo${maxH}${maxFps}+bestaudio/best${maxH}${maxFps}/best`;
  }

  const args: string[] = ["--newline"];

  if (!isInstagram) {
    args.push("--extractor-args", "youtube:player_client=mweb,android,web");
    args.push("--no-live-from-start");

    const isFullDuration = isFull || (start === 0 && end === 0);
    if (!isFullDuration && (start > 0 || end > 0)) {
      args.push("--download-sections", `*${start}-${end}`);
      if (!isAudio) {
        args.push("--force-keyframes-at-cuts");
      }
    }
  }

  let finalOutputPath = outputPath;
  if (finalOutputPath.endsWith(".mp4") || finalOutputPath.endsWith(".mp3")) {
    finalOutputPath = finalOutputPath.replace(/\.(mp4|mp3)$/i, ".%(ext)s");
  }

  args.push("-f", formatStr);

  if (isAudio) {
    args.push("-x", "--audio-format", "mp3");
  } else {
    args.push("--merge-output-format", "mp4");
  }

  args.push("--no-playlist", "--no-colors", "-o", finalOutputPath, url);

  const ffmpegCmd = resolveBinary(settings.ffmpegPath || "ffmpeg");
  if (ffmpegCmd) {
    args.unshift("--ffmpeg-location", ffmpegCmd);
  }

  try {
    await runCommand(settings.ytDlpPath, args, { onOutput: onProgress });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!isInstagram && (msg.toLowerCase().includes("live event has ended") || msg.toLowerCase().includes("this live event has ended"))) {
      try {
        const retryArgs = [...args];
        // Remove existing --extractor-args if present, then add multi-client fallback
        const eaIdx = retryArgs.indexOf("--extractor-args");
        if (eaIdx !== -1) retryArgs.splice(eaIdx, 2);
        retryArgs.unshift("--extractor-args", "youtube:player_client=android,ios,mweb,web");
        await runCommand(settings.ytDlpPath, retryArgs, { onOutput: onProgress });
      } catch {
        throw new Error(
          "This live stream has ended and YouTube is still processing the video. Please wait a few minutes and try again."
        );
      }
    } else {
      throw err;
    }
  }
}

export async function downloadSubtitles(
  url: string,
  outputDir: string,
  settings: YTCaptureSettings
): Promise<void> {
  const ffmpegCmd = resolveBinary(settings.ffmpegPath || "ffmpeg");
  const ffmpegArgs = ffmpegCmd ? ["--ffmpeg-location", ffmpegCmd] : [];

  await runCommand(
    settings.ytDlpPath,
    [
      ...ffmpegArgs,
      "--skip-download", "--write-subs", "--write-auto-subs",
      "--sub-langs", "all,-live_chat", "--sub-format", "json3",
      "--no-playlist", "--no-colors", "--no-live-from-start", "-o", PathUtils.join(outputDir, "%(id)s.%(ext)s"),
      url,
    ]
  ).catch(() => {/* silently ignore */});
}

export async function downloadThumbnail(thumbnailUrl: string): Promise<ArrayBuffer> {
  const resp = await requestUrl({ url: thumbnailUrl, method: "GET" });
  return resp.arrayBuffer;
}

export function findSubtitleFile(dir: string): string | null {
  const fs = getNodeFs();
  if (!fs) return null;
  const files = fs.readdirSync(dir).filter((f: string) => f.endsWith(".json3"));
  return files.length > 0 ? PathUtils.join(dir, files[0]) : null;
}
