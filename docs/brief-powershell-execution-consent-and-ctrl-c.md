# 📌 Master Brief: PowerShell Script Execution Consent & Ctrl+C Cancellation Protocol (local)

> **Feature Status**: `0` (Draft / Pending Implementation)  
> **Target Module**: `local` (`pakcli-local`)  
> **Platform**: Windows Desktop / Cross-platform  
> **Date**: 2026-10-20  

---

## 1. Objective & Problem Statement
- **Problem**: When running `.ps1` (PowerShell) scripts or opening PowerShell consoles, the plugin previously executed them immediately without asking for user confirmation by default. In addition, when a PowerShell script was actively running, there was no responsive `Ctrl+C` cancellation mechanism to interrupt execution and cleanly return Obsidian to a ready/OK state.
- **Solution**:
  1. **Ask Confirmation by Default**:
     - Enforce `confirmBeforeRunPs1: true` as the default setting.
     - Before executing any `.ps1` script or launching an interactive PowerShell session, display a clear confirmation dialog asking for explicit user approval.
  2. **Ctrl+C Cancellation & Safe Reset**:
     - Expose a live `[ ⏹️ Cancel (Ctrl+C) ]` button while scripts run.
     - Register global `Ctrl+C` and `Escape` keyboard shortcuts during execution.
     - Terminate the running process tree (`taskkill /pid ... /t /f` on Windows) upon cancellation.
     - Reset execution state back to ready ("OK") and notify Obsidian: `🛑 Execution cancelled by user (Ctrl+C)`.
  3. **Interactive Console Approvals**:
     - Prompt before launching PowerShell windows in `AccountManagerModal` (`firebase login:add` and `gh auth login`).

## 2. Technical Architecture & Constraints
- **Settings Contract**: `FolderSyncSettings.confirmBeforeRunPs1: boolean` (default: `true`).
- **Cancellation Engine**: `SyncManager.runScript` returns `{ promise, cancel }` handle.
- **Desktop Guard**: Process kill via `taskkill` on Windows, `SIGINT` on Unix.

## 3. Implementation Plan & Files
| File | Status | Description |
| :--- | :---: | :--- |
| `local/src/features/scriptSync/types.ts` | ⏳ | Add `confirmBeforeRunPs1` setting interface and default |
| `local/src/features/scriptSync/settings.ts` | ⏳ | Add settings UI toggle for confirmation |
| `local/src/features/scriptSync/SyncManager.ts` | ⏳ | Upgrade `runScript` to return `{ promise, cancel }` |
| `local/src/features/scriptSync/ui/SyncCodeblockRenderer.ts` | ⏳ | Add confirmation modal, cancel button, and Ctrl+C listener |
| `local/src/features/appsDashboard/ui/AccountManagerModal.ts` | ⏳ | Add confirmation before launching interactive PowerShell windows |

## 4. Acceptance Criteria Checklist
- [x] Status 0 brief created
- [ ] `confirmBeforeRunPs1` defaults to `true`
- [ ] Every `.ps1` execution prompts for user confirmation before running
- [ ] Live `[ ⏹️ Cancel (Ctrl+C) ]` button displayed during execution
- [ ] `Ctrl+C` / `Escape` key intercepts execution and kills process cleanly
- [ ] Execution state resets safely to ready/OK upon cancellation
- [ ] AccountManagerModal PowerShell login buttons prompt for approval
- [ ] TypeScript compiles cleanly with 0 errors
- [ ] Auto-deployed to Obsidian vaults
- [ ] Status 1 updated and committed
