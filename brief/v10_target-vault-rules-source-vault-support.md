# Brief v10: Architecture & Specification — Target Vault Rules Self-Vault Source Support & Dual Pickers

> **Status:** 🚀 IMPLEMENTED / SPECIFIED  
> **Document:** `brief/v10_target-vault-rules-source-vault-support.md`  
> **Target Version:** `pakcli-local@1.0.13+`  
> **Scope:** `pakcli-plugin/local` — Target Vault Rules: Self-Vault Source Support (Current Active Vault), Dual Directory Pickers (OS Disk vs Active Vault), Vault Folder Autocomplete (`VaultFolderSuggest`), Safe Relative Path Resolution, Anti Self-Copy Protection, and Bi-Directional Vault Reindexing.

---

## 1. Executive Summary & Problem Statement

In previous versions of the **CopyPaste Manager (Target Vault Rules)**, the **Source Target Path** (`rule.targetPath`) assumed all source directories were external physical folders on the local operating system disk (e.g. `D:\projects\code` or `C:\Users\...`).

### The Problem
1. **No Vault-as-Source Support**: Users frequently need to scan, filter, and synchronize directories situated *inside* the current active Obsidian Vault itself (e.g., pulling notes from `Briefs/` or `Notes/CLI/` into another vault folder or an external staging folder).
2. **Path Resolution Failures**: If a user typed a vault-relative path like `Briefs` or `/`, Node's `fs.existsSync(...)` evaluated it against `process.cwd()` instead of the Obsidian vault's base path (`app.vault.adapter.getBasePath()`), causing scans to return 0 matches.
3. **Missing Vault UI Pickers on Source**: The `Source Target Path` column only provided an OS native file dialog (`Browse [📁]`), while `Vault Destination` had both autocomplete suggestions and a dedicated vault folder picker modal (`[folder-symlink]`).
4. **Self-Copy Risk**: When source and destination both point to folders inside the same active vault (or identical folders on disk), naive copy routines could overwrite files with themselves or produce infinite loops.

### The Solution in v10
1. **Intelligent Path Resolution (`resolveRuleSourcePath`)**:
   - Seamlessly resolves paths pointing to the **current active vault** (`/`, `.`, `<vault>`, `<vault>/path`, `vault://path`, or vault-relative folders like `Briefs` and `notes/cli`).
   - Automatically checks if the target exists on local disk or inside the active vault root.
2. **Dual Pickers & Autocomplete on Source (Table View & Card View)**:
   - **`[folder-symlink] Pick Vault Folder`**: Opens `FolderPickerModal` listing all folders in the active vault, including `/ (Vault Root)`.
   - **`[📁] Browse OS Folder`**: Retains native OS folder browsing for external drives and projects.
   - **Live Autocomplete (`VaultFolderSuggest`)**: Typing in the source input immediately suggests matching folders within the active vault.
3. **Safe Bi-Directional Transfer & Auto-Reindexing**:
   - Detects if Source and Destination are identical and prevents destructive self-copying.
   - Automatically triggers Obsidian vault cache re-indexing (`reindexVaultFolder`) on the active vault whenever files are pushed or pulled into any vault folder.

---

## 2. Architecture & Data Flow

```
[ User Input / Folder Picker in Table or Card View ]
                     │
    ┌────────────────┴────────────────┐
    ▼                                 ▼
[ Native OS Disk ]           [ Active Vault Folder ]
 (e.g. D:/Projects)          (e.g. "Briefs", "Notes/CLI", "/")
    │                                 │
    └────────────────┬────────────────┘
                     ▼
       resolveRuleSourcePath(targetPath, vaultRoot)
                     │
         ┌───────────┴───────────┐
         ▼                       ▼
    [ Local Disk ]       [ Active Vault Root ]
    (isAbsolute &&        (vaultRoot + relPath)
     fs.existsSync)
         │                       │
         └───────────┬───────────┘
                     ▼
           scanDirectoryForRule(...)
                     │
         ┌───────────┴───────────┐
         ▼                       ▼
   Format Filter           Path & Filename Filter
  (.md, .json, etc.)     (Contains / Exact / Exact Case)
                     │
                     ▼
        [ Matched Files (Full Paths) ]
                     │
    ┌────────────────┼────────────────┐
    ▼                ▼                ▼
[ Rescan Count ]  [ Diff & Sync ]  [ Directional Transfer ]
  (Badge Click)    (2-Way Modal)   (Push ➔ / Pull ⬅)
                                      │
                                      ▼
                        reindexVaultFolder(app, vaultPath)
```

---

## 3. Detailed Component Specifications

### 3.1 Path Resolution Engine (`src/features/copypaste/ruleMatcher.ts`)

`resolveRuleSourcePath(targetPath: string, vaultRoot?: string): string` provides robust multi-mode resolution:

```ts
export function resolveRuleSourcePath(targetPath: string, vaultRoot?: string): string {
    const raw = (targetPath || '').trim();
    if (!raw) return '';
    const fs = getNodeFs();

    // 1. Vault root keywords & special prefixes
    if (vaultRoot) {
        const lower = raw.toLowerCase();
        if (raw === '/' || raw === '.' || lower === '<vault>' || lower === 'vault') {
            return vaultRoot;
        }
        if (lower.startsWith('<vault>/') || lower.startsWith('<vault>\\')) {
            const rel = raw.substring(8).replace(/^[/\\]+/, '');
            return PathUtils.join(vaultRoot, rel);
        }
        if (lower.startsWith('vault://')) {
            const rel = raw.substring(8).replace(/^[/\\]+/, '');
            return PathUtils.join(vaultRoot, rel);
        }
    }

    // 2. If it's an existing absolute path on disk
    if (fs && fs.existsSync(raw)) {
        return raw;
    }

    // 3. Vault-relative path check
    if (vaultRoot) {
        const cleanRel = raw.replace(/^[/\\]+/, '');
        const vaultCandidate = PathUtils.join(vaultRoot, cleanRel);
        if (fs && fs.existsSync(vaultCandidate)) {
            return vaultCandidate;
        }

        // Default relative or slash-leading path to vault directory
        if (!PathUtils.isAbsolute(raw) || raw.startsWith('/') || raw.startsWith('\\')) {
            return vaultCandidate;
        }
    }

    return raw;
}
```

### 3.2 Dual Pickers & Suggestions UI (`TargetRulesView.ts`)

Both **Table View** and **Card View** feature symmetrical dual controls for source selection:

1. **Table View Row**:
   - `input`: `placeholder: 'Vault folder (e.g. Briefs, /) or OS path...'`
   - `VaultFolderSuggest`: Live autocomplete while typing.
   - `[folder-symlink]` Button: `title: 'Pick folder from active Vault'` -> Opens `FolderPickerModal`.
   - `[folder]` Button: `title: 'Browse local OS folder'` -> Opens OS native dialog (`browseFolder`).

2. **Card View Block**:
   - Field Header: `Rule #X Source Target Path (Vault or Local Disk):`
   - `[Vault Folder]` Action Button with `folder-symlink` icon.
   - `[Browse OS]` Action Button with `folder` icon.

### 3.3 Folder Picker Vault Root Support (`FolderPicker.ts`)

`getAllVaultFolders(app, includeRoot = true)` now includes `/` with home icon indicator (`🏠 / (Vault Root)`), allowing users to target the entire vault root as either source or destination.

### 3.4 Safe Bi-Directional Sync & Diff (`CopyPasteManager.ts`)

- **Anti Self-Copy Guard**:
  ```ts
  if (PathUtils.join(sourceRoot).toLowerCase() === PathUtils.join(vaultDestDir).toLowerCase()) {
      return { success: false, copied: 0, error: 'Source and Vault Destination are the exact same directory.' };
  }
  ```
- **Obsidian Cache Re-indexing**:
  Any file operation that writes into a path inside the vault triggers `reindexVaultFolder(app, relPath)`, ensuring instant reflection in the Obsidian file explorer without requiring a vault reload.

---

## 4. Verification Checklist

| Test Item | Verification Criteria | Expected Outcome |
|:---|:---|:---:|
| **Vault Folder Suggestion** | Type `brie` in Source Target Path input | Suggestion popup shows `📁 Briefs` |
| **Vault Root Selection** | Select `/ (Vault Root)` via picker modal | Input value set to `/`; scans entire active vault |
| **Relative Path Resolution** | Enter `brief` in Source Target Path and click Rescan | Correctly matches markdown files inside `<vault>/brief` |
| **External OS Path** | Pick `D:\projects\scripts` via `[Browse OS]` | Scans external filesystem directory without vault prefix |
| **Push Matched to Vault** | Click `➔ Push to Vault` with source inside active vault | Copies files to target vault folder; Obsidian re-indexes |
| **Pull Vault to Source** | Click `⬅ Pull to Source` with source inside active vault | Copies files back to source folder inside vault |
| **Self-Copy Prevention** | Set Source = `Briefs` and Destination = `Briefs` | Transfer blocked with informative notice; no files corrupted |
| **2-Way Diff Viewer** | Open Diff Modal between two vault folders | Shows side-by-side diff between the two vault locations |
