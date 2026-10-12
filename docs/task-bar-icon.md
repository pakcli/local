# 📌 Master Brief: Strict Multi-Vault Window Isolation for Taskbar (`pakcli-local`)

> **Feature Status**: `0` (Draft / Pending Implementation)  
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
function isWindowBelongingToVault(win: any, vaultName: string, mainWinId?: number): boolean {
  if (win.id && mainWinId && win.id === mainWinId) return true;
  const title = typeof win.getTitle === 'function' ? win.getTitle() : '';
  // Format Obsidian title: "<Note/Page> - <VaultName> - Obsidian <Version>"
  return title.includes(` - ${vaultName} - `) || title.endsWith(` - ${vaultName}`);
}
```

---

## 3. Planned Files & Changes

| File | Status | Keterangan |
| :--- | :---: | :--- |
| `src/features/taskbar/taskbar.ts` | ⏳ Pending | Filter ketat `isWindowBelongingToVault` pada perulangan jendela |
| `docs/task-bar-icon.md` | ⏳ Pending | Brief status tracking |

---

## 4. Acceptance Criteria Checklist

- [ ] Status 0 brief dibuat dan di-commit ke Git repo.
- [ ] Jendela milik vault lain tidak pernah diubah atau di-collapse.
- [ ] Jendela Settings dan sub-window milik vault ini tetap terkelola sesuai dropdown 3 opsi.
- [ ] Build clean dan auto-deployed ke vault.
- [ ] Status diupdate ke `1` (Completed) dan di-commit.
