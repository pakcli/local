# Brief v09: Architecture & Specification — Raw File Opener Codeblock Styling & Header Clipboard Actions

> **Status:** 🚀 IN PROGRESS / SPECIFIED  
> **Document:** `brief/v09_raw-opener-codeblock-styling-and-header-actions.md`  
> **Target Version:** `pakcli-local@1.0.13+`  
> **Scope:** `pakcli-plugin/local` — Raw File Opener: Codeblock-themed Presentation (Obsidian Modular Code Styling), Markdown Heading / Layout Distortion Suppression, and Header Clipboard Actions (`Copy Text` + `Copy File OS`).

---

## 1. Executive Summary & Problem Statement

In **v08**, the Raw File Opener introduced direct mode launching (Live Preview, Source Mode, Reading View), an in-editor banner, and Read-Only lock protection for non-markdown files (`.ps1`, `.py`, `.json`, `.ts`, `.sh`, etc.).

### The Problem
When raw code files (such as PowerShell `.ps1` or Python `.py` scripts) are viewed via Obsidian's Markdown engine, Obsidian applies markdown parsing rules to the content:
1. Lines followed by `===` or `---` are converted into massive **Setext H1 / H2 Headings** with oversized, proportional typography (sans-serif) that breaks code alignment.
2. Comments beginning with `#` become markdown headings.
3. Content does not adopt the theme's modular **codeblock aesthetic** (`var(--code-background)`, `var(--font-monospace)`, code font size, syntax tokens, line spacing).
4. The user has no quick in-editor shortcuts to copy the file's raw text content or copy the physical file directly into the OS clipboard from the banner toolbar.

### The Solution in v09
1. **Codeblock Modular Theme Styling (`is-raw-code-file`)**:
   - Automatically tag active raw file leaf containers with `.is-raw-code-file` and `data-raw-ext`.
   - Apply modular Obsidian codeblock styles across **Live Preview**, **Source Mode**, and **Reading View**:
     - Monospace typography (`var(--font-monospace)`), line height (`1.5`), and tab indentation (`4 spaces`).
     - Neutralize and suppress markdown heading enlargements (`h1-h6`, `.cm-header`, `.cm-header-1..6`) so code text remains uniform monospace code without giant font blowups.
     - Codeblock canvas styling (`var(--code-background)`), subtle borders, gutter alignment, and code token colors following Obsidian's modular theme variables.
2. **In-Editor Header Clipboard Action Buttons**:
   - **`📋 Copy Text`**: Copies the entire raw text of the opened file to the system clipboard in one click (`navigator.clipboard.writeText`) with a confirmation notice.
   - **`📁 Copy File (OS)`**: Uses the native OS clipboard integration (`copyFilesToNativeOsClipboard`) to place the physical file directly onto Windows Explorer / macOS Finder clipboard so it can be pasted anywhere in the OS.

---

## 2. Architecture & Data Flow

```
[ Active MarkdownView Leaf ]
          │
          ▼
   isManagedFile(file)?
     ├─► NO  ── Remove .is-raw-code-file & Banner
     │
     └─► YES ── Add .is-raw-code-file & data-raw-ext
               │
               ├── 1. Codeblock Styling Injection (SCSS)
               │      ├── Force font-family: var(--font-monospace)
               │      ├── Reset .cm-header / h1-6 font-size to 13px monospace
               │      ├── Background: var(--code-background)
               │      └── Gutters & line numbers styled as code editor
               │
               └── 2. Top Header Banner Render
                      ├── Info Badge: [.EXT]
                      ├── Mode Group: [Live Preview] [Source Mode] [Reading View]
                      ├── Actions Group (NEW in v09):
                      │     ├── [📋 Copy Text]      ──► navigator.clipboard.writeText(...)
                      │     └── [📁 Copy File (OS)] ──► copyFilesToNativeOsClipboard([absPath])
                      └── Lock Toggle: [🔒 Read-Only / 🔓 Editable]
```

---

## 3. Detailed Component Specifications

### 3.1 Codeblock Modular Card Styling (`src/styles/rawOpener.scss`)

When `.is-raw-code-file` is applied to the workspace leaf container:
- **Card Container (Not full-bleed black terminal)**:
  - Outer leaf retains standard note background (`var(--background-primary)`).
  - Floating card toolbar (`.raw-opener-header-banner`) has `margin: 12px 18px 0 18px`, `border-radius: 8px 8px 0 0`, and background `var(--code-background, #161618)`.
  - Floating card canvas (`.view-content`) has `margin: 0 18px 16px 18px`, `border-radius: 0 0 8px 8px`, `box-shadow: 0 4px 18px rgba(0,0,0,0.25)`, and background `var(--code-background, #161618)`.
- **Code Row Dividers (Matching Obsidian Codeblock Aesthetics)**:
  - Each code line (`.cm-line`) and Reading View row has a subtle horizontal separator (`border-bottom: 1px solid rgba(255, 255, 255, 0.07)` in dark, `rgba(0, 0, 0, 0.06)` in light).
  - Monospace font (`var(--font-monospace, Consolas, Menlo, monospace)`), font size (`12.5px`), and line height (`1.55`).
- **Heading Neutralization (Anti-Distortion & Theme-Override Proof)**:
  - `.cm-header`, `.cm-header-1..6`, `h1..h6`, and `.HyperMD-header` are enforced with `!important` to `12.5px` monospace font, normal line height, margin `0`, and row border, preventing theme overrides from blowing up headings.
- **Sleek Custom Scrollbars**:
  - Thin 6px rounded scrollbar matching the codeblock card bottom track.

### 3.2 Header Action Group Buttons (`RawOpenerManager.ts`)

Inside `renderHeaderBanner(...)`:
```ts
// Actions Group: Copy Text & Copy OS File
const actionGroup = bannerEl.createDiv({ cls: 'raw-opener-action-group' });

// 1. Copy Clipboard Text
const copyTextBtn = actionGroup.createEl('button', {
    cls: 'raw-opener-action-btn',
    text: 'Copy Text'
});
setIcon(copyTextBtn, 'copy');
copyTextBtn.setAttribute('aria-label', 'Copy file content to clipboard');
copyTextBtn.onclick = async (e) => {
    e.stopPropagation();
    const content = view.editor ? view.editor.getValue() : await this.app.vault.read(file);
    await navigator.clipboard.writeText(content);
    new Notice(`📋 Copied text of "${file.name}" to clipboard`);
};

// 2. Copy Native OS File
const copyFileBtn = actionGroup.createEl('button', {
    cls: 'raw-opener-action-btn',
    text: 'Copy File (OS)'
});
setIcon(copyFileBtn, 'file-down');
copyFileBtn.setAttribute('aria-label', 'Copy file to Native OS clipboard (can paste in Explorer/apps)');
copyFileBtn.onclick = async (e) => {
    e.stopPropagation();
    const absPath = getAbsoluteFileSystemPath(this.app, file);
    await copyFilesToNativeOsClipboard([absPath], `"${file.name}"`);
};
```

---

## 4. Verification Checklist

| Test Item | Verification Criteria | Expected Outcome |
|:---|:---|:---:|
| **Codeblock Typography** | Open script file containing `===` or `#` | Font remains monospace (13px), no gigantic H1 headers |
| **Theme Alignment** | Change Obsidian theme (e.g. Minimal, Default Dark, Default Light) | Code view background uses theme's `--code-background` and tokens |
| **Copy Text Button** | Click `[📋 Copy Text]` in header banner | File text is in clipboard; system notice displayed |
| **Copy OS File Button** | Click `[📁 Copy File (OS)]` in header banner | File is copied as native file to OS clipboard; pasteable into Windows Explorer |
| **Read-Only Compatibility** | Toggle Read-Only lock | Read-Only still blocks editing while copy buttons remain operational |
| **Tab Switching** | Switch to standard markdown note (`.md`) | `.is-raw-code-file` is removed and normal markdown note styling is restored |
