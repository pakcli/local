# 📌 Master Brief: Per-Vault Windows Taskbar Icon (`pakcli-local`)

> **Feature Status**: `1` (Implemented & Verified)  
> **Target Module**: `pakcli-local`  
> **Platform**: Windows Desktop (`Platform.isDesktopApp && process.platform === 'win32'`)  
> **Date**: 2026-10-12  

---

## 1. Objective & Problem Statement

### The Problem
Di Obsidian Desktop, fitur bawaan *"Custom app icon"* hanya mengubah ikon title bar jendela. Tombol taskbar Windows tetap menampilkan ikon default Obsidian (`md.obsidian`), karena seluruh instance jendela vault berbagi satu **AppUserModelID (AUMID)** yang sama di level Windows OS. Akibatnya:
- Pengguna yang membuka beberapa vault sekaligus (misal: Vault Kerja, Vault Kuliah, Vault Pribadi) tidak dapat membedakan jendela di Windows Taskbar secara instan.
- Taskbar grouping menggabungkan semua vault ke dalam satu grup icon Obsidian.

### The Solution (Implemented)
Menggunakan API Electron `BrowserWindow.setAppDetails()` pada jendela aktif saat `workspace.onLayoutReady`:
1. Menyuntikkan **`appId`** unik per vault (`md.obsidian.vault.<sanitized_vault_name>`).
2. **Auto-Sync dengan Obsidian Appearance Icon**: Mengambil icon yang dipilih user di menu **Settings → Appearance → Advanced → "Custom app icon"** (`%APPDATA%/obsidian/icon.png`).
3. **Pure PNG-to-ICO Packaging**: Secara otomatis membungkus gambar PNG menjadi container `.ico` resmi Windows yang kompatibel dengan Windows Taskbar (`vault-taskbar.ico`).
4. Mengonfigurasi **`relaunchCommand`** (`"<process.execPath>" "obsidian://open?vault=<encoded_name>"`) dan **`relaunchDisplayName`** agar saat tombol taskbar di-pin, tombol tersebut membuka vault yang sesuai.

---

## 2. Technical Architecture & Constraints

### A. Electron & Node Resolution Strategy
- **Unbundled External**: `electron`, `@electron/remote`, `path`, dan `fs` tidak di-bundle ke file build (`external: [...]` di `esbuild.config.mjs`).
- Akses modul melalui safe `window.require`:
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

### B. Icon Resolution Order (Zero-Config First)
1. **Priority 1 (Default)**: `taskbarSyncAppearance === true` (Default ON).
   - Mendeteksi file icon dari `%APPDATA%/obsidian/icon.png`.
   - Mengonversi & menyimpan cache di `<vault>/.obsidian/plugins/pakcli-local/vault-taskbar.ico`.
2. **Priority 2**: `taskbarIconPath` (Custom override di settings jika user menentukan file `.ico` atau `.png` khusus).
3. **Priority 3**: Fallback icon file di vault (`<vault>/.obsidian/icon.ico` atau plugin `icon.ico`).

### C. In-Memory PNG-to-ICO Transcoder
Windows Taskbar membutuhkan file berekstensi `.ico` yang memuat struktur ICONDIR dan ICONDIRENTRY. Fungsi `convertPngBufferToIco()` membungkus buffer PNG dengan header 22-byte standar ICO:
- `ICONDIR` (6 bytes): Reserved = 0, Type = 1 (Icon), Count = 1.
- `ICONDIRENTRY` (16 bytes): Width = 0 (256px), Height = 0 (256px), Planes = 1, BPP = 32, ImageSize = png.length, Offset = 22.
- Data payload: Buffer asli PNG.

### D. UI & Command Integration
- **Settings tab**: Terintegrasi ke dalam `MasterDetailSettingsTab` di bawah kategori `Taskbar Vault Icon (Windows)`:
  - Status banner real-time: Mendeteksi apakah icon Obsidian Appearance aktif beserta path-nya.
  - Toggle `Sync with Obsidian Appearance Icon` (rekomendasi).
  - Input `Custom Icon Path` & `Custom App ID`.
  - Tombol **"Apply Now"** untuk menerapkan langsung secara instan.
- **Command Palette**: `PakCLI Local: Reapply taskbar icon`.
- **Auto-apply on launch**: Dijalankan secara aman saat `workspace.onLayoutReady` dengan delay 500ms.

---

## 3. Implemented Files

| File | Status | Keterangan |
| :--- | :---: | :--- |
| `src/features/taskbar/types.ts` | ✅ Done | Interface settings, AppDetails, & RemoteWindow contract |
| `src/features/taskbar/taskbar.ts` | ✅ Done | Core engine: setAppDetails, Appearance detection, PNG-to-ICO, & fallback |
| `src/features/taskbar/settings.ts` | ✅ Done | UI settings tab dengan status banner dan live apply button |
| `src/settings.ts` | ✅ Done | Integrasi `TaskbarSettings` ke `PakCLILocalSettings` |
| `src/main.ts` | ✅ Done | Hook `onLayoutReady`, command registration, & settings hub tab |
| `manifest.json` | ✅ Done | `isDesktopOnly: true` |

---

## 4. Acceptance Criteria Checklist

- [x] Status 0 brief dibuat di `docs/task-bar-icon.md`.
- [x] Implementasi tidak me-load di non-Windows / mobile (silent no-op).
- [x] Otomatis membaca icon dari menu **Settings → Appearance → Custom app icon** (`%APPDATA%/obsidian/icon.png`).
- [x] Otomatis mengonversi PNG ke format valid Windows `.ico` tanpa tool pihak ketiga.
- [x] Jendela vault di Windows Taskbar mendapatkan icon unik sesuai setting/Appearance.
- [x] Command "Reapply taskbar icon" berfungsi langsung dari Command Palette.
- [x] Missing icon atau missing remote module memberikan pesan Notice informatif tanpa error uncaught / crash.
- [x] Build TypeScript & esbuild berhasil 100% dan ter-deploy otomatis ke vault.
- [x] Status diupdate ke `1` (Completed) di `docs/task-bar-icon.md`.
