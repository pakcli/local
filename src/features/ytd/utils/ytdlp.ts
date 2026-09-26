/**
 * yt-dlp wrapper functions for PakCLI Suite.
 */
import { requestUrl } from "obsidian";
import { PathUtils, getNodeFs } from "../../../utils/nodeHelpers";
import type { YTCaptureSettings, YtDlpInfo, VideoQuality, VideoFps } from "../types";
import { runCommand, resolveBinary } from "./process";

interface MinimalFs {
  existsSync(path: string): boolean;
  readdirSync(path: string): string[];
  unlinkSync(path: string): void;
  renameSync(from: string, to: string): void;
}

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
    const msg = err instanceof Error ? err.message : typeof err === "string" ? err : JSON.stringify(err);
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

    formatStr = `bestvideo${maxH}${maxFps}+bestaudio/bestvideo${maxH}+bestaudio/best${maxH}${maxFps}/best${maxH}/best`;
  }

  const args: string[] = ["--newline"];

  if (!isInstagram) {
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
  // Only pass --ffmpeg-location if it points to an explicit file/directory path with slashes
  if (ffmpegCmd && (ffmpegCmd.includes("/") || ffmpegCmd.includes("\\"))) {
    args.unshift("--ffmpeg-location", ffmpegCmd);
  }

  try {
    await runCommand(settings.ytDlpPath, args, { onOutput: onProgress });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : typeof err === "string" ? err : JSON.stringify(err);
    if (!isInstagram && (msg.toLowerCase().includes("live event has ended") || msg.toLowerCase().includes("this live event has ended"))) {
      try {
        const retryArgs = [...args];
        retryArgs.unshift("--extractor-args", "youtube:player_client=android_vr,web");
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
  const ffmpegArgs = ffmpegCmd && (ffmpegCmd.includes("/") || ffmpegCmd.includes("\\"))
    ? ["--ffmpeg-location", ffmpegCmd]
    : [];

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
  const fs = getNodeFs() as MinimalFs | null;
  if (!fs) return null;
  const files = fs.readdirSync(dir).filter((f: string) => f.endsWith(".json3"));
  return files.length > 0 ? PathUtils.join(dir, files[0]) : null;
}

export const QUALITY_HEIGHT_MAP: Record<string, number> = {
  "4k": 2160,
  "2k": 1440,
  "1080p": 1080,
  "720p": 720,
  "480p": 480,
  "360p": 360,
  "240p": 240,
  "144p": 144,
};

export function getQualityFromHeight(height: number): VideoQuality {
  if (height >= 2100) return "4k";
  if (height >= 1400) return "2k";
  if (height >= 1000) return "1080p";
  if (height >= 700) return "720p";
  if (height >= 460) return "480p";
  if (height >= 340) return "360p";
  if (height >= 220) return "240p";
  return "144p";
}

/**
 * Inspect actual video dimensions (width and height) of a downloaded media file using ffprobe or ffmpeg.
 */
export async function getVideoDimensions(
  filePath: string,
  settings: YTCaptureSettings
): Promise<{ width: number; height: number } | null> {
  const fs = getNodeFs() as MinimalFs | null;
  if (!fs || !fs.existsSync(filePath)) return null;

  // 1. Try ffprobe first
  try {
    const ffprobeBin = resolveBinary("ffprobe");
    const out = await runCommand(ffprobeBin, [
      "-v", "error",
      "-select_streams", "v:0",
      "-show_entries", "stream=width,height",
      "-of", "csv=s=x:p=0",
      filePath,
    ]);
    const trimmed = out.trim();
    const parts = trimmed.split("x").map((n) => parseInt(n, 10));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1]) && parts[0] > 0 && parts[1] > 0) {
      return { width: parts[0], height: parts[1] };
    }
  } catch {
    // ffprobe not available or failed, try ffmpeg fallback
  }

  // 2. Fallback: inspect via ffmpeg -i
  try {
    const ffmpegBin = resolveBinary(settings.ffmpegPath || "ffmpeg");
    let stderrOut = "";
    try {
      await runCommand(ffmpegBin, ["-i", filePath], {
        onStderr: (data) => { stderrOut += data; },
      });
    } catch {
      // ffmpeg -i without output file exits with code 1, which is expected
    }

    const match = stderrOut.match(/Stream #\d+:\d+.*Video:.*?(\d{3,5})x(\d{3,5})/);
    if (match) {
      const w = parseInt(match[1], 10);
      const h = parseInt(match[2], 10);
      if (!isNaN(w) && !isNaN(h)) {
        return { width: w, height: h };
      }
    }
  } catch {
    // Inspection failed
  }

  return null;
}

/**
 * Upscale video to target height using FFmpeg Lanczos scaling algorithm.
 */
export async function upscaleVideo(
  inputPath: string,
  targetHeight: number,
  settings: YTCaptureSettings,
  onProgress?: (msg: string) => void
): Promise<string> {
  const fs = getNodeFs() as MinimalFs | null;
  if (!fs || !fs.existsSync(inputPath)) return inputPath;

  const ffmpegBin = resolveBinary(settings.ffmpegPath || "ffmpeg");
  const dir = PathUtils.dirname(inputPath);
  const ext = PathUtils.extname(inputPath);
  const base = PathUtils.basename(inputPath, ext);
  const tempUpscaledPath = PathUtils.join(dir, `${base}_scaled.mp4`);

  onProgress?.(`Upscaling video to ${targetHeight}p via FFmpeg (Lanczos)...`);

  const filter = `scale=-2:${targetHeight}:flags=lanczos`;
  const args = [
    "-y",
    "-i", inputPath,
    "-vf", filter,
    "-c:v", "libx264",
    "-crf", "18",
    "-preset", "fast",
    "-c:a", "copy",
    tempUpscaledPath,
  ];

  await runCommand(ffmpegBin, args, {
    onStderr: (line) => {
      if (line.includes("frame=") || line.includes("time=")) {
        onProgress?.(`Upscaling: ${line.trim().slice(0, 80)}`);
      }
    },
  });

  if (fs.existsSync(tempUpscaledPath)) {
    try {
      fs.unlinkSync(inputPath);
      fs.renameSync(tempUpscaledPath, inputPath);
      return inputPath;
    } catch {
      return tempUpscaledPath;
    }
  }

  return inputPath;
}

