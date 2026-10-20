# 📌 Master Brief: YouTube Playlist Incremental Sync & Media Profile Fetcher (pakcli-local)

> **Feature Status**: `0` (Draft / Pending Implementation)  
> **Target Module**: `local` (`pakcli-local`)  
> **Platform**: Windows Desktop / Cross-platform (Electron)  
> **Date**: 2026-10-20  

---

## 1. Objective & Problem Statement
- **Problem**: 
  1. Users tracking YouTube playlists face massive bandwidth and storage waste: when a playlist updates (e.g. from 4 to 7 videos, or videos change position), traditional tools re-download everything from scratch or corrupt local playlist numbering (`[01]`, `[02]`, etc.).
  2. Users researching creators on Instagram and YouTube cannot quickly extract the latest N posts, first video frame poster thumbnails, first image of carousel posts, and full metadata directly into an Obsidian vault note.
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

## 2. Technical Architecture & Constraints
- **Platform Guards**: `Platform.isDesktopApp` (with Node `fs` & child_process for fast disk renames and `yt-dlp` execution).
- **Network / API Strategy**:
  - Primary: Obsidian `requestUrl` (bypasses browser CORS completely).
  - Auxiliary: `yt-dlp` CLI via `runCommand` (`--flat-playlist --dump-single-json` for instantaneous playlist structure retrieval in < 1 second).
- **Delta Engine State Machine**:
  - Content-Addressable cache keyed by `video_id`.
  - Local state stored in `.pakcli/playlists/<playlist_id>.json` or playlist folder metadata.
  - Safe rename operations with atomic checks to avoid collisions.

## 3. Implementation Plan & Files
| File | Status | Description |
| :--- | :---: | :--- |
| `local/docs/brief-playlist-sync-and-profile-fetcher.md` | ⏳ | Master feature brief |
| `local/src/features/ytd/types.ts` | ⏳ | Playlist sync & profile fetcher data types |
| `local/src/features/ytd/utils/playlistSync.ts` | ⏳ | Playlist delta diff, deduplication & file reordering engine |
| `local/src/features/ytd/utils/profileFetcher.ts` | ⏳ | Profile extractor for YouTube (@channel) & Instagram (@user) |
| `local/src/features/ytd/ui/modals/PlaylistSyncModal.ts` | ⏳ | Interactive UI modal for syncing playlists & previewing profiles |
| `local/src/main.ts` | ⏳ | Register command palette: "PakCLI: Sync YouTube Playlist / Profile" |

## 4. Acceptance Criteria Checklist
- [ ] Status 0 brief created and committed
- [ ] Playlist deep extraction via `yt-dlp` / RSS without slow full downloads
- [ ] Delta engine correctly detects new vs existing videos by `video_id`
- [ ] Reordered videos are moved/renamed locally with 0 bytes downloaded
- [ ] YouTube profile latest posts fetched with poster thumbnails and metadata
- [ ] Instagram profile latest posts fetched with first image/frame preview
- [ ] Obsidian Markdown Note created/updated with rich metadata table and frontmatter
- [ ] TypeScript compiles cleanly (`npm run build`) with zero errors
- [ ] Bundle size remains strictly under 5.0 MB
