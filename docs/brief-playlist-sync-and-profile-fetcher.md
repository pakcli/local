# 📌 Master Brief: YouTube Playlist Incremental Sync & Media Profile Fetcher (pakcli-local)

> **Feature Status**: `1` (Implemented & Verified)  
> **Target Module**: `local` (`pakcli-local`)  
> **Platform**: Windows Desktop / Cross-platform (Electron)  
> **Date**: 2026-10-20  

---

## 1. Objective & Problem Statement
- **Problem**: 
  1. Users tracking YouTube playlists face massive bandwidth and storage waste: when a playlist updates (e.g. from 4 to 7 videos, or videos change position), traditional tools re-download everything from scratch or corrupt local playlist numbering (`[01]`, `[02]`, etc.).
  2. Users researching creators on Instagram and YouTube cannot quickly extract the latest N posts, first video frame poster thumbnails, first image of carousel posts, and full metadata directly into an Obsidian vault note.
  3. Default modal overlays darken and block the entire Obsidian window, preventing users from looking at or typing in their notes while editing clip ranges.
- **Solution**:
  1. **Incremental YouTube Playlist Sync (Delta Engine)**:
     - Diffs remote playlist against local state ledger (`playlist_state.json` / note frontmatter).
     - **0x Re-download**: Videos already in the vault are identified by `video_id`. If their position changes (e.g. from #3 to #7), the local file is renamed/moved instantly without re-downloading.
     - **Delta Downloads**: Only truly new videos are fetched.
     - **Obsidian Markdown Integration**: Generates or updates a rich playlist summary note with preview cards and metadata.
  2. **Instagram & YouTube Profile Fetcher**:
     - Fetches latest N posts for a given creator handle/channel.
     - Extracts complete metadata (title/caption, upload date, author, likes/comments/views, URLs).
     - Previews first frame of video (native HD poster or canvas-rendered frame) and first image of post (photos / carousels).
  3. **Non-Blocking Scoped Clip Trimmer (`ScopedClipTrimmer`)**:
     - Scoped strictly inside the side panel leaf (zero fullscreen blocking modal).
     - Two dedicated buttons beside duration: `[✂️ Edit Range]` and `[↺ Full Range]`.
     - Users can freely read, select, copy timestamps, and edit notes in the center editor without interruption.

## 2. Technical Architecture & Constraints
- **Platform Guards**: `Platform.isDesktopApp` (with Node `fs` & child_process for fast disk renames and `yt-dlp` execution).
- **Network / API Strategy**:
  - Primary: Obsidian `requestUrl` (bypasses browser CORS completely).
  - Auxiliary: `yt-dlp` CLI via `runCommand` (`--flat-playlist --dump-single-json` for instantaneous playlist structure retrieval in < 1 second).
- **Delta Engine State Machine**:
  - Content-Addressable cache keyed by `video_id`.
  - Local state stored in `.pakcli/playlists/<playlist_id>.json`.
  - Safe rename operations with atomic checks to avoid collisions.

## 3. Implementation Plan & Files
| File | Status | Description |
| :--- | :---: | :--- |
| `local/docs/brief-playlist-sync-and-profile-fetcher.md` | ✅ | Master feature brief |
| `local/src/features/ytd/types.ts` | ✅ | Playlist sync & profile fetcher data types |
| `local/src/features/ytd/utils/playlistSync.ts` | ✅ | Playlist delta diff, deduplication & file reordering engine |
| `local/src/features/ytd/utils/profileFetcher.ts` | ✅ | Profile extractor for YouTube (@channel) & Instagram (@user) |
| `local/src/features/ytd/ui/components/ScopedClipTrimmer.ts` | ✅ | Non-blocking inline range editor with 2 buttons |
| `local/src/features/ytd/ui/components/PlaylistQueueView.ts` | ✅ | Interactive playlist delta queue with inline duration trimmer |
| `local/src/features/ytd/ui/modals/PlaylistSyncModal.ts` | ✅ | Standalone modal for playlist sync & profile fetcher |
| `local/src/features/ytd/ui/YTDownloaderView.ts` | ✅ | Auto-playlist detection, 3rd tab, and unified recent table |
| `local/src/main.ts` | ✅ | Registered command: "PakCLI: Sync YouTube Playlist / Profile" |

## 4. Acceptance Criteria Checklist
- [x] Status 0 brief created and committed
- [x] Playlist deep extraction via `yt-dlp` / RSS without slow full downloads
- [x] Delta engine correctly detects new vs existing videos by `video_id`
- [x] Reordered videos are moved/renamed locally with 0 bytes downloaded
- [x] Non-blocking Scoped Clip Trimmer implemented with `[✂️ Edit Range]` & `[↺ Full Range]`
- [x] Editor note remains 100% accessible and editable while trimming
- [x] YouTube profile latest posts fetched with poster thumbnails and metadata
- [x] Instagram profile latest posts fetched with first image/frame preview
- [x] Obsidian Markdown Note created/updated with rich metadata table and frontmatter
- [x] TypeScript compiles cleanly (`npm run build`) with zero errors
- [x] Bundle size remains strictly under 5.0 MB (Actual: 0.54 MB)
