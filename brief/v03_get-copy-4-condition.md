# Developer Brief: CopyPaste Manager Dynamic Target Filter Engine (5 Core Controls & Rule Actions)

- **Feature**: Multi-Condition Rule-Based File Filter & Vault Importer for CopyPaste Manager
- **Module**: `pakcli-local` -> `src/features/copypaste/`
- **Target Audience**: Obsidian Desktop Developers & Content Curators

---

## 1. Objective & Problem Statement

Previously, **CopyPaste Manager** (formerly *GetCopy*) relied primarily on rigid, static 1:1 directory pipelines that processed entire folders without granular filtering. In real-world multi-project setups:
- Users only want specific file types (e.g. `.md`, `.json`, `.ps1`, or custom extensions like `.sample`).
- Specific subdirectories or nested folders within the target need inclusion/exclusion logic (`contains`, `exact`, `case-sensitive`).
- Filenames need pattern matching without requiring complex regex syntax by default.
- Files need to be directed into a designated **Target in Vault Directory** (destination inside Obsidian) with autocomplete suggestions from existing vault folders.
- Users need immediate scan feedback (matched files count + preview) and a 1-click **Copy to Vault** routine.

This feature introduces the **5-Control Target Filter Rule Engine**, empowering users to define, duplicate, scan, inspect, and copy files directly into their Obsidian vault.

---

## 2. Core Architecture & The 5 Key Controls

Each Target Filter Rule consists of 5 primary control groups:

| # | Element | Type | Description |
|---|---|---|---|
| **1** | **Target Path (Source)** | Text Input + Folder Picker | Source directory path on local disk with browse button (`📂 Browse`). Supports relative or absolute OS paths. |
| **2** | **Target in Vault Directory** | Autocomplete Input + Modal Picker | Destination folder inside Obsidian vault with real-time `VaultFolderSuggest` autocomplete and `📁 Vault Folder` fuzzy modal picker. |
| **3** | **Target Path Include** | Match Mode Select + Input | Filter directory paths: `All` \| `Contains` \| `Path Exact` \| `Exact Case Letter`. |
| **4** | **Filename Filter** | Match Mode Select + Input | Filter filenames: `All` \| `Contains` \| `Name Exact` \| `Exact Case Letter`. |
| **5** | **File Format Checklist** | Multi-Select Dropdown + Custom Input | Checklist of standard extensions (`.md`, `.json`, `.csv`, etc.) + flexible multi-format adder supporting prefix/suffix dots and commas (`.sample`, `sample.`, `.sample.`, `sample,`). |

### Additional Rule Actions:
- `🔄 Rescan`: Recursively scans source disk path and updates match counter.
- `📥 Copy to Vault`: Safely copies all matched files directly into the destination vault folder while preserving relative subpaths.
- `📋 Duplicate`: Clones rule parameters without matched cache.
- `🗑️ Delete`: Safely removes rule with prompt confirmation.

---

## 3. Filter Specification & Matching Rules

### 3.1 Match Modes

```typescript
export type FilterMatchMode = 'all' | 'contains' | 'exact' | 'exact_case';
```

1. **`all`**: Matches all files unconditionally (bypasses check).
2. **`contains`**: Case-insensitive substring match against directory path segments (e.g. `brief` matches `d:/pro/local/brief/note.md`).
3. **`exact`**: Case-insensitive exact string match.
4. **`exact_case`**: Case-sensitive exact string or substring match.

### 3.2 Flexible Multi-Format Adder Engine

The format popup allows both standard checkboxes (`.md`, `.json`, `.csv`, `.js`, `.ts`, `.db`, `.docs`, `.txt`, `.ps1`, `.sh`, `.yaml`) and a **Flexible Multi-Format Input**:
- **Prefix / Suffix Tolerant**: Strips leading and trailing dots (`.`), commas (`,`), semicolons (`;`), pipes (`|`), slashes (`/`), or whitespace.
- **Multiple Inputs in One Go**: Delimited by comma, pipe, space, semicolon, or `or`/`and` keywords.
- **Auto Normalization**:
  - `.sample` $\rightarrow$ `sample`
  - `sample.` $\rightarrow$ `sample`
  - `.sample.` $\rightarrow$ `sample`
  - `,sample,` $\rightarrow$ `sample`
  - `sample | .sample | sample.` $\rightarrow$ deduplicated to single `sample`
  - `.py, sql., ,log, , .cpp.` $\rightarrow$ `['py', 'sql', 'log', 'cpp']`

---

## 4. UI / UX Wireframe: Settings, Card View & Table View

### 4.1 Top Level View Switcher Toolbar
```
+----------------------------------------------------------------------------------------------------+
| 🎯 Target Vault Rules                               [🗂️ Card View]  [📊 Table View]  [+ Add Rule] [🔄 Rescan All] |
+----------------------------------------------------------------------------------------------------+
```

### 4.2 Mode A: Target Vault Rule Card View (5 Controls)

```
+----------------------------------------------------------------------------------------------------+
|  RULE #1 TARGET PATH (SOURCE):                                                                     |
|  [ D:/0pro/pakcli-plugin                                                          ] [ 📂 Browse ]  |
|                                                                                                    |
|  TARGET IN VAULT DIRECTORY (DESTINATION):                                                          |
|  [ Briefs/Imported                                                      ] [ 📁 Vault Folder ]      |
|  (Autocomplete suggestion pops up as user types: "Briefs", "Notes/CLI", "Archive"...)              |
|                                                                                                    |
|  +-----------------------------------------------------------------------------------------------+ |
|  | TARGET PATH INCLUDE:          | FILENAME FILTER:               | FILE FORMAT CHECKLIST:       | |
|  | [ Contains             ▾ ]    | [ All                  ▾ ]     | [ .md (+0)                 ▾ ] | |
|  | [ brief                  ]    |                                |                              | |
|  +-----------------------------------------------------------------------------------------------+ |
|                                                                                                    |
|  ACTIVE FILTERS:                                                                                   |
|  ( VAULT: "Briefs/Imported" ✕ )  ( PATH CONTAINS: "brief" ✕ )  ( FORMATS: md ✕ )                   |
|                                                                                                    |
|  [ 🔄 Rescan ]   (✓ 16 files matched - View)   [ 📥 Copy to Vault ]   [ 📋 Duplicate ] [ 🗑️ Delete ]|
|                                                                                                    |
|  ▼ Matched Files (16):                                     [ 📋 Copy All Paths ] [ 📥 Copy All to Vault ]
|  +-----------------------------------------------------------------------------------------------+ |
|  | D:/0pro/pakcli-plugin/local/brief/v01_YT & IG Downloader.md                           [ Copy ]| |
|  | D:/0pro/pakcli-plugin/local/brief/v02_local-script-sync.md                           [ Copy ]| |
|  | D:/0pro/pakcli-plugin/panel/brief/v04_triad_writing_modes.md                          [ Copy ]| |
|  | D:/0pro/pakcli-plugin/tierlist/brief/v1-quickcompare.md                               [ Copy ]| |
|  +-----------------------------------------------------------------------------------------------+ |
+----------------------------------------------------------------------------------------------------+
```

### 4.3 Mode B: Target Vault Table View Wireframe

```
+-----------------------------------------------------------------------------------------------------------------------+
| # | Source Target Path      | Vault Destination | Path Filter       | Filename Filter | Formats | Matches | Actions   |
|---|-------------------------|-------------------|-------------------|-----------------|---------|---------|-----------|
| 1 | [D:/0pro/pakcli...] [📁]| [Briefs/...]  [📁] | [Contains▾][brief]| [All▾]          | [.md▾]  |(✓ 16▾)  |[🔄][📥][📋][🗑️]|
| 2 | [D:/repos/my-cli..] [📁]| [CLI/Scripts] [📁] | [All▾]            | [Contains▾][log]| [.txt▾] |(0)      |[🔄][📋][🗑️]   |
+-----------------------------------------------------------------------------------------------------------------------+
| ▼ Row #1 Matched Files (16):                                             [ 📋 Copy All Paths ] [ 📥 Copy All to Vault ]|
|   • D:/0pro/pakcli-plugin/local/brief/v01_YT & IG Downloader.md                                                [ Copy ]|
|   • D:/0pro/pakcli-plugin/local/brief/v02_local-script-sync.md                                                [ Copy ]|
+-----------------------------------------------------------------------------------------------------------------------+
```

### 4.3 Vault Folder Autocomplete Suggestion Popup Wireframe

```
                     [ Brief                         ]
                     +-------------------------------+
                     | 📁 Briefs                     |
                     | 📁 Briefs/Imported            |
                     | 📁 Notes/Briefs               |
                     | 📁 Projects/ArchivedBriefs    |
                     +-------------------------------+
```

### 4.4 File Format Checklist Dropdown Popup Wireframe

```
                     +---------------------------------------------+
                     | [ All ]         [ Clear ]             [ ✕ ] |
                     +---------------------------------------------+
                     | [✓] .md                                     |
                     | [ ] .ts                                     |
                     | [ ] .js                                     |
                     | [ ] .json                                   |
                     | [ ] .csv                                    |
                     | [ ] .db                                     |
                     | [ ] .docs (doc, docx)                       |
                     | [ ] .txt                                    |
                     | [ ] .ps1                                    |
                     | [ ] .sh                                     |
                     | [✓] .sample                           [ ✕ ] |
                     +---------------------------------------------+
                     | [ e.g. .sample, sample., py | log   ] [+Add]|
                     +---------------------------------------------+
```

---

## 5. TypeScript Data Contract

```typescript
export type FilterMatchMode = 'all' | 'contains' | 'exact' | 'exact_case';

export interface TargetFilterRule {
    id: string;
    name?: string;
    
    // Control 1: Source Path on Local Disk
    targetPath: string;

    // Control 2: Destination Folder inside Obsidian Vault
    targetVaultDir?: string;
    
    // Control 3: Path Include Filter
    pathIncludeMode: FilterMatchMode;
    pathIncludePattern: string;

    // Control 4: Filename Filter
    filenameMode: FilterMatchMode;
    filenamePattern: string;

    // Control 5: File Extensions (Checklist + Custom)
    formats: string[];

    // Runtime Diagnostics
    lastMatchedCount?: number;
    lastMatchedFiles?: string[];
    isScanning?: boolean;
}

export interface CopyPasteSettings {
    // Legacy Directory Pipelines
    copyPastePipelines: CopyPastePipelineItem[];
    copyPasteAutoScanOnAwake: boolean;

    // Dynamic Filter Rules (5 Controls)
    targetRules: TargetFilterRule[];
}
```

---

## 6. Vault Copy Execution Logic

When user clicks `📥 Copy to Vault`:
1. Resolves absolute disk path of the vault using `manager.getVaultRoot()`.
2. Computes destination directory: `PathUtils.join(vaultRoot, rule.targetVaultDir)`.
3. If source file is a descendant of `rule.targetPath`, it preserves the relative subfolder structure (e.g. `Briefs/Imported/local/brief/v01.md`).
4. Creates subdirectories recursively if needed.
5. Copies each file with `fs.copyFileSync`.
6. Issues Notice: `✓ Copied N file(s) into vault: "Briefs/Imported"`.
