# 📌 Master Brief: Frontend Privacy Default Masking Protocol (local)

> **Feature Status**: `1` (Implemented & Verified)  
> **Target Module**: `local` (`pakcli-local`)  
> **Platform**: Windows Desktop / Cross-platform  
> **Date**: 2026-10-20  

---

## 1. Objective & Problem Statement
- **Problem**: In the Apps Dashboard header (`DiagnosticBar`), the status badges for Firebase CLI and GitHub CLI rendered raw, plaintext credentials (`firebase: dcalibri@gmail.com` and `github: pakcli`). In addition, table columns (`Static Host`, `GitHub Repo`, `Path`) displayed sensitive GitHub usernames in plain text (e.g., `fadhlisl.github.io/radian-sin-cos-tan` and `https://github.com/fadhlisl/...`), exposing personal handles by default when opening Obsidian or capturing screenshots.
- **Solution**:
  1. Enforce strict 2-letter masking across all frontends on default state:
     - Emails: `dc******@gmail.com`
     - Usernames: `pa****`, `fa******`
     - GitHub Pages URLs: `fa******.github.io/radian-sin-cos-tan`
     - Git Remote URLs: `https://github.com/fa******/radian-sin-cos-tan.git`
     - Local Paths: `C:\Users\fs*\...`
  2. Implement global store privacy state (`isPrivacyMasked = true` on initial load).
  3. Integrate an unmask/reveal toggle (`eye` / `eye-off`) directly into `DiagnosticBar` header row.
  4. Ensure `HostDrawer`, `SetupFirebaseModal`, `Static Host`, `GitHub Repo`, and `Path` columns adhere to 2-letter masking by default.
  5. In `LinkRemoteModal`, allow dynamic owner switching (parse existing owner and provide editable Owner input).
  6. Enforce repository-wide rule in `.agent/everyfrontend-on-default-state-everysensitivedata-is-censored.md` and `.agents/rules/privacy-default-masking.md`.

## 2. Technical Architecture & Constraints
- **Global Privacy State**: `AppDashboardStore.isPrivacyMasked` defaults to `true`.
- **Masking Utilities**:
  - `maskAccountIdentifier(str, unmask)`: Formats identifiers to 2 visible characters + `*` repeat.
  - `maskSensitiveUrl(url, unmask)`: Masks usernames inside `github.com/:owner/...`, `:owner.github.io/...`, and `Users/:user/...`.
- **Zero Raw Exposure on Default**: Components never render raw emails, usernames, or sensitive hosts without privacy checks.

## 3. Implementation Plan & Files
| File | Status | Description |
| :--- | :---: | :--- |
| `.agent/everyfrontend-on-default-state-everysensitivedata-is-censored.md` | ✅ | Permanent agent rule document |
| `.agents/rules/privacy-default-masking.md` | ✅ | Repository permissions & rules integration |
| `local/src/features/appsDashboard/ui/AccountManagerModal.ts` | ✅ | `maskAccountIdentifier` & `maskSensitiveUrl` utilities |
| `local/src/features/appsDashboard/store/AppDashboardStore.ts` | ✅ | Add `isPrivacyMasked: boolean = true` and `togglePrivacyMask()` |
| `local/src/features/appsDashboard/ui/components/DiagnosticBar.ts` | ✅ | Mask `firebase` and `github` badges; add unmask toggle button |
| `local/src/features/appsDashboard/ui/AppsDashboardView.ts` | ✅ | Mask `Static Host`, `GitHub Repo`, and `Path` columns; LinkRemoteModal owner switcher |
| `local/src/features/appsDashboard/ui/components/HostDrawer.ts` | ✅ | Apply default 2-letter masking to account and remote repo metadata |
| `local/src/features/appsDashboard/ui/SetupFirebaseModal.ts` | ✅ | Apply default 2-letter masking to active session email |

## 4. Acceptance Criteria Checklist
- [x] Status 0 brief created
- [x] Store `isPrivacyMasked` added with default `true`
- [x] `DiagnosticBar` masks `firebase` email (`dc******@gmail.com`) and `github` user (`pa****`) on load
- [x] `DiagnosticBar` contains clickable eye toggle to reveal/mask
- [x] `Static Host` masks GitHub Pages domain (`fa******.github.io`) on load
- [x] `GitHub Repo` masks remote URL username on load
- [x] `HostDrawer` and `SetupFirebaseModal` masked by default
- [x] `LinkRemoteModal` allows user to change GitHub owner/organization
- [x] TypeScript compiles cleanly with 0 errors
- [x] Auto-deployed to Obsidian vaults
- [x] Status 1 updated and committed
