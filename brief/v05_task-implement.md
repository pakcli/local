# Brief v05: Implementation Task — Fix Deps Install + Git Sentinel & Snapshot Manager

> **Status:** Active Implementation Brief
> **Scope:** `pakcli-plugin/local` — 2 sequenced tasks, tackle in order
> **Depends On:** v01 (problem), v02 (snapshot engine), v03 (UI/UX spec), v04 (dependency flows & per-tab panels)

---

## Overview — 2 Tasks, 1 Brief

| Task | Name | Why First | Estimated Code |
| :--- | :--- | :--- | :--- |
| **Task A** | Fix Dependencies Install Flow | Isolated, easy to test, no new UI | ~180 lines (2 new files, 2 edits) |
| **Task B** | Git Sentinel & Snapshot Manager | Builds on working PS runner from Task A | ~800 lines across 14 files |

**Rule:** Complete Task A and verify it works before starting Task B. The `psRunner.ts` and `consentModal.ts` created in Task A are reused directly in Task B.

---

# TASK A — Fix Dependencies Install Flow

> **Goal:** Make the "⬇️ Install" button **actually install**, not just copy to clipboard.
> **Scope:** `src/features/hub/` — no new feature folder needed.

## A.1 What's Broken Right Now

Open [`src/features/hub/depsTable.ts`](file:///d:/0pro/pakcli-plugin/local/src/features/hub/depsTable.ts) line ~419:

```ts
// CURRENT — install button does NOTHING except copy to clipboard
installBtn.onclick = () => {
  navigator.clipboard.writeText(dep.installCmd).then(() => {
    new Notice(`📋 Copied install command:\n${dep.installCmd}`);
  });
};
```

Clicking "⬇️ Install" only puts the winget command on clipboard. The user still has to open a terminal and paste it manually. That's a sticky note, not a feature.

---

## A.2 Files to Create / Modify

```
src/features/hub/
├── psRunner.ts        ← CREATE — PowerShell execution engine (shared by Task B too)
├── consentModal.ts    ← CREATE — -ExecutionPolicy Bypass consent UI
├── depsTable.ts       ← MODIFY — install btn onclick: copy → real PS execution
└── settingsHub.ts     ← MODIFY — pass DepsRenderContext into renderDepsTable
```

---

## A.3 New File: `psRunner.ts`

**Path:** `src/features/hub/psRunner.ts`

```ts
import { getNodeChildProcess } from "../../utils/nodeHelpers";

export interface PsRunResult {
  success: boolean;
  stdout: string;
  stderr: string;
  durationMs: number;
}

/**
 * Level 0 check — uses Node where.exe, no PS needed.
 * Returns "pwsh" | "powershell" | null
 */
export function detectPsExe(): "pwsh" | "powershell" | null {
  const cp = getNodeChildProcess();
  if (!cp) return null;
  try {
    cp.execSync("where.exe pwsh", { encoding: "utf8", timeout: 2000 });
    return "pwsh";
  } catch {
    try {
      cp.execSync("where.exe powershell", { encoding: "utf8", timeout: 2000 });
      return "powershell";
    } catch {
      return null;
    }
  }
}

/**
 * Run a PS command with -ExecutionPolicy Bypass.
 * Caller MUST handle consent modal before calling this.
 */
export function runPsCommand(command: string, psExe: "pwsh" | "powershell"): Promise<PsRunResult> {
  const cp = getNodeChildProcess();
  const t0 = Date.now();

  if (!cp) {
    return Promise.resolve({
      success: false, stdout: "", stderr: "child_process not available", durationMs: 0,
    });
  }

  const fullCmd = `${psExe} -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "${command}"`;

  return new Promise((resolve) => {
    cp.exec(fullCmd, { timeout: 60000 }, (err: any, stdout: string, stderr: string) => {
      resolve({
        success: !err,
        stdout: stdout?.trim() || "",
        stderr: stderr?.trim() || err?.message || "",
        durationMs: Date.now() - t0,
      });
    });
  });
}
```

> [!NOTE]
> `detectPsExe()` uses Node `execSync` + `where.exe` — no PowerShell required. This is the Level 0 gate from v04.

---

## A.4 New File: `consentModal.ts`

**Path:** `src/features/hub/consentModal.ts`

```ts
import { App, Modal } from "obsidian";

export interface ConsentResult {
  confirmed: boolean;
  neverAskAgain: boolean;
}

export class ConsentModal extends Modal {
  private result: ConsentResult = { confirmed: false, neverAskAgain: false };
  private resolve!: (r: ConsentResult) => void;

  constructor(app: App, private psExe: string, private command: string) {
    super(app);
  }

  /** Static helper — open and await user decision */
  static ask(app: App, psExe: string, command: string): Promise<ConsentResult> {
    const modal = new ConsentModal(app, psExe, command);
    return new Promise((res) => { modal.resolve = res; modal.open(); });
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("pakcli-consent-modal");

    contentEl.createEl("h2", { text: "⚡ PowerShell Elevated Execution — Confirm" });
    contentEl.createEl("p", {
      text: "This action runs a PowerShell command with a temporary execution policy bypass. This does NOT permanently change your system policy — it applies for this single command only.",
      cls: "pakcli-consent-desc",
    });

    contentEl.createEl("p", { text: "Exact command to be executed:", cls: "pakcli-consent-label" });
    const cliStr = `${this.psExe} -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "${this.command}"`;
    const codeBlock = contentEl.createEl("pre", { cls: "pakcli-consent-code" });
    codeBlock.createEl("code", { text: cliStr });

    contentEl.createEl("p", {
      text: "⚠️  winget requires internet access and may take 30–120 seconds. Do not close Obsidian during installation.",
      cls: "pakcli-consent-warning",
    });

    // Never ask again checkbox
    const checkRow = contentEl.createDiv({ cls: "pakcli-consent-check-row" });
    const checkbox = checkRow.createEl("input", { type: "checkbox" } as any);
    checkbox.id = "pakcli-consent-never-ask";
    checkRow.createEl("label", {
      text: "Never ask again for this session",
      attr: { for: "pakcli-consent-never-ask" },
    });

    const btnRow = contentEl.createDiv({ cls: "pakcli-consent-btn-row" });

    const cancelBtn = btnRow.createEl("button", { text: "Cancel", cls: "pakcli-consent-btn-cancel" });
    cancelBtn.onclick = () => {
      this.result = { confirmed: false, neverAskAgain: false };
      this.resolve(this.result);
      this.close();
    };

    const runBtn = btnRow.createEl("button", { text: "▶ Run It", cls: "pakcli-consent-btn-run" });
    runBtn.onclick = () => {
      this.result = { confirmed: true, neverAskAgain: (checkbox as HTMLInputElement).checked };
      this.resolve(this.result);
      this.close();
    };
  }

  onClose(): void {
    if (!this.result.confirmed) this.resolve({ confirmed: false, neverAskAgain: false });
    this.contentEl.empty();
  }
}
```

---

## A.5 Modify: `depsTable.ts`

### A.5a — Add `DepsRenderContext` interface + update `renderDepsTable` signature

```ts
import { App } from "obsidian";
import { detectPsExe, runPsCommand } from "./psRunner";
import { ConsentModal } from "./consentModal";

export interface DepsRenderContext {
  app: App;
  bypassConsentGiven: boolean;
  onConsentGiven: () => void;
}

// Update signature:
export function renderDepsTable(
  container: HTMLElement,
  deps: DepResult[],
  onRefresh: () => void,
  ctx: DepsRenderContext   // ← ADD
): void
```

### A.5b — Replace install button onclick (line ~419–423)

```ts
// BEFORE (clipboard only)
installBtn.onclick = () => {
  navigator.clipboard.writeText(dep.installCmd).then(() => {
    new Notice(`📋 Copied install command:\n${dep.installCmd}`);
  });
};

// AFTER (real PowerShell execution)
installBtn.onclick = async () => {
  const psExe = detectPsExe();

  if (!psExe) {
    new Notice("❌ PowerShell not found. Install it first (see Dependencies tab).", 6000);
    return;
  }

  if (!ctx.bypassConsentGiven) {
    const consent = await ConsentModal.ask(ctx.app, psExe, dep.installCmd);
    if (!consent.confirmed) return;
    if (consent.neverAskAgain) ctx.onConsentGiven();
  }

  installBtn.disabled = true;
  installBtn.textContent = "⏳ Installing…";

  const result = await runPsCommand(dep.installCmd, psExe);

  if (result.success) {
    installBtn.textContent = "✅ Done!";
    new Notice(`✅ Installed ${dep.name} successfully!\n\nRe-check to update status.`, 6000);
    setTimeout(() => { installBtn.disabled = false; installBtn.textContent = "⬇️ Install"; }, 4000);
  } else {
    installBtn.disabled = false;
    installBtn.textContent = "❌ Failed";
    new Notice(`❌ Install failed for ${dep.name}:\n\n${result.stderr || "Unknown error"}`, 8000);
    setTimeout(() => { installBtn.textContent = "⬇️ Install"; }, 3000);
  }
};
```

---

## A.6 Modify: `settingsHub.ts`

Add field to settings class:
```ts
private bypassConsentGiven = false;
```

Update **both** `renderDepsTable(...)` call sites (lines ~669 and ~803):
```ts
// BEFORE
renderDepsTable(tableContainer, this.depsResults, doCheck);

// AFTER
renderDepsTable(tableContainer, this.depsResults, doCheck, {
  app: this.app,
  bypassConsentGiven: this.bypassConsentGiven,
  onConsentGiven: () => {
    this.bypassConsentGiven = true;
    new Notice("✅ Consent saved — won't ask again this session.");
  },
});
```

---

## A.7 Per-Feature-Tab Deps Panel (apply to ALL feature tabs — see v04 §3)

Each feature settings tab must show a **focused** deps panel with only its own tools.
Use the same `renderDepsTable` with a filtered `DEP_DEFINITIONS` subset:

```ts
// YTD tab — only these 3
const YTD_DEPS = DEP_DEFINITIONS.filter(d =>
  ["PowerShell (pwsh)", "Windows PowerShell", "yt-dlp", "ffmpeg"].includes(d.name)
);

// Git Manager tab — only these 3
const GIT_DEPS = DEP_DEFINITIONS.filter(d =>
  ["PowerShell (pwsh)", "Windows PowerShell", "git"].includes(d.name)
);

// Symlink tab — only PowerShell (Dev Mode status is checked separately)
const SYMLINK_DEPS = DEP_DEFINITIONS.filter(d =>
  ["PowerShell (pwsh)", "Windows PowerShell"].includes(d.name)
);
```

Section header for every tab panel:
```
⚙️ Dependencies for [Feature Name]        [🔍 Check]
```

---

## A.8 CSS to Add

```css
/* ── Consent Modal ─────────────────────────────────── */
.pakcli-consent-modal { padding: 8px 4px; }
.pakcli-consent-desc  { color: var(--text-normal); margin-bottom: 12px; }
.pakcli-consent-label { font-weight: 600; margin-bottom: 4px; }
.pakcli-consent-code  {
  background: var(--background-secondary);
  border: 1px solid var(--background-modifier-border);
  border-radius: 6px;
  padding: 10px 14px;
  font-size: 12px;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
  margin-bottom: 12px;
}
.pakcli-consent-warning {
  color: var(--text-warning);
  font-size: 12px;
  margin-bottom: 16px;
}
.pakcli-consent-check-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 20px;
  font-size: 13px;
}
.pakcli-consent-btn-row  { display: flex; justify-content: flex-end; gap: 10px; }
.pakcli-consent-btn-run  {
  background: var(--interactive-accent);
  color: var(--text-on-accent);
  border: none;
  padding: 8px 20px;
  border-radius: 5px;
  cursor: pointer;
  font-weight: 600;
}
.pakcli-consent-btn-cancel {
  background: transparent;
  border: 1px solid var(--background-modifier-border);
  padding: 8px 16px;
  border-radius: 5px;
  cursor: pointer;
  color: var(--text-muted);
}
.pakcli-consent-btn-run:hover    { filter: brightness(1.1); }
.pakcli-consent-btn-cancel:hover { background: var(--background-secondary); }
```

---

## A.9 Task A Checklist

**Phase A — Core (no UI changes yet):**
- [ ] Create `src/features/hub/psRunner.ts`
- [ ] Create `src/features/hub/consentModal.ts`
- [ ] `npm run dev` → zero compile errors ✅

**Phase B — Wire into deps table:**
- [ ] Add `DepsRenderContext` interface to `depsTable.ts`
- [ ] Update `renderDepsTable` signature + install button onclick
- [ ] Add imports: `detectPsExe`, `runPsCommand`, `ConsentModal`

**Phase C — Update call sites:**
- [ ] Update both `renderDepsTable(...)` calls in `settingsHub.ts`
- [ ] Add `bypassConsentGiven` field to class

**Phase D — Per-feature tabs:**
- [ ] Add focused deps panel to YTD settings tab
- [ ] Add focused deps panel to Git Manager settings tab (when Tab B is added)
- [ ] Add focused deps panel to Symlink settings tab

**Phase E — Polish:**
- [ ] Add CSS for consent modal
- [ ] Test: yt-dlp missing → click Install → ConsentModal shows exact CLI → Run It → installs ✅
- [ ] Test: "Never ask again" → subsequent install skips modal ✅
- [ ] Test: PS not found → Notice shows gracefully ✅
- [ ] `npm run build` → clean output ✅

**Test scenario (fastest to verify):**
```
1. Dependency check → yt-dlp shows ❌
2. Click ⬇️ Install
3. ConsentModal appears — CLI string reads:
   pwsh -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "winget install yt-dlp.yt-dlp"
4. Click ▶ Run It → button: ⏳ Installing…
5. ~30s later → ✅ Done! notice
6. Re-check → yt-dlp shows ✅ with version
```

---

---

# TASK B — Git Sentinel & Snapshot Manager

> **Goal:** Full multi-repo Git manager in Obsidian with 3 view modes, local snapshots, AI diff exporter.
> **Prerequisite:** Task A complete and verified (psRunner + consentModal available).

## B.1 Feature Summary

| Capability | Delivery |
| :--- | :--- |
| 3 View Modes (Compact / Standard / Full) | Modal Panel UI |
| Non-destructive local snapshots | `git stash create` → `refs/snapshots/*` |
| AI Diff Exporter | Clipboard copy of unified diff |
| Multi-repo discovery | Direct folders + Windows Symlinks/Junctions |
| Health diagnostics for Git & Bash | Reuses `psRunner.ts` from Task A |
| Ribbon icon + Hotkey | Obsidian API integration |
| Snapshot naming convention | `yyyy-mm-dd_hh-mm_custom message` |
| Per-tab deps panel | Focused Git/Bash panel in settings tab |

---

## B.2 File & Folder Structure to Create

```
src/
└── features/
    └── git-manager/              ← NEW FEATURE ROOT
        ├── index.ts              ← re-exports registerGitManager()
        ├── types.ts              ← TypeScript interfaces & enums
        ├── constants.ts          ← command IDs, snapshot ref prefix, icons
        ├── GitManager.ts         ← orchestrator: ribbon, commands, lifecycle
        ├── repoScanner.ts        ← discover Git repos (direct + symlink/junction)
        ├── snapshotEngine.ts     ← git stash create → refs/snapshots/*
        ├── diffExporter.ts       ← unified diff → clipboard for AI
        ├── depChecker.ts         ← Git & Bash health check (via psRunner from hub)
        ├── ui/
        │   ├── GitManagerModal.ts   ← main container, view-mode tab bar
        │   ├── CompactView.ts       ← View Mode 1: single-line per repo
        │   ├── StandardView.ts      ← View Mode 2: card per repo
        │   ├── FullView.ts          ← View Mode 3: left list + right diff pane
        │   ├── SnapshotModal.ts     ← timestamp input + confirm → create snapshot
        │   └── DepsPanel.ts         ← focused Git/Bash deps panel for settings tab
        └── styles/
            └── git-manager.css   ← scoped .git-manager-* CSS
```

> [!NOTE]
> `psRunner.ts` and `consentModal.ts` live in `src/features/hub/` and are imported from there. No duplication.

---

## B.3 Types & Constants

**`types.ts`:**
```ts
export enum ViewMode    { Compact = 'compact', Standard = 'standard', Full = 'full' }
export enum RepoStatus  { Clean = 'clean', Dirty = 'dirty', Staged = 'staged', Conflict = 'conflict', Snapshotted = 'snapshotted' }
export enum DepStatus   { Unknown = 'unknown', OK = 'ok', Missing = 'missing', Checking = 'checking' }

export interface RepoInfo {
  name: string;
  absPath: string;
  isSymlink: boolean;
  status: RepoStatus;
  aheadBehind: { ahead: number; behind: number };
  snapshotCount: number;
  lastSnapshot?: string;
}

export interface SnapshotEntry {
  ref: string;        // refs/snapshots/yyyy-mm-dd_hh-mm_...
  label: string;
  timestamp: string;
  repoPath: string;
}

export interface GitManagerSettings {
  watchedPaths: string[];
  defaultViewMode: ViewMode;
  bypassConsentGiven: boolean;  // shared with hub psRunner consent
  retentionCount: number;       // default 20
  includeUntracked: boolean;
}
```

**`constants.ts`:**
```ts
export const GIT_MANAGER_CMD_OPEN     = 'open-git-manager';
export const GIT_MANAGER_CMD_SNAPSHOT = 'git-snapshot-now';
export const GIT_MANAGER_CMD_DIFF     = 'git-copy-diff';
export const GIT_MANAGER_CMD_DEPS     = 'git-check-deps';
export const SNAPSHOT_REF_PREFIX      = 'refs/snapshots/';
export const DEFAULT_RETENTION        = 20;
export const RIBBON_ICON              = 'git-branch';
export const RIBBON_TITLE             = 'Git Sentinel';
```

---

## B.4 Implementation Phases

### Phase 1 — Skeleton & Registration

**Goal:** Ribbon icon appears, modal opens blank, no errors.

- [ ] `index.ts` → `registerGitManager(plugin)`
- [ ] `GitManager.ts` → `register()` adds ribbon icon + 4 commands (stable IDs)
- [ ] `ui/GitManagerModal.ts` → minimal `Modal` subclass
- [ ] Wire `registerGitManager(this)` into `src/main.ts` `onload()`
- [ ] `npm run dev` → ribbon icon `git-branch` appears, modal opens empty ✅

---

### Phase 2 — Types & Constants

- [ ] Create `types.ts` (see B.3)
- [ ] Create `constants.ts` (see B.3)

---

### Phase 3 — Repository Scanner

- [ ] `repoScanner.ts` — discovers repos from configured `watchedPaths`:
  - `fs.lstatSync` to detect symlinks/junctions
  - `git rev-parse --git-dir` to confirm valid Git repo
  - Returns `RepoInfo[]` with absolute paths
  - Windows junction note: `lstat().isSymbolicLink()` may return false — use `fs.readlinkSync` to verify

---

### Phase 4 — Snapshot Engine

Core flow (from v02):
```
git stash create                              → OID
git update-ref refs/snapshots/<label> <OID>   → named ref (never synced to remote)
```

Functions:
```ts
export async function createSnapshot(repoPath: string, label: string): Promise<string>
export async function listSnapshots(repoPath: string): Promise<SnapshotEntry[]>
export async function deleteSnapshot(repoPath: string, ref: string): Promise<void>
export async function restoreSnapshot(repoPath: string, ref: string): Promise<void>

export function buildSnapshotLabel(customMsg: string): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const ts = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}`;
  return customMsg.trim() ? `${ts}_${customMsg.trim()}` : `${ts}_auto checkpoint`;
}
```

> [!IMPORTANT]
> `git stash create` only captures tracked files. Add settings toggle: **"Include untracked files in snapshots"** (runs `git add -A` in-memory before stash create when enabled).

---

### Phase 5 — Dependency Checker

```ts
// depChecker.ts
import { detectPsExe, runPsCommand } from '../../hub/psRunner';

export async function checkGitDeps(): Promise<GitDepResult>
// Checks: PowerShell (Level 0 via Node), Git, Bash (Level 1 via PS)
```

---

### Phase 6 — Diff Exporter

```ts
// diffExporter.ts
export async function exportDiffToClipboard(repoPath: string): Promise<void>
// git diff HEAD → format with header → navigator.clipboard.writeText()
```

Clipboard format:
```
=== Git Diff Export ===
Repo    : <name>
Path    : <abs path>
Exported: yyyy-mm-dd hh:mm
========================
<raw unified diff>
========================
```

---

### Phase 7 — UI: GitManagerModal (3 View Modes)

- [ ] Tab bar: `[ 🗜️ Compact ] [ 📋 Standard ] [ 🖥️ Full ]`
- [ ] `CompactView.ts` — icon + status badge + quick buttons per repo
- [ ] `StandardView.ts` — card per repo: branch, ahead/behind, dirty count, 3 buttons
- [ ] `FullView.ts` — left list + right pane: diff preview, snapshot history, AI export
- [ ] `SnapshotModal.ts` — pre-filled timestamp input, user appends custom message
- [ ] `DepsPanel.ts` — focused Git/Bash panel (reuses renderDepsTable with GIT_DEPS filter)

---

### Phase 8 — Settings Tab Integration

Add to `src/settings.ts`:
```ts
// Interface:
gitManager: {
  watchedPaths: string[];
  defaultViewMode: 'compact' | 'standard' | 'full';
  bypassConsentGiven: boolean;
  retentionCount: number;
  includeUntracked: boolean;
};

// Defaults:
gitManager: {
  watchedPaths: [],
  defaultViewMode: 'standard',
  bypassConsentGiven: false,
  retentionCount: 20,
  includeUntracked: false,
},
```

Settings tab UI additions:
- Watched paths list (add / remove)
- Default view mode dropdown
- Retention count spinner (1–50)
- "Include untracked files" toggle
- "Reset execution consent" button → `bypassConsentGiven = false`
- **Focused deps panel** (Git/Bash only — per v04 §3 rule)

---

### Phase 9 — Styles

- [ ] `src/features/git-manager/styles/git-manager.css` — all classes prefixed `.git-manager-*`
- [ ] Import in main styles

---

### Phase 10 — Integration & Polish

- [ ] Wire `registerGitManager(this)` in `src/main.ts`
- [ ] Test primary repo: `d:\0pro\node-income-pocket-expence`
- [ ] Test symlinked/junction folder — scanner resolves correctly
- [ ] Test snapshot create → list → restore
- [ ] Test diff export → clipboard → paste in Claude/ChatGPT
- [ ] `npm run lint` → clean
- [ ] `npm run build` → clean `main.js` ✅

---

## B.5 Command IDs (Stable — Do Not Rename After Release)

| Command ID | Label |
| :--- | :--- |
| `open-git-manager` | Git Sentinel: Open Manager |
| `git-snapshot-now` | Git Sentinel: Snapshot Current Repo |
| `git-copy-diff` | Git Sentinel: Copy Diff to Clipboard |
| `git-check-deps` | Git Sentinel: Check Dependencies |

---

## B.6 Cross-Reference Map

| Concept | Defined In | Implemented In |
| :--- | :--- | :--- |
| Problem statement | v01 | — |
| Snapshot engine spec | v02 | `snapshotEngine.ts` |
| UI/UX wireframes, 3 Views | v03 | `ui/*.ts` |
| PowerShell gatekeeper flow | v04 | `psRunner.ts` (hub), `depChecker.ts` |
| Per-tab deps panel | v04 §3 | `DepsPanel.ts`, `settingsHub.ts` |
| Snapshot naming convention | v03 §1 | `buildSnapshotLabel()` in `snapshotEngine.ts` |
| Retention policy (20 max) | v02 §4 | auto-prune in `createSnapshot()` |
| `-ExecutionPolicy Bypass` consent | v04 §5 | `consentModal.ts` (hub), reused |
| Ribbon icon + Hotkey | v03 §5 | `GitManager.ts` |

---

## Start Sequence

```bash
# Task A first:
npm run dev
# → go to Settings → any feature tab → click Install on a missing dep

# Task B after A is verified:
# → create src/features/git-manager/ skeleton
# → ribbon icon git-branch appears
```

---

> **Rule:** Finish Task A and test the install flow before writing a single line of Task B.
> Each phase within each task is independently testable. Do not skip phases.
