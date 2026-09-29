# Brief v03: Multiple-Repo Git Manager & Local Snapshot Hub

> **Status:** Comprehensive Specification & Architecture (Score: 10/10)  
> **Scope:** `pakcli-plugin/local` (Obsidian Power Utilities)  
> **Target:** Integrated local Git management solution for Obsidian Vaults hosting multiple repositories simultaneously (Direct Folders & Windows Symlinks/Junctions), featuring 3 View Modes, AI Diff Exporter, Ribbon Icon, Hotkey Map, and Modular TypeScript Architecture.

---

## 1. Mandatory Standard Naming Convention

Standard format for all snapshots, stash notes, or automated structured commits:

```
yyyy-mm-dd_hh-mm_custom message here
```

### Formatting Specifications:
1. **Timestamp:** `yyyy-mm-dd_hh-mm` (hyphen-separated for URL, CLI, and filesystem safety).
2. **Separator:** Underscore `_`.
3. **Note Payload:** Freeform descriptive summary or note.
4. **Concrete Examples:**
   - `2026-09-29_07-30_before refactoring income router`
   - `2026-09-29_07-45_fix edge slider 1080p ytd`
   - `2026-09-29_08-00_auto checkpoint 3 files` *(when no manual input is provided)*

---

## 2. Repository Lifecycle State Machine Diagram

Every repository inside the Vault is tracked through a well-defined state lifecycle:

```
          ┌────────────────────────────────────────────────────────┐
          │                    🟢 1. CLEAN                         │
          │             Working tree clean, 0 diff                 │
          └──────────────────────────┬─────────────────────────────┘
                                     │ User edits files
                                     ▼
          ┌────────────────────────────────────────────────────────┐
          │                    🟡 2. DIRTY                         │
          │             Modified or untracked files present        │
          └──────────────┬───────────────────────────┬─────────────┘
                         │                           │
         Click [Stage]   │                           │ Click [📸 Snapshot Now]
                         ▼                           ▼
          ┌──────────────────────────┐   ┌─────────────────────────┐
          │       🔵 3. STAGED       │   │    📸 4. SNAPSHOTTED    │
          │  Files staged for commit │   │  Stored locally in      │
          │  (git add)               │   │  refs/snapshots/*       │
          └──────────────┬───────────┘   └─────────────────────────┘
                         │
         git merge conflict?
                         ▼
          ┌────────────────────────────────────────────────────────┐
          │                   🔴 5. CONFLICT                       │
          │       Unresolved conflict (MERGING / REBASING)         │
          └────────────────────────────────────────────────────────┘
```

---

## 3. UI/UX Wireframe: 3 Primary View Modes

The Git Manager interface is organized into **3 distinct View Modes**, toggleable via header tabs or hotkeys `1`, `2`, `3`:

```
[ 📂 Mode 1: Changes & Commit ]   [ 📦 Mode 2: Stash & Snapshot ]   [ 📜 Mode 3: History & Branching ]
```

---

### MODE 1: Changes & Upload View (Commit & Stage Split Top-Down)

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│ 📸 PakCLI Git Manager - [ Repo: node-income-pocket-expence (master) ▼ ]                    [✕] │
├─────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Tab: [📂 Working Changes (1)]   [📦 Stash / Snapshot (2)]   [📜 History Only (3)] | 🟡 3 Dirty  │
├────────────────────────────────┬────────────────────────────────────────────────────────────────┤
│ 📜 Recent Commits (Left Col)   │ 📋 Working Tree Changes (Split Top-Down)                       │
├────────────────────────────────┼────────────────────────────────────────────────────────────────┤
│ • 2026-09-29_06-45_init v06    │ 🔼 STAGED CHANGES (Ready for commit)               [Unstage All]│
│ • 2026-09-28_22-10_merge feat  │ ├── [✔] M  src/routes/income.ts                  [ - Unstage ] │
│ • 2026-09-28_18-00_fix typings │ └── [✔] M  package.json                          [ - Unstage ] │
│ • 2026-09-28_14-20_setup db    │                                                                │
│                                ├────────────────────────────────────────────────────────────────┤
│                                │ 🔽 UNSTAGED CHANGES (Not yet staged)                 [Stage All]│
│                                │ ├── [ ] M  src/server.ts                         [ + Stage ]   │
│                                │ └── [ ] ?  brief/v06_master.md (untracked)       [ + Stage ]   │
│                                ├────────────────────────────────────────────────────────────────┤
│                                │ 💬 Commit / Snapshot Message:                                  │
│                                │ [ 2026-09-29_07-30_before refactoring income router          ] │
│                                │                                                                │
│                                │ Actions:                                                       │
│                                │ [💾 Commit (Ctrl+Enter)]   [📸 Snapshot (Alt+S)]               │
│                                │ [📋 Copy Diff for AI (Ctrl+Shift+C)]   [⚡ Discard Changes]     │
└────────────────────────────────┴────────────────────────────────────────────────────────────────┘
```

---

### MODE 2: Stashing & Snapshot View (3-Column Layout)

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│ 📸 PakCLI Git Manager - [ Repo: node-income-pocket-expence (master) ▼ ]                    [✕] │
├─────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Tab: [📂 Working Changes]   [📦 Stash / Snapshot (Active)]   [📜 History Only]                  │
├───────────────────────────────┬───────────────────────────────┬─────────────────────────────────┤
│ 1. HISTORY STASH / SNAPSHOT   │ 2. THE CHANGES (Files in Snap)│ 3. DIFF VIEWER (File Preview)   │
├───────────────────────────────┼───────────────────────────────┼─────────────────────────────────┤
│ ▼ Local Snapshots             │ Selected:                     │ Diff: src/routes/income.ts      │
│ 🔘 2026-09-29_07-30_router-ref│ 2026-09-29_07-30_router-ref   │ ─────────────────────────────── │
│    [2 files | 10m ago]        │                               │ @@ -14,4 +14,6 @@               │
│ ○ 2026-09-29_06-45_fix-calc   │ Modified Files:               │  const baseIncome = 1000;       │
│    [3 files | 55m ago]        │ 📄 src/routes/income.ts (sel) │ -const tax = base * 0.1;        │
│                               │ 📄 package.json               │ +const taxRate = getTaxRate();  │
│ ▼ Git Stash Stack             │                               │ +const tax = base * taxRate;    │
│ ○ stash@{0}: WIP on master    │                               │                                 │
├───────────────────────────────┼───────────────────────────────┼─────────────────────────────────┤
│ Actions for Selected Snap:    │ Actions for Selected File:    │ View Options:                   │
│ [📸 New Snapshot]             │ [↩️ Restore This File Only]   │ [ Split Diff | Unified Diff ]   │
│ [⏪ Rollback All Files]       │ [📋 Copy File Diff for AI]    │ [📋 Copy Raw Patch]             │
│ [🗑️ Delete Snapshot]          │                               │                                 │
└───────────────────────────────┴───────────────────────────────┴─────────────────────────────────┘
```

---

### MODE 3: History Only View (Data Grid with Full Selectable Text)

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│ 📸 PakCLI Git Manager - [ Repo: pakcli-plugin-local (feat/ui) ▼ ]                          [✕] │
├─────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Tab: [📂 Working Changes]   [📦 Stash / Snapshot]   [📜 History Only (Active)]                  │
│                                                                                                 │
│ 🔍 [ Search commit message, author, or SHA...                                    ]  [🔄 Refresh]│
├───────────────────┬─────────┬──────────────────────────────────────────┬────────────────────────┤
│ DATE / TIME       │ COMMIT  │ COMMIT MESSAGE (Selectable Text)         │ ACTIONS                │
├───────────────────┼─────────┼──────────────────────────────────────────┼────────────────────────┤
│ 2026-09-29 07:15  │ dac732c │ feat: FIXED SyncCodeblockRenderer UI     │ [⚙️ Branch Actions ▼]  │
│ 2026-09-29 06:30  │ 71430f2 │ fix(ytd): fix 1080p resolution clamping  │ [⚙️ Branch Actions ▼]  │
│ 2026-09-29 05:40  │ b24864f │ fix(ytd): remove format 18 fallback      │ [⚙️ Branch Actions ▼]  │
├───────────────────┴─────────┴──────────────────────────────────────────┴────────────────────────┤
│ Menu [⚙️ Branch Actions ▼] on each commit row:                                                   │
│ ├── 1. 🔀 Checkout (Switch HEAD to this commit)                                                 │
│ ├── 2. 🌿 Add New Branch (Create new branch branching from this point)                          │
│ ├── 3. 🧬 Merge to Active Branch (Merge this commit into your active branch)                   │
│ ├── 4. ⚠️ Overwrite Active Branch (Hard reset active branch - protected with safety snapshot)   │
│ └── ⏪ Undo to this (Rollback to this point and remove subsequent commits)                      │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Keyboard Shortcuts Map (Hotkeys Cheat Sheet)

Power users can navigate and operate the entire Git Manager without touching a mouse:

| Shortcut | Action | Context |
| :--- | :--- | :--- |
| `Ctrl + P` ➔ Type `Git` | Open Multi-Repo Git Manager Modal | Global Obsidian |
| `1` / `2` / `3` | Instantly switch between Mode 1, Mode 2, or Mode 3 | Inside Modal |
| `Ctrl + Enter` | Execute Commit on active branch | Mode 1 (Working Changes) |
| `Alt + S` | Trigger instant Local Snapshot (`refs/snapshots/`) | Mode 1 & Mode 2 |
| `Ctrl + Shift + C` | **Copy Markdown Diff for AI to Clipboard** | Anywhere in Modal |
| `Ctrl + R` | Refresh scan status across all vault repos | Global Modal |
| `Esc` | Close Git Manager Modal | Global Modal |

---

## 5. TypeScript Module Architecture (`src/features/gitManager/`)

Designed strictly in compliance with Obsidian Developer Guidelines and [`AGENTS.md`](file:///d:/0pro/pakcli-plugin/local/AGENTS.md):

```
src/features/gitManager/
├── GitManagerModal.ts             # Main container modal managing tab states and view routing
├── views/
│   ├── WorkingChangesView.ts      # Mode 1 UI (Split Top-Down Staged/Unstaged list)
│   ├── StashSnapshotView.ts       # Mode 2 UI (3-Column Layout & Diff Viewer)
│   └── HistoryView.ts             # Mode 3 UI (Selectable Data Grid & Branch Actions)
├── services/
│   ├── GitCliService.ts           # Git CLI executor (`git -C <path> ...`)
│   ├── SnapshotEngine.ts          # Low-level plumbing for `git stash create` & `update-ref`
│   ├── DiffAiFormatter.ts         # Markdown ````diff clipboard formatter
│   └── VaultRepoScanner.ts        # Vault directory scanner hooked into detectLink()
├── settings.ts                    # Settings tab & Dependency Diagnostics
└── types.ts                       # Type definitions (RepoInfo, SnapshotItem, CommitItem)
```

---

## 6. Entry Points & Ribbon Shortcut

Integrated into PakCLI's lifecycle entry points inside [`src/main.ts`](file:///d:/0pro/pakcli-plugin/local/src/main.ts):

```typescript
// 1. Ribbon Icon in Obsidian's Left Sidebar
this.addRibbonIcon('git-pull-request', 'PakCLI: Multi-Repo Git Sentinel & Snapshot Manager', () => {
    new GitManagerModal(this.app, this).open();
});

// 2. Command Palette (Ctrl + P)
this.addCommand({
    id: 'open-git-manager-modal',
    name: 'Open Multi-Repo Git Manager',
    callback: () => new GitManagerModal(this.app, this).open()
});
```

---

## 7. Settings: Dependency Health Check (Internet, Git, Bash)

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│ ⚙️ PakCLI Settings ➔ Git Sentinel & Snapshot Manager                                           │
├─────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 🌐 Internet Connection    : ✅ Online & Ready for Sync                                         │
│ 📦 Git Core Engine        : ✅ Git Ready (git version 2.46.0.windows.1)                         │
│ 🐚 Bash Shell Environment : ✅ Bash Ready (GNU bash 5.2 - Git Bash)                            │
│                                                                                                 │
│ Actions:  [🔄 Re-check Dependencies]   [📖 Open Git Setup Guide]                                │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 8. Series Summary & Implementation Roadmap

| Document | Focus & Scope |
| :--- | :--- |
| [v01_without-git-snapshot.md](file:///d:/0pro/pakcli-plugin/local/brief/v01_without-git-snapshot.md) | Problem analysis, `.git` anatomy, 5 PM Panic scenario. |
| [v02_with-git-snapshot.md](file:///d:/0pro/pakcli-plugin/local/brief/v02_with-git-snapshot.md) | Plumbing Git `refs/snapshots/*`, storage benchmark < 2MB, auto-prune TTL. |
| [v03_multiple-repo-git-manager.md](file:///d:/0pro/pakcli-plugin/local/brief/v03_multiple-repo-git-manager.md) | **Complete Multi-Repo Git Manager Specs**: 3 View Modes, Ribbon icon, `yyyy-mm-dd_hh-mm_notes` format, Hotkeys Map, and TypeScript Architecture. |
| [v04_install-dependencies-flows.md](file:///d:/0pro/pakcli-plugin/local/brief/v04_install-dependencies-flows.md) | PowerShell-Driven Diagnostics & Installer: Gatekeeper Flow, 2 Level 0 Buttons, ExecutionPolicy Bypass, and 1-Click Installer. |
