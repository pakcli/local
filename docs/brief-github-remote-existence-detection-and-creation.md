# 📌 Master Brief: GitHub Remote Existence Detection & Cancellation Protocol (local)

> **Feature Status**: `0` (Draft / Pending Implementation)  
> **Target Module**: `local` (`pakcli-local`)  
> **Platform**: Windows Desktop / Cross-platform  
> **Date**: 2026-10-20  

---

## 1. Objective & Problem Statement
- **Problem**: When linking a GitHub remote repository (`LinkRemoteModal`), the system previously performed only local regex slug validation. It did not verify whether the repository actually exists on GitHub. As a result, linking a non-existent repo (e.g. `pakcli/radian-sin-cos-tan`) led to a broken 404 "Page not found" when clicking "Open in browser". In addition, users need execution visibility and Ctrl+C cancellation support when running configuration/creation commands.
- **Solution**:
  1. **Live GitHub Repository Detection**:
     - Check repository existence on GitHub via Obsidian `requestUrl` (fast, unauthenticated) and `gh` CLI fallback.
     - Display immediate feedback: `✔ Repository EXISTS on GitHub` vs `❌ Repository NOT FOUND on GitHub (404)`.
  2. **1-Click Repo Creation**:
     - When a repository is not found, offer a `[ 🚀 Create Repository on GitHub ]` button using `gh repo create --source=. --remote=origin --push`.
  3. **Ctrl+C Cancellation & Obsidian Alignment**:
     - Live execution log console inside the modal.
     - `⏹️ Cancel / Stop Execution (Ctrl+C)` button and global `Ctrl+C` / `Escape` keyboard interceptor.
     - When cancelled via Ctrl+C, terminate the process tree (`taskkill /pid ... /t /f` on Windows), log `🛑 Ctrl+C triggered (canceled)`, and report back cleanly to Obsidian.
  4. **404 Confirmation Guard**:
     - If linking a repo that does not exist on GitHub, prompt with a clear confirmation dialog before configuring git origin.

## 2. Technical Architecture & Constraints
- **Live Check Service**: `CliBridge.checkGitHubRepoExists(owner, repo)` returning `{ exists: boolean, isPrivate?: boolean, htmlUrl?: string }`.
- **Creation Service**: `CliBridge.createGitHubRepo(appPath, owner, repo, isPrivate, onLog)` with a `{ promise, cancel }` handle.
- **Platform Guards**: Desktop check via `window.require('child_process')`, graceful process tree killing on Windows.

## 3. Implementation Plan & Files
| File | Status | Description |
| :--- | :---: | :--- |
| `local/src/features/appsDashboard/services/CliBridge.ts` | ⏳ | Add `checkGitHubRepoExists` & `createGitHubRepo` with cancel |
| `local/src/features/appsDashboard/store/AppDashboardStore.ts` | ⏳ | Bridge existence check and creation methods |
| `local/src/features/appsDashboard/ui/AppsDashboardView.ts` | ⏳ | Enhance `LinkRemoteModal` with live check, 404 warnings, creation flow, and Ctrl+C cancellation |
| `local/src/features/appsDashboard/ui/components/HostDrawer.ts` | ⏳ | Pass store and app record to `LinkRemoteModal` |

## 4. Acceptance Criteria Checklist
- [x] Status 0 brief created
- [ ] `checkGitHubRepoExists` verifies real existence against GitHub API and `gh` CLI
- [ ] `LinkRemoteModal` displays live status banner (200 OK vs 404 Not Found)
- [ ] `LinkRemoteModal` provides 1-click repo creation via `gh repo create`
- [ ] Process cancellation via `Ctrl+C` or Cancel button stops execution tree and notifies Obsidian
- [ ] 404 confirmation guard prevents accidental dead links
- [ ] TypeScript compiles cleanly with 0 errors
- [ ] Auto-deployed to Obsidian vaults
- [ ] Status 1 updated and committed
