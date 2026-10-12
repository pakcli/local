# PakCLI Local (Obsidian Plugin)

> 🖥️ **PakCLI Local** is a desktop OS bridge, power utilities, and system automation suite for [Obsidian](https://obsidian.md). It equips your vault with native Windows symlink/junction management, bi-directional script file synchronization, yt-dlp media capture pipelines, Git Sentinel monitoring, and native clipboard integration.

![Version](https://img.shields.io/badge/version-1.0.12-green)
![Platform](https://img.shields.io/badge/platform-Desktop%20(Windows%20%7C%20macOS%20%7C%20Linux)-blue)
![Obsidian](https://img.shields.io/badge/obsidian-%5E1.8.0-purple)
![License](https://img.shields.io/badge/license-MIT-yellow)

---

## 🌟 Architecture & Mechanics Overview

PakCLI Local directly interfaces with Node.js OS modules (`child_process`, `fs`, `crypto`, `electron`) to give Obsidian native desktop power without breaking vault integrity.

```
+-----------------------------------------------------------------------------------+
|                                 PAKCLI LOCAL HUB                                  |
|                                                                                   |
|  +--------------------+  +--------------------+  +-----------------------------+  |
|  |  Symlink & Junction|  |  ScriptSync Engine |  |     YTD Capture Pipeline    |  |
|  |  - Junction Badges |  |  - Codeblock:sync  |  |  - yt-dlp + ffmpeg Runner   |  |
|  |  - Shell Symlinks  |  |  - Bi-directional  |  |  - Multi-stage Transcode    |  |
|  |  - Explorer Badges |  |  - Hash-check Diff |  |  - Note Auto-generation     |  |
|  +--------------------+  +--------------------+  +-----------------------------+  |
|            |                       |                            |                 |
|  +--------------------+  +--------------------+  +-----------------------------+  |
|  | Native OS Clipboard|  |    Git Sentinel    |  |   GitHub Batch Fetcher      |  |
|  | - Windows Explorer |  |  - Auto-commit Log |  |  - Zip Extraction to Vault  |  |
|  | - Native Drag/Paste|  |  - Branch Status   |  |  - Release Asset Download   |  |
|  +--------------------+  +--------------------+  +-----------------------------+  |
+-----------------------------------------------------------------------------------+
```

---

## 🖼️ UI / UX Wireframes

### 1. YTD Media Downloader View (`ytec-downloader-view`)

```
+-----------------------------------------------------------------------------------+
| [🎥 PakCLI Media Downloader]                       [⚙️ Settings] [🔄 Refresh] [✖] |
+-----------------------------------------------------------------------------------+
| [ YouTube ]   [ Instagram ]   [ Downloads History (14) ]                          |
+-----------------------------------------------------------------------------------+
| [ 🔍 Paste video URL (YouTube, Reels, Shorts)...                               ] |
+-----------------------------------------------------------------------------------+
| ┌──────────────────────┐  Title: Building Scalable Systems in 2026                 |
| │  [ Video Thumbnail ] │  Channel: TechInsights | Duration: 14:20                  |
| │       [14:20]        │  Status: Metadata Verified ✓                              |
| └──────────────────────┘                                                          |
| Quality:  (o) 1080p FHD   ( ) 720p HD   ( ) 480p SD   ( ) Audio Only (MP3 320k)   |
|                                                                                   |
| Time Range Clipping:                                                              |
| [ 00:01:30 ] <========[=========]===================> [ 00:04:45 ]  [Full Video]  |
|                                                                                   |
| [📥 Fetch & Download]   [📑 Fetch Metadata & Generate Note Only]                  |
+-----------------------------------------------------------------------------------+
| 🚀 Active Download Pipeline:                                                      |
|   [Fetch Meta: ✓] ──> [Download: 68%] ──> [Extract Subtitles: ...] ──> [Note: O]  |
|   [===============================>          ]  68.4% (8.2 MB/s - ETA: 00:14)     |
|   [🛑 Cancel]   [🔄 Retry]                                                        |
+-----------------------------------------------------------------------------------+
```

### 2. ScriptSync Bi-Directional Codeblock Mechanic

```markdown
```powershell:sync
# SYNC_TARGET: D:\Scripts\Deploy-Automation.ps1
# SYNC_HASH: a7f8d3... (SHA-256)
param([string]$Environment = "Production")
Write-Host "Deploying vault artifacts to $Environment..."
npm run build
```
```

- When you edit the markdown note inside Obsidian, ScriptSync automatically updates the external `.ps1` file.
- When the external file changes externally (e.g. in VS Code or PowerShell ISE), a **Pending Changes Diff Modal** appears allowing 1-click sync or review!

---

## ⚡ Core Feature Mechanics

### 1. 🔗 Symlink & Directory Junction Manager
- Create Windows directory junctions (`mklink /J`) and file symlinks directly from Obsidian's folder context menu.
- **Visual Folder Badges**: Adds distinct junction badges in the File Explorer tree so you always know which folders point outside the vault.
- **Deep Re-indexing**: Automatically monitors junction integrity and re-indexes on rename or target path change.

### 2. ⚡ ScriptSync & Live Script Runner
- **Codeblock Tagging**: Supports ````powershell:sync````, ````python:sync````, ````bash:sync````.
- **Bi-Directional Synchronization**: Vault markdown blocks and disk scripts stay synchronized via fast SHA-256 hash checks.
- **Inline Runner & Output Inspector**: Run scripts directly from Obsidian notes with output captured and formatted below the block.

### 3. 🎥 YTD (Media Downloader & Knowledge Archiver)
- Powered by local `yt-dlp` and `ffmpeg` binaries.
- Downloads full videos, audio tracks, thumbnail covers, and auto-generated or manual subtitle tracks (`.vtt` / `.srt`).
- Automatically creates a structured Markdown note in your vault with:
  - Video title, author, duration, publication date, and tags.
  - Local embedded video link (`![[Video.mp4]]`).
  - Auto-extracted timestamps and summary notes.

### 4. 📋 Native OS File Clipboard Bridge
- Context Menu item: **"Copy folder (Native OS)"** / **"Copy file (Native OS)"**.
- Puts native file shell descriptors onto the Windows/OS clipboard so you can immediately paste into Windows Explorer or external apps.

### 5. 🛡️ Git Sentinel
- Automatic background tracking for vault commits, branch changes, and commit logs without leaving Obsidian.

### 6. 🎛️ Master-Detail Settings Hub
- 2-Column responsive settings panel with system diagnostics wizard:
  - Verifies Node.js desktop environment.
  - Checks PowerShell version and execution policies.
  - Validates `yt-dlp` and `ffmpeg` binary availability with 1-click test runner.

---

## 📦 Requirements & Installation

1. **Obsidian Desktop** (v1.8.0+ required, desktop-only due to Node.js OS APIs).
2. Recommended system tools:
   - PowerShell 5.1+ / PowerShell 7+ (Windows).
   - `yt-dlp` and `ffmpeg` (installed and added to `PATH` for media downloading).

### Manual Installation
Copy `main.js`, `manifest.json`, and `styles.css` into your vault:
```
<vault>/.obsidian/plugins/pakcli-local/
```
Enable **PakCLI Local** in **Settings → Community Plugins**.

---

## 📄 License
MIT License © PakCLI Team
