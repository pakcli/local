# 📌 Master Brief: Strict Multi-Vault Window Isolation for Taskbar (`pakcli-local`)

> **Feature Status**: `1` (Implemented & Verified)  
> **Target Module**: `pakcli-local`  
> **Platform**: Windows Desktop (`Platform.isDesktopApp && process.platform === 'win32'`)  
> **Date**: 2026-10-12  

---

## 1. Objective & Problem Statement

### The Problem
Dalam environment Electron Obsidian, `BrowserWindow.getAllWindows()` mengembalikan seluruh jendela dari **seluruh vault yang sedang terbuka secara bersamaan**.
Jika satu plugin vault memanggil `setAppDetails()` ke seluruh window tanpa memfilter pemilik vault:
- Jendela Vault B secara keliru tertimpa `appId` dari Vault A!
- Vault A dan Vault B malah ter-group / collapse menjadi satu grup taskbar, merusak isolasi independen per-vault!

### The Solution (Strict Vault Boundary & Title Matching)
Setiap instance plugin PakCLI Local **HANYA BOLEH** menyentuh jendela yang terbukti milik vault tersebut:
1. **Main Window**: Selalu milik vault ini (`remote.getCurrentWindow()`).
2. **Sub-Window (Settings / Popouts)**: Hanya diproses jika dan hanya jika judul jendela (`win.getTitle()`) memuat nama vault aktif ini (format Obsidian: `"... - <VaultName> - Obsidian ..."`).
3. **Jendela Vault Lain**: **MUTLAK DIABAIKAN (SKIP)** dan tidak akan pernah diubah atau digabung dengan jendela vault ini!

---

## 2. Technical Architecture & Constraints

```typescript
export function isWindowBelongingToVault(win: ElectronRemoteWindow, vaultName: string, mainWinId?: number): boolean {
  if (mainWinId && win.id === mainWinId) return true;
  const anyWin = win as any;
  const title = typeof anyWin.getTitle === 'function' ? anyWin.getTitle() : '';
  if (!title) return false;

  return (
    title.includes(` - ${vaultName} - `) ||
    title.endsWith(` - ${vaultName}`) ||
    title.includes(` ${vaultName} `) ||
    title === vaultName
  );
}
```

---

## 3. Implemented Files

| File | Status | Keterangan |
| :--- | :---: | :--- |
| `src/features/taskbar/taskbar.ts` | ✅ Done | Filter ketat `isWindowBelongingToVault` pada perulangan jendela & lifecycle watcher |
| `src/features/taskbar/settings.ts` | ✅ Done | Dropdown 3 opsi & note restart app |
| `docs/task-bar-icon.md` | ✅ Done | Brief status 1 tracking |

---

## 4. Acceptance Criteria Checklist

- [x] Status 0 brief dibuat dan di-commit ke Git repo (`4babd4b`).
- [x] Jendela milik vault lain tidak pernah diubah atau di-collapse.
- [x] Jendela Settings dan sub-window milik vault ini tetap terkelola sesuai dropdown 3 opsi.
- [x] Build clean dan auto-deployed ke vault.
- [x] Status diupdate ke `1` (Completed) dan di-commit.
