# YT & IG Downloader Panel — Brief & Text Wireframe Specification

## 1. Overview & Architecture

Replace/refactor the monolithic `CaptureModal.ts` into a dedicated **Obsidian ItemView panel** (`YTDownloaderView`), opening as a main workspace tab or dockable side panel.

- **View Type**: `ItemView` (`ytd-downloader-view`)
- **Ribbon Entry**: `[🎬]` icon in left ribbon
- **Command Entry**: `Open YT & IG Downloader`
- **Header Toolbar**: Title `YT & IG Downloader` + `[⊞ Dock as Side Panel]` + `[✕ Exit]`
- **Navigation Tabs**:
  - `[📥 Download New]` (Default)
  - `[📊 Table View]` (Full History & Batch Management)
- **Footer (Persistent across tabs)**: Global task manager showing active/queued downloads.

---

## 2. Tab 1: Download New — Wireframe

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ [🎬 YT & IG Downloader]                        [⊞ Dock to Side]  [✕ Close]   │
├──────────────────────────────────────────────────────────────────────────────┤
│  [📥 Download New]   [📊 Table View]                                         │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─ [THUMBNAIL BLURRED BACKGROUND HERO] ─────────────────────────────────┐   │
│  │                                                                       │   │
│  │   🔗 [ https://www.youtube.com/watch?v=...                                ] │   │
│  │                                                                       │   │
│  │   ┌─ After Fetch: Metadata & Options ─────────────────────────────┐   │   │
│  │   │ Title: How to Build Modern Obsidian Plugins                   │   │   │
│  │   │ Channel: Obsidian Devs · 18:42 min · 1080p60 available        │   │   │
│  │   │                                                               │   │   │
│  │   │ Quality: [4K] [1440p] [1080p ●] [720p] [480p] [360p] [Audio] │   │   │
│  │   │ FPS:     [Auto ●] [60fps] [30fps]                             │   │   │
│  │   │ Range:   [ 00:00 ] ────[============]──── [ 18:42 ] [Full]    │   │   │
│  │   │ Preset:  [Default Video ▾]       Folder: [/Media/YT ▾]        │   │   │
│  │   │                                                               │   │   │
│  │   │          [ 🔍 Fetch Only ]          [ ⚡ Fetch & Download ]          │   │
│  │   └───────────────────────────────────────────────────────────────┘   │   │
│  └───────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌─ 🐛 Debug Panel ──────────────────────────────────────────────────────┐   │
│  │ [▾ Collapse] Mode: (● This Download | ○ All Instances)                    │   │
│  │ [☑ +date_info]                                  [📋 Copy Debug Log]      │   │
│  │ ───────────────────────────────────────────────────────────────────── │   │
│  │ 2026-09-18_Plugin_Tut | [INFO] Checking yt-dlp binary... OK           │   │
│  │ 2026-09-18_Plugin_Tut | [INFO] Extracted format: 137+140 (1080p60)    │   │
│  │ 2026-09-18_Plugin_Tut | [DEBUG] ffmpeg mux arguments resolved         │   │
│  └───────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ──────────────────────────────────────────────────────────────────────────  │
│  🕐 Recent Downloads [▾ collapse]                                            │
│  Filter: [🎬 YouTube] [📸 Instagram] [⊞ Both ●]        Sort: Quality × FPS ▾ │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ Thumb | Title & URL             | Quality × Range   | Plat | Actions   │  │
│  ├───────┼─────────────────────────┼───────────────────┼──────┼───────────┤  │
│  │ [IMG] │ Obsidian Plugin Guide   │ 1080p 60fps       │ [YT] │ [🔄] [⬇▾] │  │
│  │       │ https://youtu.be/xyz... │ 01:30 → 15:00     │      │ [📝] [🐛] │  │
│  │       ├─────────────────────────┴───────────────────┴──────┴───────────┤  │
│  │       │ ↳ Pipeline: ✅ Deps ──▶ ✅ Fetch ──▶ ⏳ 45% [███░░] ──▶ ○ Done   │  │
│  │       │             ETA: 12s · 4.2 MB/s                   [✕ Cancel]   │  │
│  ├───────┼─────────────────────────┼───────────────────┼──────┼───────────┤  │
│  │ [IMG] │ Creative Reel Demo      │ 720p 30fps        │ [IG] │ [🔄] [⬇▾] │  │
│  │       │ https://instagr.am/p/.. │ 00:00 → Full      │      │ [📝] [🐛] │  │
│  │       ├─────────────────────────┴───────────────────┴──────┴───────────┤  │
│  │       │ ↳ Pipeline: ✅ Deps ──▶ ❌ Fetch [Network timeout]  [↺ Retry]   │  │
│  ├───────┼─────────────────────────┼───────────────────┼──────┼───────────┤  │
│  │ [IMG] │ AI Agent Crash Course   │ Audio             │ [YT] │ [🔄] [⬇▾] │  │
│  │       │ https://youtu.be/abc... │ 00:00 → Full      │      │ [📝] [🐛] │  │
│  │       │ [🔵 Fetches Only]       │                   │      │           │  │
│  └───────┴─────────────────────────┴───────────────────┴──────┴───────────┘  │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│ ⏳ Footer: 2 / 5 downloading [██████░░░░] 52%          [📋 View All Tasks]   │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Tab 2: Table View (Full History) — Wireframe

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ [🎬 YT & IG Downloader]                        [⊞ Dock to Side]  [✕ Close]   │
├──────────────────────────────────────────────────────────────────────────────┤
│  [📥 Download New]   [📊 Table View ●]                                       │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Toolbar:                                                                    │
│  Filter: [🎬 YouTube] [📸 Instagram] [⊞ Both ●]                              │
│  View:   [⊞ Grouped by URL] [≡ Flat (1 row/file) ●]                          │
│  Sort:   [Quality × FPS ▾]  Order: [Desc ▾]         [+ Add New Download]     │
│                                                                              │
│  ┌─ (If [+ Add New Download] clicked, inline creator opens) ─────────────┐   │
│  │ 🔗 [ Paste YouTube or Instagram URL here...                 ] [Fetch] │   │
│  └───────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  TABLE (Flat Mode: 1 Row Per Download Task / File):                          │
│  ┌────────┬─────────────────────────┬─────────────────┬──────┬────────────┐  │
│  │ Thumb  │ Title & URL             │ Quality × Range │ Plat │ Actions    │  │
│  ├────────┼─────────────────────────┼─────────────────┼──────┼────────────┤  │
│  │ [IMG]  │ Advanced TypeScript     │ 4K 60fps        │ [YT] │ [🔄] [⬇▾]  │  │
│  │        │ https://youtu.be/123    │ 00:00 → Full    │      │ [📝] [🐛]  │  │
│  ├────────┼─────────────────────────┼─────────────────┼──────┼────────────┤  │
│  │ [IMG]  │ Advanced TypeScript     │ 1080p 30fps     │ [YT] │ [🔄] [⬇▾]  │  │
│  │        │ https://youtu.be/123    │ 05:00 → 12:00   │      │ [📝] [🐛]  │  │
│  ├────────┼─────────────────────────┼─────────────────┼──────┼────────────┤  │
│  │ [IMG]  │ Designer Portfolio Reel │ 720p 30fps      │ [IG] │ [🔄] [⬇▾]  │  │
│  │        │ https://instagr.am/p/.. │ 00:00 → Full    │      │ [📝] [🐛]  │  │
│  ├────────┼─────────────────────────┼─────────────────┼──────┼────────────┤  │
│  │ [IMG]  │ Lex Fridman #400        │ Audio           │ [YT] │ [🔄] [⬇▾]  │  │
│  │        │ https://youtu.be/999    │ 00:00 → Full    │      │ [📝] [🐛]  │  │
│  ├────────┼─────────────────────────┼─────────────────┼──────┼────────────┤  │
│  │ [IMG]  │ Future of Robotics      │ --              │ [YT] │ [⬇ Download]│ │
│  │        │ https://youtu.be/555    │ 🔵 Fetches Only │      │ [📝] [🐛]  │  │
│  └────────┴─────────────────────────┴─────────────────┴──────┴────────────┘  │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│ ⏳ Footer: 2 / 5 downloading [██████░░░░] 52%          [📋 View All Tasks]   │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Component Details & Behaviors

### 4.0. Hero & Action Controls (`DownloadHero.ts` & `DownloadForm.ts`)
- **URL Input**: Clean single input with autofocus and auto-paste support. No redundant fetch button beside the input; actions are triggered via the primary control bar below.
- **The 2 Action Buttons**:
  1. `[ 🔍 Fetch Only ]`: Fetches video metadata, title, duration, and available formats without initiating a download. Populates the options UI and adds a record to the table with badge `[🔵 Fetches Only]`.
  2. `[ ⚡ Fetch & Download ]`: Fetches info and immediately downloads the media using the configured or default preset options.

### 4.1. TableView Component (`TableView.ts`)
- **Row Model**:
  - `Flat Mode`: Exactly **1 row per download execution/file**.
  - `Grouped Mode` (Tab 2 toggle): Master row by URL with nested expandable child rows for each downloaded quality/range.
  - `Recent Downloads` (Tab 1): Always Flat mode, capped at recent items (e.g. 10).
- **Columns**:
  1. **Thumbnail**: Cached/fetched image with duration badge.
  2. **Title & URL**: Clickable markdown note link / source URL link.
  3. **Quality × Range**:
     - Standard: `1080p 60fps · 01:02 → 20:00`
     - Auto FPS: `720p auto · 00:00 → Full`
     - Audio: `Audio · 00:00 → Full` (no fps)
     - Fetched only: `🔵 Fetches Only` badge.
  4. **Platform**: `[🎬 YT]` or `[📸 IG]` badge.
  5. **Actions**:
     - `[🔄 Refresh]`: Re-fetch metadata.
     - `[⬇ Other Quality]` / `[⬇ Download]`: Dropdown of available format combinations. Existing downloaded qualities are greyed out. If clicked, opens mini confirmation popup:
       ```text
       Download 1080p 60fps
       Range: [ 01:02 → 20:00 ] ✏️
       [Cancel]  [⬇ Download Now]
       ```
     - `[📝 Open Note]`: Opens or creates the Obsidian note for this item.
     - `[🐛 Debug]`: Expands inline debug log for this specific row.

- **Sorting**:
  - Primary: Quality × FPS hierarchy (`Audio < 144p30 < 144p60 < ... < 4K60`).
  - Secondary: Start Time A → Z (`00:00` before `05:00`).
  - Default sort option is configurable in Settings.

---

### 4.2. Per-Row Inline Pipeline (`PipelineRow.ts`)
Rendered directly below an active, pending, or recently failed row in TableView:

```text
Active:
✅ Dependencies ──▶ ✅ Fetch Metadata ──▶ ⏳ Download [████░░ 45%] ──▶ ○ Finalize   [✕ Cancel]

Error:
✅ Dependencies ──▶ ❌ Fetch Metadata [Error: 403 Forbidden]                         [↺ Retry]

Cancelled:
✅ Dependencies ──▶ ✕ Cancelled                                                     [↺ Retry]
```

- **[✕ Cancel]**: Aborts the active child process/yt-dlp download, marks status as `Cancelled`.
- **[↺ Retry]**:
  - Automatically creates and inserts a **brand new row at the very TOP** of the table.
  - Preserves previous failed/cancelled row as dimmed (`opacity: 0.6`) for audit/troubleshooting.
- **Clickable Failure Step**: Clicking `❌` opens a popover tooltip with full error details and immediate retry button.

---

### 4.3. Debugging System (`DebugPanel.ts` & Inline Debug)

#### Top Debug Panel (Tab 1)
- **Scope Toggle**:
  - `(● This Download)`: Tail log of current URL form's fetch/download process.
  - `(○ All Instances)`: Aggregates logs across all parallel background downloads, prefixed with `[Task#N <Title>]`.
- **`[☑ +date_info]` Toggle**:
  - Checked: `YYYY-MM-DD_<Title> | [LEVEL] <message>`
  - Unchecked: `[HH:mm:ss] [LEVEL] <message>`
- **`[📋 Copy Debug Log]`**:
  - Copies formatted logs to clipboard (respecting the active date/prefix settings).

#### Inline Row Debug (Per Row)
- Clicking `[🐛]` on any row toggles a collapsible drawer beneath that row.
- Scoped strictly to that item's execution lifecycle.
- Multiple row debug drawers can be inspected simultaneously.

---

### 4.4. Footer: Global Task Manager (`TaskFooter.ts`)
Present on both `[📥 Download New]` and `[📊 Table View]`:

1. **Idle / Complete**:
   ```text
   ✅ All tasks complete (5 downloads)               [Clear History]
   ```
2. **Single Task in Progress**:
   ```text
   ⏳ Downloading: Obsidian Plugin Tutorial (1080p) [████░] 48%   [⊞ Background]
   ```
3. **Multiple Concurrent Downloads**:
   ```text
   ⏳ 2 / 5 downloading [██████░░░░] 40% (Total ETA: 45s)    [📋 View All Tasks]
   ```
   - Clicking `[📋 View All Tasks]` opens a modal or navigates to `[📊 Table View]` with active task filters.

---

## 5. Architectural Directory Layout

Refactoring `src/features/ytd/ui/CaptureModal.ts` (1,250+ lines) into modular components:

```text
src/features/ytd/
├── ui/
│   ├── YTDownloaderView.ts       # Obsidian ItemView orchestrator & tab controller
│   ├── components/
│   │   ├── DownloadHero.ts       # Thumbnail blurred hero background + fetch input
│   │   ├── DownloadForm.ts       # Quality pill buttons, FPS, Range slider, presets
│   │   ├── TableView.ts          # Universal table (Flat vs Grouped, 3 platform filter tabs)
│   │   ├── PipelineRow.ts        # Per-row 4-step pipeline with progress, cancel, retry
│   │   ├── DebugPanel.ts         # Top debug console (single vs aggregate, date toggle)
│   │   └── TaskFooter.ts         # Global persistent footer task tracker
│   └── modals/
│       ├── CaptureModal.ts       # (Optional legacy modal or deprecated wrapper)
│       └── QualitySelectModal.ts # Mini modal for "Other Quality" range selection
├── utils/                        # Existing helpers (formatters, yt-dlp wrapper, parsers)
└── types.ts                      # DownloadTask, ViewMode, TableFilter, QualityOption types
```

---

## 6. Migration & Open Decision

- **Primary interface**: `YTDownloaderView` (ItemView) becomes the default full-featured panel.
- **Legacy `CaptureModal`**: Kept as a lightweight fallback command or completely redirected to open `YTDownloaderView`.
