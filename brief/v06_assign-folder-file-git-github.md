# Brief v06: "Git: Manage This" — Folder & File-Level Repository Assignment, Dual-Mode Hub, and GitHub CLI (gh) Gatekeeper

> **Status:** Comprehensive Specification & Architecture  
> **Document:** `brief/v06_assign-folder-file-git-github.md` (renamed from v08)  
> **Target:** PakCLI Local — Git Sentinel Extension for Obsidian  
> **Scope:** File Explorer Right-Click Menu (`Git: Manage This...`), Area Containment Principle, Dual Target Mode (Local Git Only 🔒 vs. Git + GitHub 🌐), GitHub CLI (`gh`) Dependency Diagnostics, Mode 2 Gatekeeper (Grayed out with 1-Click Install button & Link to Checker), and Single-File Actions.

---

## 1. Executive Summary & Core Principles

Obsidian vaults house both private notes and public/team code repositories. Users need an intuitive way to manage Git repositories right from the file explorer:
1. **Right-Click Area Containment:**
   - **Click on a Folder (`TFolder`):** Target Area = **The whole folder and everything inside it**.
   - **Click on a File (`TFile`):** Target Area = **The parent containing folder** (the file and its siblings). Initializing or assigning at the file level automatically sets up the containing folder as the repository!
2. **Dual Target Mode:**
   - **Mode 1: Local Git Only (🔒 Offline Sentinel):** Strict offline repository (`git init`). Local commits & non-destructive snapshots (`refs/snapshots/*`). Remote pushes are permanently blocked — zero accidental cloud exposure.
   - **Mode 2: Git + GitHub (🌐 Synchronized Repository):** Local tracking + GitHub remote (`origin`). Enables 1-click Push, Pull, and Sync.
3. **GitHub CLI (`gh`) Gatekeeper:**
   - Mode 2 requires both **Git** and the **GitHub CLI (`gh`)**.
   - If `gh` is **missing**:
     - Mode 2 is **grayed out / disabled**.
     - An alert banner displays: `⚠️ GitHub CLI (gh) is required for GitHub authentication and sync.`
     - Quick action buttons are provided directly inside the modal:
       - `[⬇️ Install GitHub CLI (gh)]` (ConsentModal → `winget install GitHub.cli` via `psRunner`).
       - `[⚙️ Go to Dependency Checker]` (jumps to the focused Git Sentinel dependency table).

---

## 2. GitHub CLI (`gh`) in Diagnostics (`depsTable.ts`)

Add `GitHub CLI (gh)` to `DEP_DEFINITIONS`:

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
  hint: "Official GitHub command-line tool — required for GitHub auth, clone, and remote sync",
}
```

The focused Git Sentinel dependency checker now audits:
- **PowerShell** (Automation engine)
- **Git** (Core version control)
- **GitHub CLI (gh)** (GitHub authentication & remote bridge)

---

## 3. UI / UX Wireframes: Right-Click "Git: Manage This..."

### 3.1 Right-Click on a FOLDER (`TFolder`)

```
┌────────────────────────────────────────────────────────┐
│ Open in new tab                                        │
│ Reveal in system explorer                              │
│ ...                                                    │
├────────────────────────────────────────────────────────┤
│ 📸 Git: Manage This Folder...                          │
│   ├── [If NOT a Git repo yet:]                         │
│   │   ├── ⚡ Create as Local Git Repo (🔒)             │
│   │   └── 🌐 Create & Connect to GitHub (🐙)           │
│   │                                                    │
│   └── [If ALREADY a Git repo:]                         │
│       ├── 📸 Snapshot Folder (Alt+S)                   │
│       ├── ⚙️ Configure Mode (🔒 Local / 🌐 GitHub)     │
│       ├── ⬆️ Push to GitHub (if remote active)         │
│       ├── ⬇️ Pull from GitHub (if remote active)        │
│       └── 🖥️ Open in Git Sentinel                      │
└────────────────────────────────────────────────────────┘
```

### 3.2 Right-Click on a FILE (`TFile`)

```
┌────────────────────────────────────────────────────────┐
│ Open in new tab                                        │
│ Rename...                                              │
│ ...                                                    │
├────────────────────────────────────────────────────────┤
│ 📸 Git: Manage This Area (Folder: <parent_name>)...    │
│   ├── [If Parent Area NOT a Git repo yet:]             │
│   │   ├── ⚡ Initialize Containing Folder as Local Repo│
│   │   └── 🌐 Initialize & Link Containing Folder to GH │
│   │                                                    │
│   └── [If Parent Area IS a Git repo:]                  │
│       ├── 📄 Snapshot This File Only                   │
│       ├── 📸 Snapshot Whole Area (<parent_name>)       │
│       ├── 📜 View This File's Commit History           │
│       ├── 📋 Copy File Diff for AI (Ctrl+Shift+C)      │
│       └── 🔍 Open Containing Repo in Git Sentinel      │
└────────────────────────────────────────────────────────┘
```

---

## 4. UI Wireframe: "Assign Git Mode" Modal with Dual Gatekeeper

When user right-clicks any folder or file and selects **"Git: Manage This..."**, the `RepoAssignModal` immediately audits the system dependencies for **both Mode 1 and Mode 2**:

### 4.1 Dependency Requirement Matrix:

| Mode | Required Dependencies | When Missing | Actions Available on Card |
| :--- | :--- | :--- | :--- |
| **Mode 1 (Local Git Only 🔒)** | `Git` (+ `PowerShell`) | **Mode 1 is GRAYED OUT** | `[🔄 Quick Refresh]` `[⬇️ Install Git]` `[⚙️ Go to Dependency Checker]` |
| **Mode 2 (Git + GitHub 🌐)** | `Git` AND `GitHub CLI (gh)` | **Mode 2 is GRAYED OUT** | `[🔄 Quick Refresh]` `[⬇️ Install GitHub CLI]` `[⚙️ Go to Dependency Checker]` |

---

### 4.2 Comprehensive Wireframe: Missing Dependencies on Mode 1 & Mode 2

```
┌────────────────────────────────────────────────────────────────────────┐
│ 📸 Git: Manage This Area                                         [✕]   │
├────────────────────────────────────────────────────────────────────────┤
│ Target Folder: D:\Vault\projects\custom-scripts                        │
│ Scope        : Entire containing folder (4 files, 2 subdirectories)    │
│ Status       : 🟡 Not yet initialized as a Git Repository              │
├────────────────────────────────────────────────────────────────────────┤
│ Select Target Mode:                                                    │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ [GRAYED OUT IF GIT MISSING] 🔒 Mode 1: Local Git Only           │  │
│  │ • Initializes local repository (git init).                       │  │
│  │ • Local commits & non-destructive snapshots (refs/snapshots/*). │  │
│  │ • Remote pushing is PERMANENTLY BLOCKED. Zero cloud exposure.    │  │
│  │                                                                  │  │
│  │ ⚠️ Git is required for local versioning.                         │  │
│  │    It is not currently detected on your system.                  │  │
│  │                                                                  │  │
│  │ [🔄 Quick Refresh]  [⬇️ Install Git]  [⚙️ Go to Dependency Checker]│  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ [GRAYED OUT IF GH MISSING] 🌐 Mode 2: Git + GitHub               │  │
│  │ • Initializes local repository + connects remote (origin).       │  │
│  │ • Enables 1-click Push, Pull, and Remote Sync.                   │  │
│  │                                                                  │  │
│  │ ⚠️ GitHub CLI (gh) is required for GitHub authentication.         │  │
│  │    It is not currently detected on your system.                  │  │
│  │                                                                  │  │
│  │ [🔄 Quick Refresh]  [⬇️ Install GitHub CLI]  [⚙️ Go to Dependency Checker] │
│  └──────────────────────────────────────────────────────────────────┘  │
├────────────────────────────────────────────────────────────────────────┤
│ Actions:                                                               │
│                                         [ Cancel ]   [ ⚡ Initialize ] │
└────────────────────────────────────────────────────────────────────────┘
```

---

### 4.3 Wireframe: All Dependencies Ready (Both Modes Enabled)

```
┌────────────────────────────────────────────────────────────────────────┐
│ 📸 Git: Manage This Area                                         [✕]   │
├────────────────────────────────────────────────────────────────────────┤
│ Target Folder: D:\Vault\projects\custom-scripts                        │
│ Scope        : Entire containing folder (4 files, 2 subdirectories)    │
│ Status       : 🟡 Not yet initialized as a Git Repository              │
├────────────────────────────────────────────────────────────────────────┤
│ Select Target Mode:                                                    │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ (🔘) 🔒 Mode 1: Local Git Only (Strictly Offline)               │  │
│  │ • Initializes local repository (git init).                       │  │
│  │ • Local commits & non-destructive snapshots (refs/snapshots/*). │  │
│  │ • Remote pushing is PERMANENTLY BLOCKED. Zero cloud exposure.    │  │
│  │ • Best for: Private journals, sensitive data, offline scratch.   │  │
│  │ ✅ Git Ready (git version 2.54.0)                                │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ ( ) 🌐 Mode 2: Git + GitHub (Synchronized Repository)            │  │
│  │ • Initializes local repository + connects remote (origin).       │  │
│  │ • Enables 1-click Push, Pull, and Remote Sync.                   │  │
│  │ • Best for: Code projects, shared templates, public notes.       │  │
│  │ ✅ GitHub CLI Ready (gh version 2.56.0)                          │  │
│  │                                                                  │  │
│  │ GitHub Remote URL:                                               │  │
│  │ [ https://github.com/username/custom-scripts.git              ]  │  │
│  │ Default Branch: [ main ▼ ]    [ ] Auto-push on commit            │  │
│  └──────────────────────────────────────────────────────────────────┘  │
├────────────────────────────────────────────────────────────────────────┤
│ Actions:                                                               │
│                                         [ Cancel ]   [ ⚡ Initialize ] │
└────────────────────────────────────────────────────────────────────────┘
```

---

### 4.4 The 3 Action Buttons Lifecycle

Whenever Mode 1 or Mode 2 has a missing dependency, its card displays 3 dedicated buttons:
1. **`[🔄 Quick Refresh]`**:
   - Re-evaluates `checkSingleDep(def, isWin)` asynchronously in-place.
   - Shows inline spinner `🔍 Re-checking...` for 1-2 seconds.
   - If the user installed the tool externally (e.g. from a terminal or installer), clicking this button immediately removes the grayed-out state and activates the mode card without reloading Obsidian!
2. **`[⬇️ Install <Dependency>]`**:
   - Opens `ConsentModal.ask(...)` displaying the exact winget command.
   - Runs `runPsCommand(...)` with temporary bypass.
   - Shows progress spinner inside the card: `⏳ Installing <tool>...`.
   - On exit code 0, automatically triggers **Quick Refresh** and transitions the card to enabled (`✅ Ready!`).
3. **`[⚙️ Go to Dependency Checker]`**:
   - Closes `RepoAssignModal` and opens Obsidian Settings at **PakCLI Settings ➔ Git Sentinel** where the full diagnostics table with versions, paths, and logs can be reviewed.

---

## 5. Area Resolution Engine Specification

```typescript
export interface ResolvedArea {
  targetType: 'folder' | 'file';
  absPath: string;           // file or folder absolute path
  areaFolderPath: string;    // always the containing directory
  areaFolderName: string;    // directory basename
  isGitRepo: boolean;        // true if areaFolderPath has a .git
  gitRootPath?: string;      // root of the repo (area or ancestor)
  relativeFilePath?: string; // relative to git root (if target was a file)
}
```

### Algorithm:
1. If target is `TFolder`:
   - `areaFolderPath = getAbsolutePath(target.path)`
2. If target is `TFile`:
   - `areaFolderPath = getAbsolutePath(target.parent.path)`
   - `relativeFilePath = target.name`
3. Git Status Inspection:
   - Check if `areaFolderPath` contains `.git` (`GitCliService.isGitRepo(areaFolderPath)`).
   - If not, check if any ancestor directory up to Vault Root is a git repository (`git rev-parse --show-toplevel`).

---

## 6. Dependency & Gatekeeper Service

```typescript
export interface GitSentinelDepsState {
  gitInstalled: boolean;
  gitVersion?: string;
  ghInstalled: boolean;
  ghVersion?: string;
  psInstalled: boolean;
}

export class GitDepsChecker {
  static async check(): Promise<GitSentinelDepsState> {
    // Uses checkSingleDep for Git and GitHub CLI
  }
}
```

When `[⬇️ Install GitHub CLI (gh)]` is clicked in the modal:
1. Opens `ConsentModal.ask(this.app, psExe, "winget install --id GitHub.cli -e --source winget")`.
2. Upon user confirmation, runs installation with `runPsCommand`.
3. In-modal spinner: `⏳ Installing GitHub CLI (gh)...`.
4. On completion, automatically rescans and re-enables Mode 2 with a success badge: `✅ GitHub CLI Ready!`.

---

## 7. Implementation Checklist

- [ ] **Phase 1: Dependency Update (`depsTable.ts`)**
  - Add `GitHub CLI (gh)` to `DEP_DEFINITIONS`.
  - Update `DepsPanel.ts` to include `GitHub CLI (gh)` in `gitDefs`.
- [ ] **Phase 2: Types & Storage**
  - Add `RepoTargetMode`, `RepoRemoteConfig`, `ResolvedArea` to `types.ts`.
  - Add `repoConfigs` map to `settings.ts`.
- [ ] **Phase 3: Area Resolver & Context Menu**
  - Create `services/AreaResolver.ts`.
  - Create `contextMenu.ts` for Obsidian `file-menu` (Folder & File).
- [ ] **Phase 4: Gatekeeper & RepoAssignModal**
  - Create `ui/RepoAssignModal.ts` with Mode 1 & Mode 2.
  - Implement grayed-out Mode 2 when `gh` is missing + Install & Link buttons.
- [ ] **Phase 5: Single-File Modals & Actions**
  - Create `ui/FileHistoryModal.ts` for focused note history.
  - Implement single-file snapshot & diff.
- [ ] **Phase 6: Remote Sync in Git Sentinel**
  - Add `[⬆️ Push]`, `[⬇️ Pull]`, and `[🔄 Sync]` buttons in `GitManagerModal.ts`.
- [ ] **Phase 7: Build & Verification**
  - `npm run build` and end-to-end testing.
