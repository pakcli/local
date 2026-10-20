# 📌 Master Brief: Firebase Project Auto-Creation & Self-Healing Deployment (local)

> **Feature Status**: `0` (Draft / Pending Implementation)  
> **Target Module**: `local` (`pakcli-local`)  
> **Platform**: Windows Desktop / Cross-platform  
> **Date**: 2026-10-20  

---

## 1. Objective & Problem Statement
- **Problem**: When deploying an app to Firebase Hosting via the plugin, if the Firebase project specified in `.firebaserc` does not exist on the user's Google account (e.g. `radiansincostan`), Firebase CLI fails with exit code 2: `Error: Failed to get Firebase project <projectId>. Please make sure the project exists and your account has permission to access it.`
- **Requirement**: The fix must be purely handled **via the plugin engine** ("via plugin way"), not via manual terminal intervention. If a project does not exist when deploying, the plugin must detect it, automatically create the project via `firebase projects:create`, heal any mismatched public directory in `firebase.json`, stream the process logs to the deployment drawer, and proceed with deployment.

## 2. Technical Architecture & Constraints
- **Deployment Flow via Plugin**:
  1. In `CliBridge.spawnDeployProcess`:
     - Inspect project existence in `.firebaserc`.
     - If `firebase deploy` fails with `Failed to get Firebase project <id>` or pre-check indicates missing project:
     - Automatically spawn `firebase projects:create <projectId> -n <displayName>`.
     - Stream stdout/stderr chunks into `onChunk` so the user sees live progress in Obsidian.
     - Support graceful `cancel()` / Ctrl+C stopping.
     - Once project creation succeeds, automatically re-trigger `firebase deploy --only hosting`.
  2. In `SetupFirebaseModal`:
     - If the user types a new project ID not in `firebase projects:list`, show clear indicator: `➕ Will be created automatically on Firebase via plugin`.
  3. Public Directory Auto-Healer:
     - If `firebase.json` specifies `"public": "dist"` but `dist` does not exist while `index.html` exists in `.`, self-heal `firebase.json` to `"public": "."`.

## 3. Implementation Plan & Files
| File | Status | Description |
| :--- | :---: | :--- |
| `local/src/features/appsDashboard/services/CliBridge.ts` | ⏳ | Auto-create missing Firebase project during deploy & public dir self-healing |
| `local/src/features/appsDashboard/ui/SetupFirebaseModal.ts` | ⏳ | UI notice when configuring an uncreated project ID |

## 4. Acceptance Criteria Checklist
- [x] Status 0 brief created
- [ ] Plugin deployment engine detects missing Firebase project during deploy
- [ ] Plugin automatically runs `firebase projects:create` and streams logs to Obsidian
- [ ] Public directory mismatch (`dist` vs `.`) is auto-healed before deploying
- [ ] Deployment proceeds seamlessly to completion without manual CLI intervention
- [ ] TypeScript compiles cleanly with 0 errors
- [ ] Auto-deployed to Obsidian vaults
- [ ] Status 1 updated and committed
