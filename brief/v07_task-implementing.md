# Brief v07: Implementation & Architecture Specification — "Git: Manage This", Area Containment & Dual Gatekeeper Hub

> **Status:** ✅ COMPLETED & DEPLOYED  
> **Document:** `brief/v07_task-implementing.md`  
> **Target Version:** `pakcli-local@1.0.12+`  
> **Depends On:** `brief/v06_assign-folder-file-git-github.md`, `brief/v04_install-dependencies-flows.md`  
> **Scope:** `pakcli-plugin/local` — Task C: Context Menu Integration, Area Resolution, Dual Gatekeeper (Local Only vs GitHub), GitHub CLI Diagnostics, and Remote Sync Hub.

---

## 1. Executive Summary & Goals

PakCLI Git Sentinel introduces repository management directly from the Obsidian File Explorer context menu. Users can target any folder or note in their vault and assign it as a version-controlled repository in one of two modes:
1. **🔒 Mode 1: Local Git Only (Strictly Offline)** — Commits, branches, and non-destructive safety snapshots (`refs/snapshots/*`). Remote pushing is permanently blocked.
2. **🌐 Mode 2: Git + GitHub (Bidirectional Cloud Sync)** — Full GitHub integration with remote pushing, pulling, upstream branch tracking, and pre-sync safety snapshots.

All modes are guarded by an automated **Dependency Gatekeeper** that checks for Git and GitHub CLI (`gh`). If missing, cards are gracefully grayed out with a 3-button recovery suite (`[🔄 Quick Refresh]`, `[⬇️ Install]`, `[⚙️ Dependency Checker]`).

---

## 2. Core Architecture: The Area Containment Principle

In Obsidian, users frequently right-click either on folders or individual markdown notes. To preserve clean Git repository boundaries while providing seamless UX, the system enforces the **Area Containment Principle**:

```
Vault Root
└── Areas/
    ├── Work/                       <-- Target Area (Folder)
    │   ├── ProjectA/               <-- Target Area (Subfolder)
    │   │   ├── notes.md            <-- Right-click on File
    │   │   │                           ├── Area: Work/ProjectA/ (Containing Folder)
    │   │   │                           └── Sibling: todos.md (Included in Area)
    │   │   └── todos.md
    │   └── Meeting.md
```

### Resolution Rules (`AreaResolver.ts`):
1. **Right-Click on Folder (`TFolder`)**:
   - `targetType: 'folder'`
   - `areaFolderPath`: Absolute path of that folder.
   - Context Menu Title: `📸 Git: Manage This Folder...`
   - Scope: The folder and all its contents recursively.
2. **Right-Click on File (`TFile`)**:
   - `targetType: 'file'`
   - `areaFolderPath`: Absolute path of the **parent containing folder** (`file.parent.path`).
   - Context Menu Title: `📸 Git: Manage This Area (<parent_folder_name>)...`
   - Scope: Assigns the containing parent folder as the repository (encompassing the file and all sibling files in that area).
   - Captures `relativeFilePath` to enable note-scoped operations:
     - `📄 Snapshot This Note Only`
     - `📜 View Note Commit History`
     - `📋 Copy Note Diff for AI (Ctrl+Shift+C)`
     - `🔍 Open Containing Repo in Git Sentinel`

---

## 3. Dependency Diagnostics & Gatekeeper Architecture

### A. Extended Definitions (`DEP_DEFINITIONS` in `src/features/hub/depsTable.ts`)
```typescript
{
  name: "GitHub CLI (gh)",
  cmd: "gh",
  versionArg: "--version",
  whichCmd: (isWin: boolean) => (isWin ? "where.exe gh" : "which gh"),
  fallbackPaths: [
    "C:\\Program Files\\GitHub CLI\\gh.exe",
    "C:\\Program Files (x86)\\GitHub CLI\\gh.exe",
  ],
  installCmd: "winget install --id GitHub.cli -e --source winget",
  uninstallCmd: "winget uninstall --id GitHub.cli",
  hint: "Official GitHub command-line tool — required for GitHub auth, repos, and remote sync",
}
```

### B. Dependency Matrix & Gatekeeper Rules
| Target Mode | Required Dependencies | Fallback State | Available Actions |
| :--- | :--- | :--- | :--- |
| **🔒 Mode 1: Local Git Only** | `git` | Card grayed-out, radio disabled | `[🔄 Quick Refresh]` `[⬇️ Install Git]` `[⚙️ Go to Dependency Checker]` |
| **🌐 Mode 2: Git + GitHub** | `git` AND `gh` | Card grayed-out, radio disabled | `[🔄 Quick Refresh]` `[⬇️ Install GitHub CLI]` `[⚙️ Go to Dependency Checker]` |

### C. The 3-Button Action Suite
When a dependency is missing:
1. **`[🔄 Quick Refresh]`**:
   - Re-runs `psRunner` detection in the background without closing the modal.
   - Automatically unfreezes and activates the card if the dependency is newly detected on the system.
2. **`[⬇️ Install <tool>]`**:
   - Opens `ConsentModal` displaying command (`winget install --id GitHub.cli -e --source winget`).
   - Upon user consent, executes installation via PowerShell.
   - Auto-triggers `[Quick Refresh]` upon process completion.
3. **`[⚙️ Go to Dependency Checker]`**:
   - Closes modal and opens Obsidian Settings navigating to the PakCLI Git Sentinel tab.

---

## 4. UI / UX Design & Modals

### A. Dual Gatekeeper Modal (`RepoAssignModal.ts`)
```
┌────────────────────────────────────────────────────────────────────────┐
│  📦 Initialize Git Repository: "My Notes Area"                        │
│  📁 Location: D:\Vault\Areas\My Notes Area                             │
│                                                                        │
│  Select repository synchronization mode:                               │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ (🔘) 🔒 Mode 1: Local Git Only (Strictly Offline)               │  │
│  │ • Initializes local repository (git init).                       │  │
│  │ • Local commits & non-destructive snapshots (refs/snapshots/*). │  │
│  │ • Remote pushing is PERMANENTLY BLOCKED. Zero cloud exposure.    │  │
│  │ • Best for: Private journals, sensitive data, offline notes.     │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ (🔘) 🌐 Mode 2: Git + GitHub (Cloud Synchronization)             │  │
│  │ • Connects local commits to a remote GitHub repository.          │  │
│  │ • Supports push, pull, remote branch tracking.                   │  │
│  │ • Pre-sync automatic safety snapshots before push or pull.       │  │
│  │                                                                  │  │
│  │ GitHub Remote URL:                                               │  │
│  │ [ https://github.com/username/my-notes.git                     ] │  │
│  │                                                                  │  │
│  │ Default Branch: [ main ]                                         │  │
│  │                                                                  │  │
│  │ [ ] Automatically push after creating local commits              │  │
│  │ [⚡ Test Connection] (via gh auth / git ls-remote)                │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                        │
│  Initial Commit Message: [ Initial commit for area: My Notes Area ]    │
│                                                                        │
│                             [ Cancel ]   [ 🚀 Initialize Repository ]  │
└────────────────────────────────────────────────────────────────────────┘
```

### B. Single-File Commit History Modal (`FileHistoryModal.ts`)
- Shows reverse-chronological commits specifically modifying the selected note.
- Displays hash, author, relative timestamp, and commit message.
- Clicking a commit displays the file's diff with syntax highlighting (`+` additions, `-` deletions).
- Features a **`[📋 Copy File Patch]`** button for exporting diffs directly into AI prompts.

### C. Remote Sync Hub in Git Sentinel (`GitManagerModal.ts`)
- **Mode Badge**: Displays `🌐 GitHub` or `🔒 Local Only` tag next to repository name.
- **Ahead/Behind Counters**: Real-time sync tracker (e.g. `⬆️ 2 Ahead | ⬇️ 0 Behind`).
- **Sync Actions**:
  - `[⬆️ Push]`: Executes `git push origin <branch>` (with pre-push safety snapshot).
  - `[⬇️ Pull]`: Executes `git pull --rebase origin <branch>` (with pre-pull safety snapshot).
  - `[🔄 Sync]`: Pulls latest changes, then pushes unpushed commits.
  - `[⚙️ Mode]`: Opens mode settings to toggle remote configuration or convert to Local Only.

---

## 5. File System & Implementation Plan

```
src/
├── features/
│   ├── gitManager/
│   │   ├── GitManager.ts               # Lifecycle, command hooks, context menu init
│   │   ├── types.ts                    # RepoTargetMode, RepoRemoteConfig, ResolvedArea
│   │   ├── contextMenu.ts              # File-explorer right-click menu handler
│   │   ├── services/
│   │   │   ├── AreaResolver.ts         # Enforces Area Containment Principle (Folder vs File)
│   │   │   ├── GitCliService.ts        # Extended with init, remote, push, pull, file diff/log
│   │   │   ├── SnapshotEngine.ts       # Non-destructive snapshots (refs/snapshots/*)
│   │   │   ├── VaultRepoScanner.ts     # Discovers repos, extracts remote URLs & sync status
│   │   │   └── DiffAiFormatter.ts      # LLM diff compression & clipboard copy
│   │   └── ui/
│   │       ├── RepoAssignModal.ts      # Dual gatekeeper modal with 3-button action cards
│   │       ├── FileHistoryModal.ts     # Single-note commit timeline & patch viewer
│   │       ├── GitManagerModal.ts      # Multi-repo manager with remote sync toolbar
│   │       └── DepsPanel.ts            # Dependency health checks (pwsh, git, gh)
│   └── hub/
│       └── depsTable.ts                # DEP_DEFINITIONS including GitHub CLI (gh)
└── styles/
    ├── main.scss                       # Imports gitManager.scss
    └── gitManager.scss                 # Scoped .git-manager-* styling using Obsidian theme tokens
```

---

## 6. Implementation Phase Breakdown

| Phase | Component | Status | Notes |
| :--- | :--- | :---: | :--- |
| **Phase 1** | **Dependency Diagnostics** | ✅ Done | Added `gh` to `DEP_DEFINITIONS` and updated `DepsPanel.ts`. |
| **Phase 2** | **Types & Data Contracts** | ✅ Done | Added `RepoTargetMode`, `RepoRemoteConfig`, `ResolvedArea`, and `repoConfigs` in `types.ts` & `settings.ts`. |
| **Phase 3** | **Git CLI Engine Extensions** | ✅ Done | Added `initRepo`, `getRemoteUrl`, `setRemoteUrl`, `removeRemote`, `push`, `pull`, `getFileDiff`, `getFileLog`, `checkGhInstalled`. |
| **Phase 4** | **Area Resolver Service** | ✅ Done | Created `AreaResolver.ts` implementing the Area Containment Principle. |
| **Phase 5** | **File Explorer Context Menu** | ✅ Done | Created `contextMenu.ts` and registered with `plugin.registerEvent(app.workspace.on('file-menu'))`. |
| **Phase 6** | **Dual Gatekeeper Modal** | ✅ Done | Created `RepoAssignModal.ts` with Mode 1 & Mode 2 cards, grayed-out checks, and 3-button actions. |
| **Phase 7** | **Single-File Commit History** | ✅ Done | Created `FileHistoryModal.ts` with note-scoped commit log, patch preview, and copy button. |
| **Phase 8** | **Remote Sync Hub** | ✅ Done | Updated `GitManagerModal.ts` with Mode Badges, Ahead/Behind indicators, `[⬆️ Push]`, `[⬇️ Pull]`, and `[🔄 Sync]`. |
| **Phase 9** | **Scoped Styling** | ✅ Done | Added `.git-manager-mode-card`, `.is-disabled`, `.git-manager-deps-fallback`, and file history styling in `gitManager.scss`. |
| **Phase 10**| **Build & Vault Deployment** | ✅ Done | `npm run build` compiled with 0 errors and automatically deployed to Obsidian vault plugin directory. |

---

## 7. Safety, Recovery & Error Handling Guarantees

1. **Pre-Sync Safety Snapshots**:
   - Before executing `git push` or `git pull --rebase`, `GitCliService` triggers `SnapshotEngine.createSnapshot(repoPath, 'pre-sync-safety')`.
   - Snapshots are saved to `refs/snapshots/*` without affecting working tree or index.
2. **Local Git Only Protection**:
   - If a repository is configured as `local-only`, `GitManagerModal` hides remote sync buttons and disables pushing commands.
   - Any remote URLs on local-only repos are wiped or prevented from being accessed.
3. **Graceful Subprocess Execution**:
   - All Git and gh CLI operations run through `PowerShellRunner` with standard error capturing and clean notification notices.
   - Never blocks the Obsidian UI thread.

---

## 8. Verification & QA Matrix

| Test Case | Expected Behavior | Result |
| :--- | :--- | :---: |
| **Right-click unversioned folder** | Shows `📸 Git: Manage This Folder...`. Opens `RepoAssignModal` targeting folder. | ✅ Verified |
| **Right-click unversioned note** | Shows `📸 Git: Manage This Area (<parent>)...`. Targets parent containing folder. | ✅ Verified |
| **Git not installed** | Both Mode 1 and Mode 2 are grayed out. 3-button recovery suite is rendered. | ✅ Verified |
| **gh not installed** | Mode 1 (Local) is active. Mode 2 (GitHub) is grayed out with 3-button recovery suite. | ✅ Verified |
| **Click [Quick Refresh]** | In-place audit without closing modal; activates card if tool installed. | ✅ Verified |
| **Click [Install GitHub CLI]** | Opens `ConsentModal` ➔ runs `winget install` ➔ auto-refreshes state. | ✅ Verified |
| **Init Mode 1 (Local Only)** | Runs `git init`, creates initial commit, saves `mode: 'local-only'`, opens Git Sentinel. | ✅ Verified |
| **Init Mode 2 (GitHub)** | Runs `git init`, adds remote `origin`, commits, saves `mode: 'github'`. | ✅ Verified |
| **Right-click note in repo** | Shows `📜 View Note Commit History`. Opens note commits and diffs. | ✅ Verified |
| **Production Build** | `npm run build` exits code 0. Deploys `main.js`, `manifest.json`, `styles.css`. | ✅ Verified |
