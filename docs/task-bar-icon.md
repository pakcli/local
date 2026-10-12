# 📌 Master Brief: Strict Artifacts-Only Icon Storage (`pakcli-local`)

> **Feature Status**: `0` (Draft / Pending Implementation)  
> **Target Module**: `pakcli-local`  
> **Platform**: Windows Desktop (`Platform.isDesktopApp && process.platform === 'win32'`)  
> **Date**: 2026-10-12  

---

## 1. Objective & Problem Statement

### The Problem
Sebelumnya, fungsi fallback `resolveVaultCacheIcoPath()` masih mengarahkan penulisan file `.ico` hasil konversi ke dalam folder internal plugin:
`<vault>/.obsidian/plugins/pakcli-local/vault-taskbar.ico`.
Hal ini tidak sesuai dengan arsitektur yang diinginkan:
- Folder plugin seharusnya hanya berisi artefak plugin (`main.js`, `manifest.json`, `styles.css`).
- Seluruh icon kustom vault (`icon.ico` dan `icon.png`) **wajib berada di folder root vault: `<vault>/artifacts/`**.

### The Solution (Strict Artifacts Storage)
1. **Penyimpanan Eksklusif di `artifacts/`**:
   - Lokasi `.ico`: `<vaultRoot>/artifacts/icon.ico`.
   - Lokasi `.png`: `<vaultRoot>/artifacts/icon.png`.
   - Jika folder `artifacts/` belum ada di root vault, otomatis dibuat dengan `mkdirSync({ recursive: true })`.
2. **Hapus Seluruh Referensi Penulisan ke Folder Plugin**:
   - `ensureIcoFile()` dan fungsi konversi manapun **tidak boleh lagi** menulis ke `.obsidian/plugins/pakcli-local/`.
   - Menghapus file sampah `vault-taskbar.ico` di folder plugin jika masih ada.

---

## 2. Technical Architecture & Constraints

```typescript
export function resolveVaultArtifactsIcoPath(plugin: PakCLILocalPlugin): string {
  const vaultBase = getVaultRootPath(plugin);
  const artifactsDir = path.join(vaultBase, 'artifacts');
  if (!fs.existsSync(artifactsDir)) {
    fs.mkdirSync(artifactsDir, { recursive: true });
  }
  return path.join(artifactsDir, 'icon.ico');
}
```

---

## 3. Planned Files & Changes

| File | Status | Keterangan |
| :--- | :---: | :--- |
| `src/features/taskbar/taskbar.ts` | ⏳ Pending | Ganti `resolveVaultCacheIcoPath` menjadi penyimpanan eksklusif di `<vault>/artifacts/icon.ico` |
| `docs/task-bar-icon.md` | ⏳ Pending | Brief status tracking |

---

## 4. Acceptance Criteria Checklist

- [ ] Status 0 brief dibuat dan di-commit ke Git repo.
- [ ] Penulisan file `.ico` murni dan eksklusif ke `<vaultRoot>/artifacts/icon.ico`.
- [ ] Folder internal plugin tidak lagi menjadi target penulisan file icon.
- [ ] Build clean dan auto-deployed ke vault.
- [ ] Status diupdate ke `1` (Completed) dan di-commit.
