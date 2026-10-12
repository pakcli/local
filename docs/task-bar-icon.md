# 📌 Master Brief: Per-Vault Taskbar Icon Subwindow & Collapse Management (`pakcli-local`)

> **Feature Status**: `1` (Implemented & Verified)  
> **Target Module**: `pakcli-local`  
> **Platform**: Windows Desktop (`Platform.isDesktopApp && process.platform === 'win32'`)  
> **Date**: 2026-10-12  

---

## 1. Objective & Problem Statement

### The Problem
Ketika pengguna membuka jendela pengaturan Obsidian (Settings), dialog popout, atau popout leaf sebagai jendela terpisah (sub-window):
1. Sub-window tersebut mewarisi AppUserModelID bawaan Obsidian (`md.obsidian`) dan menampilkan icon ungu default Obsidian.
2. Di Windows Taskbar, jendela Settings muncul sebagai aplikasi terpisah di sebelah icon vault kustom, tanpa pengelompokan (collapse/grouping).

### The Solution (Subwindow Management with 3 Options)
Menambahkan pengaturan mode penanganan sub-window (dropdown 3 opsi):
1. **`change other subwindows aswell + can be join collpase with main`** (Rekomendasi / Default):
   Menyuntikkan `appId` dan `appIconPath` yang identik dengan jendela utama ke seluruh sub-window/popout. Windows Taskbar otomatis menggabungkan (group & collapse) sub-window ke dalam tombol taskbar vault utama.
2. **`change other subwindows aswell`**:
   Menyuntikkan icon kustom ke seluruh sub-window, namun menggunakan `appId` unik per sub-window (`md.obsidian.vault.<Vault>.sub.<id>`). Sub-window tetap terpisah di taskbar (tidak digabung), namun menampilkan icon kustom vault.
3. **`none`**:
   Hanya memodifikasi jendela utama vault. Sub-window dibiarkan murni default Obsidian.

---

## 2. Technical Architecture & Constraints

### A. Electron Window Discovery & Lifecycle Tracking
- Gunakan `remote.BrowserWindow.getAllWindows()` untuk memindai seluruh jendela aktif Obsidian.
- Pantau pembuatan sub-window baru melalui:
  - `app.workspace.on('window-open', ...)` di level Obsidian Workspace.
  - Event listener `browser-window-created` pada `remote.app`.
  - Panggilan refresh otomatis saat modal/settings dibuka.

### B. Windows AUMID Rules for Taskbar Collapsing
- **Collapse/Grouping**: Terjadi jika 2 jendela memiliki nilai `appId` persis sama.
- **Separate Items**: Terjadi jika jendela memiliki `appId` berbeda.
- **Restart App Notice**: Ditambahkan catatan jelas bahwa restart Obsidian app diperlukan untuk mengikat AUMID pada jendela Windows yang baru dibuat.

---

## 3. Implemented Files

| File | Status | Keterangan |
| :--- | :---: | :--- |
| `src/features/taskbar/types.ts` | ✅ Done | Definisi `TaskbarSubwindowMode` & default setting |
| `src/features/taskbar/taskbar.ts` | ✅ Done | Core engine: iterasi `getAllWindows`, lifecycle watcher, & dynamic AUMID |
| `src/features/taskbar/settings.ts` | ✅ Done | Dropdown 3 opsi & note banner "Restart app to see the effect" |
| `src/main.ts` | ✅ Done | Lifecycle watcher registration on load |
| `docs/task-bar-icon.md` | ✅ Done | Brief tracking status 1 |

---

## 4. Acceptance Criteria Checklist

- [x] Status 0 brief dibuat dan di-commit ke Git repo (`e0295b6`).
- [x] Dropdown 3 opsi tersedia di Settings PakCLI Local:
      1. `change other subwindows aswell + can be join collpase with main`
      2. `change other subwindows aswell`
      3. `none`
- [x] Banner note "Restart Obsidian app to see the effect" tampil jelas di UI settings.
- [x] Jendela Settings dan popout leaf mengikuti opsi yang dipilih.
- [x] Opsi collapse menggabungkan jendela Settings ke dalam grup taskbar vault utama dengan icon yang sama.
- [x] Build TypeScript clean dan auto-deployed ke vault.
- [x] Status diupdate ke `1` (Completed) dan di-commit.
