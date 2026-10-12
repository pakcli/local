# 📌 Master Brief: Per-Vault Windows Taskbar Icon via Vault Artifacts (`pakcli-local`)

> **Feature Status**: `1` (Implemented & Verified)  
> **Target Module**: `pakcli-local`  
> **Platform**: Windows Desktop (`Platform.isDesktopApp && process.platform === 'win32'`)  
> **Date**: 2026-10-12  

---

## 1. Objective & Problem Statement

### The Problem
Penggunaan file global `%APPDATA%\obsidian\icon.png` menyebabkan 2 masalah utama:
1. **Kurang Isolasi**: Seluruh vault di komputer berbagi satu file `%APPDATA%`, sehingga perubahan icon di satu vault mengacaukan atau menimpa vault lain.
2. **Glitch Taskbar (Strip Hitam / Blank)**: Dimensi file PNG yang di-wrap ke `.ico` tanpa membaca ukuran header asli (IHDR) menyebabkan Windows DWM gagal merender icon di taskbar.

### The Solution (Vault Artifacts Relocation)
Relokasi icon ke folder lokal vault masing-masing:
- **Lokasi Utama**: `<vault>/artifacts/icon.ico` (atau `icon.png`).
- Mendukung folder `<vault>/artifact/` dan `<vault>/.obsidian/icons/` sebagai alias.
- **1-Click Relocation**: Menyediakan tombol di Settings Hub dan Command Palette ("Taskbar: Save Appearance Icon to Vault Artifacts") untuk meng-copy icon dari menu Appearance langsung ke `<vault>/artifacts/icon.ico` secara otomatis.
- **Dynamic PNG Dimension Parser**: Membaca lebar & tinggi asli dari header IHDR PNG (offset 16-24) agar header ICO sesuai spesifikasi Windows Shell dan tidak glitch hitam.

---

## 2. Technical Architecture & Constraints

### A. Icon Hierarchy (Per-Vault First)
1. **Priority 1**: `<vaultBase>/artifacts/icon.ico` atau `<vaultBase>/artifacts/icon.png`.
2. **Priority 2**: `<vaultBase>/artifact/icon.ico` atau `<vaultBase>/artifact/icon.png`.
3. **Priority 3**: Custom path yang diatur secara manual oleh user di setting.
4. **Priority 4**: `<vaultBase>/.obsidian/plugins/pakcli-local/icon.ico`.
5. **Fallback Utility**: Tombol "Save Appearance Icon to Artifacts" untuk menduplikasi icon Appearance ke `artifacts/icon.ico` lokal vault.

### B. Precise ICO Wrapping
Membaca dimensi dari buffer PNG:
```typescript
const width = pngBuf.readUInt32BE(16);
const height = pngBuf.readUInt32BE(20);
const icoWidth = width >= 256 ? 0 : width;
const icoHeight = height >= 256 ? 0 : height;
```
Menghasilkan file `.ico` yang 100% valid untuk Windows Taskbar tanpa black/blank visual artifact.

---

## 3. Implemented Files

| File | Status | Keterangan |
| :--- | :---: | :--- |
| `src/features/taskbar/types.ts` | ✅ Done | Interface settings, AppDetails, & RemoteWindow contract |
| `src/features/taskbar/taskbar.ts` | ✅ Done | Relokasi pencarian ke `<vault>/artifacts/`, dynamic IHDR sizing, & copy utility |
| `src/features/taskbar/settings.ts` | ✅ Done | UI update: path artifacts indicator & 1-click copy button |
| `src/main.ts` | ✅ Done | Command Palette & layout-ready hook |
| `docs/task-bar-icon.md` | ✅ Done | Brief status 1 tracking |

---

## 4. Acceptance Criteria Checklist

- [x] Status 0 brief dibuat dan di-commit ke Git repo (`107ea40`).
- [x] Icon dicari dan dimuat dari `<vault>/artifacts/icon.ico` atau `icon.png`.
- [x] Dimensi PNG dibaca dinamis dari IHDR (bebas glitch hitam/blank).
- [x] Tombol "Save Appearance Icon to Artifacts" meng-copy icon ke `<vault>/artifacts/` dan menerapkan taskbar.
- [x] Command Palette: "Taskbar: Save Appearance Icon to Vault Artifacts".
- [x] Status diupdate ke `1` (Completed), build clean, dan di-commit.
