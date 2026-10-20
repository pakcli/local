# 📌 Master Brief: Frontend Privacy Default Masking Protocol (local)

> **Feature Status**: `0` (Draft / Pending Implementation)  
> **Target Module**: `local` (`pakcli-local`)  
> **Platform**: Windows Desktop / Cross-platform  
> **Date**: 2026-10-20  

---

## 1. Objective & Problem Statement
- **Problem**: In the Apps Dashboard header (`DiagnosticBar`), the status badges for Firebase CLI and GitHub CLI rendered raw, plaintext credentials (`firebase: dcalibri@gmail.com` and `github: pakcli`). This violated user privacy and security protocols, causing sensitive personal and account data to be exposed by default when opening Obsidian or taking screenshots.
- **Solution**:
  1. Enforce strict 2-letter masking across all frontends on default state (`dc******@gmail.com`, `pa****`).
  2. Implement global store privacy state (`isPrivacyMasked = true` on initial load).
  3. Integrate an unmask/reveal toggle (`eye` / `eye-off`) directly into `DiagnosticBar` header row.
  4. Ensure `HostDrawer` and `SetupFirebaseModal` adhere to 2-letter masking by default.
  5. Enforce repository-wide rule in `.agent/everyfrontend-on-default-state-everysensitivedata-is-censored.md` and `.agents/rules/privacy-default-masking.md`.

## 2. Technical Architecture & Constraints
- **Global Privacy State**: `AppDashboardStore.isPrivacyMasked` defaults to `true`.
- **Masking Utility**: `maskAccountIdentifier(str, unmask)` formats to 2 visible characters + `*` repeat.
- **Zero Raw Exposure on Default**: Components never render raw emails/usernames without masking checks.

## 3. Implementation Plan & Files
| File | Status | Description |
| :--- | :---: | :--- |
| `.agent/everyfrontend-on-default-state-everysensitivedata-is-censored.md` | ✅ | Permanent agent rule document |
| `.agents/rules/privacy-default-masking.md` | ✅ | Repository permissions & rules integration |
| `local/src/features/appsDashboard/store/AppDashboardStore.ts` | ⏳ | Add `isPrivacyMasked: boolean = true` and `togglePrivacyMask()` |
| `local/src/features/appsDashboard/ui/components/DiagnosticBar.ts` | ⏳ | Mask `firebase` and `github` badges; add unmask toggle button |
| `local/src/features/appsDashboard/ui/components/HostDrawer.ts` | ⏳ | Apply default 2-letter masking to account metadata row |
| `local/src/features/appsDashboard/ui/SetupFirebaseModal.ts` | ⏳ | Apply default 2-letter masking to active session email |

## 4. Acceptance Criteria Checklist
- [x] Status 0 brief created
- [ ] Store `isPrivacyMasked` added with default `true`
- [ ] `DiagnosticBar` masks `firebase` email (`dc******@gmail.com`) and `github` user (`pa****`) on load
- [ ] `DiagnosticBar` contains clickable eye toggle to reveal/mask
- [ ] `HostDrawer` and `SetupFirebaseModal` masked by default
- [ ] TypeScript compiles cleanly with 0 errors
- [ ] Auto-deployed to Obsidian vaults
- [ ] Status 1 updated and committed
