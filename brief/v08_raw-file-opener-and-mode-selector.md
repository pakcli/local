# Brief v08: Architecture & Specification — Raw File Opener with Direct Mode Launch & In-Editor Switcher

> **Status:** ✅ COMPLETED & DEPLOYED  
> **Document:** `brief/v08_raw-file-opener-and-mode-selector.md`  
> **Target Version:** `pakcli-local@1.0.12+`  
> **Scope:** `pakcli-plugin/local` — Raw File Opener: Direct Context Menu Openers (Live Preview / Source Mode / Reading View), Dynamic ViewRegistry Integration, Header Mode Switcher, and Read-Only Protection.

---

## 1. Executive Summary & Goals

Obsidian natively treats non-markdown files (`.ps1`, `.py`, `.json`, `.yaml`, `.ts`, `.csv`, `.sh`, etc.) as external binary attachments, preventing in-app viewing or editing without system apps.

The **Raw File Opener** transforms Obsidian into an all-in-one code and data editor by:
1. **Direct Context Menu Actions (No Reconfiguration Required)**:
   - When right-clicking any non-markdown file in Obsidian's File Explorer, users are provided direct action items:
     - ✨ **`Open as Raw (.EXT) - Live Preview`**
     - 📝 **`Open as Raw (.EXT) - Source Mode`**
     - 📖 **`Open as Raw (.EXT) - Reading View`**
     - ⚙️ **`Configure Raw Format (.EXT)...`** (Settings & defaults modal)
2. **Native Markdown-Like Experience**:
   - Files open in Obsidian editor tabs exactly like standard notes (`MarkdownView`).
   - Standard Obsidian navigation, hotkeys (<kbd>Ctrl</kbd>+<kbd>E</kbd>), and leaf splits work seamlessly.
3. **In-Editor Header Banner**:
   - An elegant toolbar is automatically mounted at the top of opened raw files with:
     - Extension badge (e.g. `.PS1`, `.JSON`, `.PY`).
     - Quick 1-click mode switcher buttons (`Live Preview`, `Source Mode`, `Reading View`).
     - Instant Read-Only lock toggle (`🔒 Read-Only` / `🔓 Editable`).
4. **Read-Only Lock Protection**:
   - When locked, DOM-level keyboard interception prevents accidental text editing, deletion, or cut/paste while preserving search (<kbd>Ctrl</kbd>+<kbd>F</kbd>) and text copying (<kbd>Ctrl</kbd>+<kbd>C</kbd>).

---

## 2. Context Menu Flow: Direct Launch vs Reconfigure

Prior to v08, right-clicking a non-`.md` file only offered a single modal trigger: `PakCLI: Configure Raw Format (.PS1)...`. This forced users to configure rules before they could simply view a file.

### v08 Enhanced Menu Structure:

```
[ Right-Click on any non-.md file (e.g. script.ps1) ]
│
├── 📋 Copy as a file (Native OS)             --> Copies file object to OS clipboard
├── ...
├── [Separator]
├── ✨ Open as Raw (.PS1) - Live Preview      --> Opens tab directly in Live Preview mode
├── 📝 Open as Raw (.PS1) - Source Mode       --> Opens tab directly in Raw Monospace Source mode
├── 📖 Open as Raw (.PS1) - Reading View      --> Opens tab directly in Rendered Reading View
└── ⚙️ Configure Raw Format (.PS1)...          --> Opens quick configuration & presets modal
```

---

## 3. Core Engine Mechanics (`RawOpenerManager.ts`)

### 3.1 Dynamic `viewRegistry` Registration
```ts
public ensureExtensionRegistered(extension: string) {
    const cleanExt = extension.toLowerCase().replace(/^\./, '').trim();
    if (!cleanExt || cleanExt === 'md') return;
    if (!this.registeredExtensions.has(cleanExt)) {
        this.registeredExtensions.add(cleanExt);
        const viewRegistry = (this.app as any).viewRegistry;
        if (viewRegistry && typeof viewRegistry.registerExtensions === 'function') {
            viewRegistry.registerExtensions([cleanExt], 'markdown');
        }
    }
}
```

### 3.2 Direct Leaf Launch in Target Mode
When any "Open as Raw" action is selected:
```ts
public async openFileInMode(file: TFile, mode: RawFileMode, newTab = false): Promise<WorkspaceLeaf | null>
```
1. Registers the extension dynamically if not previously registered.
2. Locates an existing leaf displaying the file or spawns a new tab.
3. Pre-configures leaf state:
   - `live`: `mode: 'source', source: false`
   - `source`: `mode: 'source', source: true`
   - `reading`: `mode: 'preview'`
4. Enforces the mode and mounts the header banner toolbar.

### 3.3 Non-Destructive Active Leaf Tracking
To prevent tab-switching from resetting user-selected view modes:
- `file-open` event applies the default/saved rule mode.
- `active-leaf-change` reads the leaf's active state (`getLeafMode(leaf)`) and updates the banner highlight dynamically without overriding the active view.

---

## 4. Supported Default Formats

27+ popular formats are pre-configured in `DEFAULT_RAW_RULES`:
- **Scripts**: `.ps1`, `.psm1`, `.psd1`, `.sh`, `.bash`, `.zsh`, `.bat`, `.cmd`
- **Data & Config**: `.json`, `.yaml`, `.yml`, `.toml`, `.csv`, `.tsv`, `.xml`, `.ini`, `.env`, `.sql`
- **Programming**: `.py`, `.js`, `.ts`, `.rs`, `.go`, `.c`, `.cpp`
- **Web & Logs**: `.html`, `.css`, `.txt`, `.log`

---

## 5. Verification Checklist

| Test Case | Expected Result | Status |
|:---|:---|:---:|
| Right-click `.ps1` in File Explorer | Context menu shows Live Preview, Source Mode, Reading View options | ✅ PASS |
| Select "Open as Raw - Live Preview" | Opens file in Live Preview mode with top banner active | ✅ PASS |
| Select "Open as Raw - Source Mode" | Opens file in raw monospace editor with line numbers | ✅ PASS |
| Select "Open as Raw - Reading View" | Opens file in rendered markdown preview | ✅ PASS |
| Click mode button in top banner | Swaps mode instantly without reloading the tab | ✅ PASS |
| Toggle Read-Only lock in banner | Blocks typing/paste while keeping copy/find functional | ✅ PASS |
| Build & deploy | Compiles cleanly via `npm run build` to vault directory | ✅ PASS |
