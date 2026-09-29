# Brief v02: Arsitektur Local Git Snapshot Engine & UI/UX Wireframe

> **Status:** Proposed Architecture & UI/UX Design  
> **Scope:** `pakcli-plugin/local` & Obsidian Vault Workspaces  
> **Core Goal:** Local-first, zero-pollution Git Snapshot Engine yang mampu mendeteksi semua folder dan Symlink/Junction di dalam Vault, dengan antarmuka 1-Click Snapshot, AI Diff Exporter ke Clipboard, & Granular Restore.

---

## 1. Konsep Inti & Fitur Utama

1. **Vault-Wide Multi-Repo Discovery:**
   - Menelusuri seluruh folder di dalam Obsidian Vault.
   - Menggunakan engine `detectLink()` PakCLI untuk mendeteksi apakah folder tersebut adalah **Windows Junction** atau **Symlink**, lalu me-resolve ke target fisik proyek eksternal (misal: `D:\0pro\node-income-pocket-expence`).
   - Memeriksa apakah direktori tersebut merupakan repositori Git aktif.
2. **Local-Only Git Plumbing (`refs/snapshots/*`):**
   - Checkpointing instan menggunakan `git stash create` tanpa mengganggu *working directory* (file tidak di-reset, editor tidak reload).
   - Snapshot disimpan di bawah namespace `refs/snapshots/` lokal, sehingga **100% aman dan tidak pernah ter-push ke GitHub**.
3. **⚡ 1-Click Snapshot All Dirty Repos:**
   - Sekali klik, sistem hanya mengeksekusi snapshot untuk repositori yang berstatus **Dirty** (memiliki *uncommitted changes*). Repo yang bersih (*clean*) dilewati otomatis.
4. **📋 1-Click Copy Diff for AI (Staged & Unstaged Markdown Formatter):**
   - Mengambil seluruh diff (staged dan unstaged), membungkusnya ke dalam format blok Markdown ````diff per file, dan menyalinnya langsung ke **Clipboard**.
   - User bisa langsung `Ctrl + V` ke ChatGPT / Claude / Gemini untuk meminta rekomendasi commit message atau menganalisis perubahan kode.
5. **Granular File-Level Restore:**
   - Rollback tidak harus total; pengguna dapat memilih untuk mengembalikan 1 file saja tanpa merusak file lainnya.

---

## 2. Diagram Topologi Multi-Repo & Symlink di Vault

```
                             [OBSIDIAN MASTER VAULT]
                                        │
           ┌────────────────────────────┼────────────────────────────┐
           ▼                            ▼                            ▼
    📁 Notes/ (Biasa)          🔗 Repo-A (Symlink)          🔗 Repo-B (Junction)
    (Bukan Git Repo)                    │                            │
      [Abaikan]                D:\0pro\project-a            D:\0pro\project-b
                                        │                            │
                               .git/refs/snapshots          .git/refs/snapshots
                                 [🟡 DIRTY - 3 files]         [🟢 CLEAN]
                                        │
                         ┌──────────────┴──────────────┐
                         ▼                             ▼
               [⚡ Quick Snapshot]         [📋 Copy Diff for AI]
                                                       │
                                              (Langsung ke Clipboard)
                                              Ctrl+V ke Claude/ChatGPT
```

---

## 3. UI/UX Wireframe Design

Berikut rancangan antarmuka pengguna (UI/UX) di Obsidian untuk PakCLI:

### Wireframe A: Obsidian Status Bar (Footer Tray)
Terletak di sudut bawah Obsidian, selalu memberikan indikator real-time:

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│ ... Editor Content ...                                                                           │
├──────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 📸 Git Sentinel: 2 Dirty / 4 Repos  |  [⚡ Quick Snapshot All]  |  UTF-8  |  Ln 42, Col 12       │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```
- **Klik pada badge status:** Membuka Dashboard Modal utama.
- **Klik `[⚡ Quick Snapshot All]`:** Langsung mengeksekusi snapshot instan untuk 2 repo dirty tanpa membuka modal.

---

### Wireframe B: Dashboard Modal Utama (Vault Git Sentinel Hub)
Dapat dipanggil via Command Palette (`PakCLI: Open Git Snapshot Hub`) atau Ribbon Icon:

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│  📸 PakCLI - Vault Git Sentinel & Snapshot Hub                                             [✕] │
├─────────────────────────────────────────────────────────────────────────────────────────────────┤
│  Vault: Master-Vault  |  Total Repos: 4  |  🟡 Dirty: 2  |  🟢 Clean: 2                         │
│                                                                                                 │
│  [⚡ 1-Click Snapshot All Dirty Repos]        [🔄 Rescan Vault]         [⚙️ Settings]            │
├─────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                 │
│  ▼ 📦 node-income-pocket-expence  [🔗 Symlink ➔ D:\0pro\node-income-pocket-expence]             │
│    Branch: [ master ]  |  Status: 🟡 DIRTY (5 files modified)                                  │
│    Last Snapshot: 2026-09-29 06:45:10 (25m ago)                                                │
│                                                                                                 │
│    Uncommitted Changes:                                                                         │
│    ├── 🟡 src/server.ts                                                                        │
│    ├── 🟡 src/routes/income.ts                                                                 │
│    └── 🟢 brief/v06_master-workspace.md (untracked)                                            │
│                                                                                                 │
│    Actions:                                                                                     │
│    [📸 Snapshot Now]   [📋 Copy Diff for AI]   [📜 History (3)]   [👁️ View Diff]               │
│    ──────────────────────────────────────────────────────────────────────────────────────────   │
│                                                                                                 │
│  ▼ 📦 pakcli-plugin-local  [🔗 Symlink ➔ D:\0pro\pakcli-plugin\local]                           │
│    Branch: [ feat/stable-features ]  |  Status: 🟡 DIRTY (2 files modified)                     │
│    Last Snapshot: None                                                                          │
│                                                                                                 │
│    Actions:                                                                                     │
│    [📸 Snapshot Now]   [📋 Copy Diff for AI]   [📜 History (0)]   [👁️ View Diff]               │
│    ──────────────────────────────────────────────────────────────────────────────────────────   │
│                                                                                                 │
│  ▶ 📦 website-docs  [📁 Direct Folder ➔ Vault/docs]                                             │
│    Branch: [ main ]  |  Status: 🟢 CLEAN (No uncommitted changes)                                │
│    Actions:  [📜 History (12)]   [🔄 Check Remote]                                             │
│                                                                                                 │
├─────────────────────────────────────────────────────────────────────────────────────────────────┤
│  Tip: Klik [📋 Copy Diff for AI] untuk paste markdown diff ke ChatGPT/Claude & buat commit note.│
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

### Wireframe C: Granular Restore & Diff Modal
Muncul ketika user mengklik `[📜 History]` lalu memilih salah satu snapshot untuk rollback/restore:

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│  ↩️ Inspect Snapshot: 2026-09-29 06:45:10 [node-income-pocket-expence]                     [✕] │
├─────────────────────────────────────────────────────────────────────────────────────────────────┤
│  Tag: "Sebelum ubah kalkulasi tax di routes/income.ts"                                          │
│  Commit Hash: a89f21d  |  Total Changed Files: 3                                                │
├─────────────────────────────────────────────────────────────────────────────────────────────────┤
│  Pilih file yang ingin dikembalikan (Selective Restore):                                        │
│                                                                                                 │
│  [✔] src/routes/income.ts          ➔  [👁️ Compare Diff]   [Status: 12 lines changed]           │
│  [  ] src/server.ts                 ➔  [👁️ Compare Diff]   [Status: 1 line changed]            │
│  [✔] package.json                  ➔  [👁️ Compare Diff]   [Status: dependency reverted]        │
│                                                                                                 │
├─────────────────────────────────────────────────────────────────────────────────────────────────┤
│  [↩️ Restore 2 Selected Files]       [⏪ Full Rollback Everything]               [Cancel]        │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

### Wireframe D: Embedded Obsidian Note View (Tree Codeblock)
Pengguna dapat menempelkan widget monitoring ini di dalam Daily Note atau Dashboard Note menggunakan codeblock Obsidian:

````markdown
```tree
-interactive: true
-startshowlevel: 2
-title: Vault Workspace Git Sentinels
workspaces
	node-income-pocket-expence (symlink)
		branch: master
		status: 🟡 5 uncommitted changes
		last-snapshot: 2026-09-29 06:45 (a89f21d)
		action: [📸 Snapshot] [📋 Copy Diff] [↩️ Restore]
	pakcli-plugin-local (symlink)
		branch: feat/stable-features
		status: 🟡 2 uncommitted changes
		action: [📸 Snapshot] [📋 Copy Diff]
	website-docs (vault)
		branch: main
		status: 🟢 clean
```
````

---

## 4. Mekanisme Tombol `[📋 Copy Diff for AI]`

Fitur ini mengubah diff Git mentah menjadi blok Markdown bersih yang ramah untuk AI:

### A. Format Output di Clipboard
Saat tombol diklik, isi Clipboard langsung terisi format Markdown rapi:

````markdown
# staged src/routes/income.ts
```diff
--- a/src/routes/income.ts
+++ b/src/routes/income.ts
@@ -10,3 +10,4 @@
+  const taxRate = calculateTax(amount);
```

# unstaged src/server.ts
```diff
--- a/src/server.ts
+++ b/src/server.ts
@@ -45,1 +45,1 @@
-  const PORT = 3000;
+  const PORT = process.env.PORT || 8080;
```
````

### B. Skrip Logika Internal (Shell / PowerShell / TypeScript)
Logika eksekusi yang dijalankan di background:

```powershell
# PowerShell Snippet yang dijalankan oleh PakCLI Bridge
function Copy-GitDiffForAI {
    param([string]$RepoPath)
    $output = @()

    # 1. Staged Changes
    $staged = git -C $RepoPath diff --cached --name-status 2>$null
    if ($staged) {
        $staged | ForEach-Object {
            $parts = $_ -split "`t"
            $file = $parts[1]
            $output += "# staged $file`n````diff"
            $output += (git -C $RepoPath diff --cached -- "$file")
            $output += "````"
        }
    }

    # 2. Unstaged Changes
    $unstaged = git -C $RepoPath diff --name-status 2>$null
    if ($unstaged) {
        $unstaged | ForEach-Object {
            $parts = $_ -split "`t"
            $file = $parts[1]
            $output += "`n# unstaged $file`n````diff"
            $output += (git -C $RepoPath diff -- "$file")
            $output += "````"
        }
    }

    $finalText = $output -join "`r`n"
    if ($finalText) {
        Set-Clipboard -Value $finalText
        return "Copied"
    }
    return "Empty"
}
```

---

## 5. Rangkuman Interaksi Pengguna (User Flow)

1. **Auto-Discovery saat Obsidian Buka:**
   - Background worker men-scan top-level folder di vault (kedalaman = 1-2).
   - Mendeteksi Symlink/Junction melalui `detectLink()`.
   - Menghitung jumlah repo yang berstatus Dirty.
2. **Kondisi Normal (Coding / Menulis Catatan):**
   - Status bar menampilkan: `📸 Git Sentinel: 2 Dirty / 4 Repos`.
3. **Workflow Snapshot dengan AI Diff (Kombinasi Sempurna):**
   - Klik `[📋 Copy Diff for AI]` pada repo terkait.
   - Tekan `Alt + Tab` ke ChatGPT / Claude / Gemini ➔ Tekan `Ctrl + V` dengan prompt:  
     *"Buatkan 1 baris judul commit/snapshot yang padat dari diff ini."*
   - Copy hasil saran AI ➔ klik `[📸 Snapshot Now]` ➔ paste ke kolom catatan:  
     `snapshot(master): 2026-09-29 07:15 - Refactor tax calculation & env port`
4. **Jalur Cepat (Tanpa AI):**
   - Cukup klik `[⚡ Quick Snapshot All]` di status bar jika sedang buru-buru, sistem otomatis memberi label timestamp dan jumlah file.
