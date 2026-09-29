# Brief v04: PowerShell-Driven Dependency Diagnostics & Installation Flows

> **Status:** Architecture & Workflow Specification (Score: 10/10)
> **Scope:** `pakcli-plugin/local` (Hub, Git Manager, YTD, & Symlink Manager)
> **Core Principle:** **PowerShell as the Single Master Engine**. All environment diagnostics and installation actions must be executed via modular, tiered PowerShell scripts, featuring security consent modal (`ExecutionPolicy Bypass`), 2-button Level 0 resolver, offline fallbacks, and **per-feature-tab focused dependency panels**.

---

## 1. Philosophy & Mental Model: "The Gatekeeper Flow"

Within the PakCLI Suite, **PowerShell (`pwsh` or `powershell.exe`) serves as the "Master Conductor"**:

```
                               ┌────────────────────────────────────────────────────────┐
                               │           LEVEL 0: POWERSHELL GATEKEEPER               │
                               │  Is pwsh or powershell.exe detected on the system?     │
                               └──────────────────────────┬─────────────────────────────┘
                                                          │
                             ┌────────────────────────────┴───────────────────────────┐
                             │                                                        │
                      [ ❌ NOT DETECTED ]                                      [ ✅ DETECTED ]
                             │                                                        │
              Standard Features Remain Active!                                  Engine Online!
             (Reading notes, preview, copypaste)                                      │
                             │                                                        ▼
              Diagnostic Dashboard Suspended                               ┌─────────────────────┐
              2 Solution Buttons:                                          │ LEVEL 1: DIAGNOSE   │
              [🏪 MS Store] / [🌐 Web Download]                            │  All Dependencies   │
                                                                           └──────────┬──────────┘
                                                                                      │
                                                               ┌──────────────────────┼──────────────────────┐
                                                               ▼                      ▼                      ▼
                                                           [📦 GIT]               [🎬 YTD]              [🔗 SYMLINK]
                                                           git, bash          yt-dlp, ffmpeg         Dev Mode, Junction
                                                               │                      │                      │
                                                               └──────────────────────┼──────────────────────┘
                                                                                      │
                                                                                      ▼
                                                                           ┌─────────────────────┐
                                                                           │ LEVEL 2: INSTALLER  │
                                                                           │ 1-Click via PS1     │
                                                                           │ (winget / direct)   │
                                                                           └─────────────────────┘
```

---

## 2. Dependency Breakdown per Module

| Feature Module | Target Dependency | Detection Method (PowerShell) | Automated Installation (PowerShell) |
| :--- | :--- | :--- | :--- |
| **Level 0: Core Engine** | **PowerShell** (`pwsh` / `powershell.exe`) | Node `child_process.exec("where.exe pwsh")` | 2 Buttons: MS Store Protocol / Web Link |
| **Git Manager** | **Git CLI** & **Git Bash** | `git --version`, `where.exe git`, `bash --version` | `winget install --id Git.Git -e --source winget` |
| **YTD Capture** | **yt-dlp** & **ffmpeg** | `yt-dlp --version`, `ffmpeg -version` | `winget install yt-dlp.yt-dlp` & `winget install Gyan.FFmpeg` |
| **Symlink Manager** | **Developer Mode** & **Junction** | Registry query `HKLM:\...\ AppModelUnlock` | Elevated script to enable Dev Mode without reboot |

---

## 3. Per-Feature-Tab Dependency Panel (Design Rule)

> [!IMPORTANT]
> **Every feature settings tab must include its own focused dependency panel.** This is not optional — it is the primary mechanism for users to discover and fix missing dependencies without leaving the context of the feature they are configuring.

### 3.1 Design Rule

Each settings tab that has external dependencies (Git, yt-dlp, etc.) **must** render a compact dependency health panel scoped to that feature's required tools only.

**Do NOT show all system deps on every tab.** The global "Setup & Dependencies" hub remains for full-system audit. Per-tab panels show only what that specific tab needs.

```
┌─ Pattern for every feature settings tab ───────────────────────────────────────┐
│                                                                                │
│  [Feature Name] Settings                                                       │
│  ─────────────────────────────────────────────────────────────────────         │
│  [feature-specific settings here...]                                           │
│                                                                                │
│  ──────────────────────────────────────────────────────────────────────────    │
│  ⚙️ Dependencies for [Feature Name]                              [🔍 Check]   │
│  ──────────────────────────────────────────────────────────────────────────    │
│  │ Tool        │ Status │ Version     │ Action                             │   │
│  │ ─────────── │ ────── │ ─────────── │ ────────────────────────────────── │   │
│  │ PowerShell  │ ✅ OK  │ pwsh 7.4.2  │ —                                  │   │
│  │ [dep 1]     │ ✅ OK  │ v2026.03.15 │ —                                  │   │
│  │ [dep 2]     │ ❌     │ not found   │ [⬇️ Install]                       │   │
│                                                                                │
└────────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Per-Feature Dependency Map

| Settings Tab | Deps to Show in Tab Panel | Global Hub |
| :--- | :--- | :--- |
| **YTD Capture** | PowerShell, yt-dlp, ffmpeg | Full audit |
| **Git Manager** | PowerShell, Git, Bash (Git Bash) | Full audit |
| **Symlink Manager** | PowerShell, Developer Mode status | Full audit |
| **PakCLI Agent** | PowerShell, Python 3, pip, agy (Antigravity CLI) | Full audit |
| **Hub / Setup tab** | ALL — PowerShell, Git, yt-dlp, ffmpeg, Python, pip, agy | — |

### 3.3 Implementation Pattern

Each feature tab renders a focused deps panel using the **same shared `renderDepsTable` function** from `depsTable.ts`, but passes a filtered subset of `DEP_DEFINITIONS`:

```ts
// Example: Git Manager settings tab — only shows relevant deps
const GIT_DEPS = DEP_DEFINITIONS.filter(d =>
  ["PowerShell", "git"].includes(d.name)
);

const doCheck = async () => {
  tableContainer.empty();
  tableContainer.createDiv({ cls: "pakcli-deps-loading", text: "🔍 Checking Git dependencies…" });
  const results = await Promise.all(GIT_DEPS.map(d => checkSingleDep(d, isWin)));
  renderDepsTable(tableContainer, results, doCheck, ctx);
};
```

```ts
// Example: YTD settings tab — shows yt-dlp + ffmpeg + PowerShell only
const YTD_DEPS = DEP_DEFINITIONS.filter(d =>
  ["PowerShell", "yt-dlp", "ffmpeg"].includes(d.name)
);
```

### 3.4 Visual Behavior Rules

- Panel header shows: **"⚙️ Dependencies for [Feature Name]"** + `[🔍 Check]` button (right-aligned).
- Initial state: **not auto-checked** — user clicks `[🔍 Check]` to trigger the scan (respects startup performance, per AGENTS.md).
- On missing dep: Install button is **active**, runs via `psRunner.ts` + consent gate.
- On all deps OK: Show a green summary banner: **"✅ All dependencies for [Feature] are ready."**
- Level 0 missing (no PowerShell): Show the 2-button resolver inline in the panel (compact version of Wireframe A below).

---

## 4. UI/UX Wireframe Diagnostics & Installation Flows

### Wireframe A: Level 0 Condition (PowerShell Missing - 2 Resolution Buttons)

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│ ⚙️ PakCLI Settings ➔ Setup & Dependencies                                                       │
├─────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                 │
│  ⚠️ PowerShell Engine Required for Diagnostics & Automated Installation                        │
│                                                                                                 │
│  Hello lad! Your note editing and markdown preview capabilities continue to work normally.      │
│  However, to perform health diagnostics (Git, yt-dlp, Symlink) and execute 1-click installs,   │
│  PakCLI requires an active PowerShell installation on your Windows device.                      │
│                                                                                                 │
│  Detected System Environment:                                                                   │
│  🖥️ OS: Windows 11 (x64)  |  Status: ❌ PowerShell not found in Environment PATH                 │
│                                                                                                 │
│  Choose the easiest method to install PowerShell:                                               │
│                                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │ OPTION 1: Install via Microsoft Store (Recommended for Windows 10/11)                     │  │
│  │ Opens the official Microsoft Store app directly to PowerShell Core (pwsh).               │  │
│  │                                                                                           │  │
│  │ [ 🏪 Open Microsoft Store (PowerShell) ]                                                  │  │
│  └───────────────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │ OPTION 2: Download Manually from Official Microsoft Website                               │  │
│  │ Opens your browser to GitHub / Microsoft Learn to download the standalone .msi installer. │  │
│  │                                                                                           │  │
│  │ [ 🌐 Open Official PowerShell Website (Manual Download) ]                                 │  │
│  └───────────────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                                 │
│  After installation completes, click to verify:                                                 │
│  [ 🔄 Re-check PowerShell Status ]                                                              │
│                                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

### Wireframe B: Level 1 Condition (PowerShell Active ➔ Full Diagnostics Unlocked)

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│ ⚙️ PakCLI Settings ➔ Setup & Dependencies Hub                                                   │
├─────────────────────────────────────────────────────────────────────────────────────────────────┤
│  ⚡ Master Engine: ✅ PowerShell Core 7.4.2 Active & Ready to Roll!                             │
│                                                                                                 │
│  [🔄 Run Re-Diagnostics]                                                 [📦 Check All Updates] │
├─────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                 │
│  ▼ 🌿 GIT MANAGER MODULE                                                                        │
│    ├── 🌐 Internet Connection : ✅ Online (Ready for remote sync & update checks)              │
│    ├── 📦 Git Core Engine     : ❌ Not Installed (git command not found)                       │
│    │     Status : Local snapshot engine requires Git to record internal object history.        │
│    │     Action : [⚡ Install Git via PowerShell (winget)]   [📖 Manual Setup Guide]            │
│    └── 🐚 Bash Environment    : 💡 Missing (Relax, native PowerShell serves as 100% fallback)  │
│                                                                                                 │
│  ▼ 🎬 YT DOWNLOADER MODULE (YTD)                                                                │
│    ├── 📥 yt-dlp Binary       : ✅ Installed (v2026.03.15) at AppData/Local                     │
│    └── 🎞️ FFmpeg Engine       : ❌ Not Installed                                               │
│          Status : 1080p video/audio muxing requires FFmpeg.                                     │
│          Action : [⚡ Install FFmpeg via PowerShell (winget)]                                   │
│                                                                                                 │
│  ▼ 🔗 SYMLINK MANAGER MODULE                                                                    │
│    ├── 🔀 Junction Support    : ✅ Active (Cross-drive folder junctions supported)              │
│    └── 🛡️ Developer Mode      : ⚠️ Inactive                                                    │
│          Status : Developer Mode allows mklink /D without Administrator elevation prompts.      │
│          Action : [⚡ Enable Developer Mode via PowerShell Elevation]                           │
│                                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

### Wireframe C: Level 2 - Execution Progress Modal & Offline Fallbacks

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│  ⚡ PakCLI PowerShell Runner - Installing Git for Windows                                  [✕] │
├─────────────────────────────────────────────────────────────────────────────────────────────────┤
│  Status: Downloading and installing official package via winget...                              │
│                                                                                                 │
│  ┌─ Log Output (PowerShell Stream) ───────────────────────────────────────────────────────────┐ │
│  │ > Executing: winget install --id Git.Git -e --source winget --accept-source-agreements    │ │
│  │ Found Git [Git.Git] Version 2.46.0                                                         │ │
│  │ Downloading https://github.com/git-for-windows/git/releases/...                            │ │
│  │ ████████████████████████████████ 100% (62.4 MB)                                           │ │
│  │ Installing package...                                                                      │ │
│  │ Successfully installed Git!                                                                │ │
│  └────────────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                                 │
│  [On Failure / Timeout]:                                                                        │
│  ⚠️ Winget encountered network connectivity issues or was blocked by firewall.                  │
│  [🌐 Download Offline Standalone Installer (.exe)]      [🔄 Retry via PowerShell]               │
│                                                                                                 │
│  [✔ Done]                                                                           [ Close ]   │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Security, User Consent, & Execution Policy (`ExecutionPolicy Bypass`)

On Windows systems, `.ps1` execution is restricted by the default policy (`Restricted`). To ensure smooth automated execution, the `-ExecutionPolicy Bypass` flag is required.

However, in accordance with **Obsidian Community Security and Privacy Guidelines**, PakCLI **MUST request explicit user consent** before executing any PowerShell command.

---

### Wireframe D: PowerShell Execution Consent Modal

Presented when a command with `-ExecutionPolicy Bypass` is about to execute (unless previously trusted):

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│  🛡️ Security Confirmation: PakCLI PowerShell Execution Consent                             [✕] │
├─────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                 │
│  PakCLI Local requires your permission to execute a PowerShell script on this Windows machine.  │
│                                                                                                 │
│  📋 What will happen?                                                                           │
│  This script will inspect local binary installations (Git / yt-dlp / FFmpeg) and folder paths   │
│  on your local disk. It DOES NOT alter registry settings permanently and DOES NOT transmit     │
│  any telemetry or vault contents to the internet without your consent.                          │
│                                                                                                 │
│  💻 Exact CLI Command Being Executed:                                                           │
│  ┌───────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │ powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass \                        │  │
│  │   -Command "winget install --id Git.Git -e --source winget"                               │  │
│  └───────────────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                                 │
│  [✔] Remember my choice (Never ask again for future PowerShell executions)                      │
│      (Can be reset anytime in Settings ➔ Security & Permissions)                                │
│                                                                                                 │
├─────────────────────────────────────────────────────────────────────────────────────────────────┤
│  [ ⚡ Allow & Run Script ]                                                        [ Cancel ]    │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

### Technical Security Mechanics:

1. **Permission Token Persistence:**
   - Stored in plugin settings: `settings.trustedPowerShellExecution = boolean` (default: `false`).
2. **Safe Execution Guard:**
   ```typescript
   async function executePowerShellSafely(cliCommand: string, description: string): Promise<string> {
       if (!plugin.settings.trustedPowerShellExecution) {
           const userApproved = await openConsentModal({
               exactCli: cliCommand,
               explanation: description,
           });
           if (!userApproved) {
               throw new Error("Execution cancelled by user.");
           }
       }
       return await runNodeProcess(cliCommand);
   }
   ```
3. **"Never Ask Again" Toggle:**
   - When checked, `plugin.settings.trustedPowerShellExecution = true; await plugin.saveSettings();` is persisted. Future background scans and 1-click snapshots run silently without annoying popups.
4. **Revocation Button in Settings:**
   - A `[🔄 Reset PowerShell Execution Consent]` button is available in Settings if the user ever wishes to re-enable safety prompts.

---

## 6. Error Handling Matrix

| Error Code / Symptom | Root Cause | Automated PakCLI Remedy |
| :--- | :--- | :--- |
| **Exit Code 1603** | Windows Installer requires Administrator elevation. | Trigger elevation script with UAC prompt (`Start-Process -Verb RunAs`). |
| **Winget 0x80070002** | Winget source database out of sync. | Automatically execute `winget source reset --force` and retry. |
| **Download Timeout** | Slow connection or corporate proxy. | Provide fallback button to open direct download in default browser. |
| **Script Restricted** | Antivirus or group policy intervention. | Use inline `-Command "..."` wrapper with bypass flag. |

---

## 7. Series Summary & Implementation Roadmap

| Document | Focus & Scope |
| :--- | :--- |
| [v01_without-git-snapshot.md](file:///d:/0pro/pakcli-plugin/local/brief/v01_without-git-snapshot.md) | Baseline & Problem Definition (why linear commits fail). |
| [v02_with-git-snapshot.md](file:///d:/0pro/pakcli-plugin/local/brief/v02_with-git-snapshot.md) | Internal Git Snapshot mechanics (`refs/snapshots/*`, storage < 2MB, auto-prune TTL). |
| [v03_multiple-repo-git-manager.md](file:///d:/0pro/pakcli-plugin/local/brief/v03_multiple-repo-git-manager.md) | Complete Multi-Repo Git Manager Specs: 3 View Modes, Hotkey Map, TypeScript Architecture. |
| [v04_install-dependencies-flows.md](file:///d:/0pro/pakcli-plugin/local/brief/v04_install-dependencies-flows.md) | **PowerShell Diagnostics & Installer Architecture**: Gatekeeper Flow, Per-Feature-Tab Panels, Consent Modal, Error Matrix. |
| [v05_task-implement.md](file:///d:/0pro/pakcli-plugin/local/brief/v05_task-implement.md) | **Implementation Task Brief**: Fix deps install flow (Phase A) + Git Sentinel feature (Phases 1–10). |
