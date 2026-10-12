# 📌 Master Brief: Per-Vault Windows Taskbar Icon (`pakcli-local`)

> **Feature Status**: `0` (Draft / Pending Implementation)  
> **Target Module**: `pakcli-local`  
> **Platform**: Windows Desktop (`Platform.isDesktopApp && process.platform === 'win32'`)  
> **Date**: 2026-10-12  

---

## 1. Objective & Problem Statement

### The Problem
Di Obsidian Desktop, fitur bawaan *"Custom app icon"* hanya mengubah ikon title bar jendela. Tombol taskbar Windows tetap menampilkan ikon default Obsidian (`md.obsidian`), karena seluruh instance jendela vault berbagi satu **AppUserModelID (AUMID)** yang sama di level Windows OS. Akibatnya:
- Pengguna yang membuka beberapa vault sekaligus (misal: Vault Kerja, Vault Kuliah, Vault Pribadi) tidak dapat membedakan jendela di Windows Taskbar secara instan.
- Taskbar grouping menggabungkan semua vault ke dalam satu grup icon Obsidian.

### The Solution
Menggunakan API Electron `BrowserWindow.setAppDetails()` pada jendela aktif saat `workspace.onLayoutReady`:
1. Menyuntikkan **`appId`** unik per vault (`md.obsidian.vault.<sanitized_vault_name>`).
2. Menghubungkan **`appIconPath`** langsung ke file `.ico` per vault (default: `<vault>/.obsidian/plugins/pakcli-local/icon.ico`).
3. Mengonfigurasi **`relaunchCommand`** (`"<process.execPath>" "obsidian://open?vault=<encoded_name>"`) dan **`relaunchDisplayName`** agar saat tombol taskbar di-pin, tombol tersebut membuka vault yang sesuai.

---

## 2. Technical Architecture & Constraints

### A. Electron & Node Resolution Strategy
- **Unbundled External**: Jangan bundle `electron`, `@electron/remote`, `path`, atau `fs`.
- Akses modul melalui `window.require`:
  ```typescript
  const nodeRequire = (window as any).require;
  const fs = nodeRequire('fs');
  const path = nodeRequire('path');
  const remote = nodeRequire('@electron/remote') || nodeRequire('electron')?.remote;
  ```
- Guard platform ketat:
  ```typescript
  if (!Platform.isDesktopApp || process?.platform !== 'win32') {
    return; // Silent bypass di macOS, Linux, atau mobile
  }
  ```

### B. AUMID & Path Specifications
- **`appId` format**: `md.obsidian.vault.` + nama vault yang disanitasi (`replace(/[^\w]/g, '_')`). Stabil antar restart.
- **`appIconPath` resolution**:
  1. Setting `taskbarIconPath` (jika diisi custom oleh user).
  2. Fallback default: `path.join(vaultBasePath, configDir, 'plugins', manifest.id, 'icon.ico')`.
- Pengecekan `fs.existsSync(targetIconPath)` sebelum pemanggilan API. Jika file `.ico` tidak ditemukan, tampilkan notice ramah dan batalkan eksekusi tanpa crash.

### C. UI & Command Integration
- **Settings tab**: Terintegrasi ke dalam `MasterDetailSettingsTab` di bawah kategori `Taskbar Vault Icon (Windows)`.
  - Input `taskbarIconPath` (text input; kosong = default icon path).
  - Input `taskbarCustomAppId` (text input; opsional override).
  - Tombol **"Apply Now"** untuk menerapkan langsung secara instan.
- **Command Palette**: `PakCLI Local: Reapply taskbar icon`.
- **Auto-apply on launch**: Dijalankan secara aman saat `workspace.onLayoutReady` dengan delay 500ms.

---

## 3. Planned Files & Changes

| File | Status | Keterangan |
| :--- | :---: | :--- |
| `src/features/taskbar/types.ts` | ⏳ Pending | Interface settings & contract Electron AppDetails |
| `src/features/taskbar/taskbar.ts` | ⏳ Pending | Logika `setAppDetails`, AUMID sanitizer, & error handling |
| `src/features/taskbar/settings.ts` | ⏳ Pending | Form render untuk settings hub |
| `src/settings.ts` | ⏳ Pending | Integrasi `TaskbarSettings` ke `PakCLILocalSettings` & default |
| `src/main.ts` | ⏳ Pending | `onLayoutReady` hook, command registration, & settings hub tab |
| `manifest.json` | ⏳ Pending | Pastikan `isDesktopOnly: true` |

---

## 4. Acceptance Criteria Checklist

- [ ] Status 0 ter-commit di Git repo.
- [ ] Implementasi tidak me-load di non-Windows / mobile (silent no-op).
- [ ] Jendela vault di Windows Taskbar mendapatkan icon `.ico` unik sesuai setting/default.
- [ ] Command "Reapply taskbar icon" berfungsi langsung dari Command Palette.
- [ ] Missing icon atau missing remote module memberikan pesan Notice informatif tanpa error uncaught / crash.
- [ ] Status diupdate ke `1` (Completed) dan ter-commit di Git repo.
