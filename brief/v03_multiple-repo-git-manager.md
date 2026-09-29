# Brief v03: Multiple-Repo Git Manager & Local Snapshot Hub

> **Status:** Comprehensive Specification & Wireframe  
> **Scope:** `pakcli-plugin/local` (Obsidian Power Utilities)  
> **Target:** Solusi manajemen Git lokal terintegrasi untuk Obsidian Vault yang menampung banyak repositori sekaligus (Direct Folder & Windows Symlink/Junction), dilengkapi 3 mode tampilan (Upload/Changes, Stashing/Snapshot 3-Column, dan History Management).

---

## 1. Konvensi Format Naming Wajib

Format standar untuk setiap snapshot, stash note, atau auto-commit terstruktur:

```
yyyy-mm-dd_hh-mm_custom message apa saja
```

### Aturan Format:
1. **Timestamp:** `yyyy-mm-dd_hh-mm` (menggunakan tanda minus `-` agar aman di filesystem dan URL).
2. **Pemisah:** Karakter underscore `_`.
3. **Pesan Catatan:** Bebas (custom message / catatan ringkas).
4. **Contoh Riil:**
   - `2026-09-29_07-30_sebelum refactor income router`
   - `2026-09-29_07-45_fix edge slider 1080p ytd`
   - `2026-09-29_08-00_auto checkpoint 3 files` *(jika tanpa input manual)*

---

## 2. Arsitektur Multi-Repo di dalam Obsidian Vault

Satu Obsidian Vault dapat menjadi **Mission Control** untuk banyak repositori di disk melalui deteksi Symlink bawaan PakCLI (`detectLink()`):

```
┌───────────────────────────────────────────────────────────────────────────────┐
│                        OBSIDIAN VAULT (MULTI-REPO HUB)                        │
└───────────────────────────────────────────────────────────────────────────────┘
          │                                 │                             │
          ▼                                 ▼                             ▼
  [Repo Selector]                   [Repo Selector]               [Repo Selector]
  📦 node-income-pocket-expence     📦 pakcli-plugin-local        📦 docs-vault
  🔗 Symlink: D:\0pro\node-...      🔗 Junction: D:\0pro\pak...   📁 Direct Folder
  Branch: [ master ]                Branch: [ feat/ui ]           Branch: [ main ]
  Status: 🟡 Dirty (3 files)        Status: 🟡 Dirty (2 files)    Status: 🟢 Clean
```

---

## 3. UI/UX Wireframe: 3 Mode Tampilan Utama

Antarmuka Git Manager dibagi menjadi **3 View Mode** yang dapat diganti via tab bar di bagian atas:

```
[ 📂 Mode 1: Changes & Commit ]   [ 📦 Mode 2: Stash & Snapshot ]   [ 📜 Mode 3: History & Branching ]
```

---

### MODE 1: Changes & Upload View (Commit & Stage Split Top-Down)

Mode kerja harian untuk me-review perubahan aktif dan melakukan commit/snapshot.

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│ 📸 PakCLI Git Manager - [ Repo: node-income-pocket-expence (master) ▼ ]                    [✕] │
├─────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Tab: [📂 Working Changes]   [📦 Stash / Snapshot]   [📜 History Only]   | 🟡 3 Uncommitted Files│
├────────────────────────────────┬────────────────────────────────────────────────────────────────┤
│ 📜 Recent Commits (Left Col)   │ 📋 Working Tree Changes (Split Top-Down)                       │
├────────────────────────────────┼────────────────────────────────────────────────────────────────┤
│ • 2026-09-29_06-45_init v06    │ 🔼 STAGED CHANGES (Siap di-commit)                 [Unstage All]│
│ • 2026-09-28_22-10_merge feat  │ ├── [✔] M  src/routes/income.ts                  [ - Unstage ] │
│ • 2026-09-28_18-00_fix typings │ └── [✔] M  package.json                          [ - Unstage ] │
│ • 2026-09-28_14-20_setup db    │                                                                │
│                                ├────────────────────────────────────────────────────────────────┤
│                                │ 🔽 UNSTAGED CHANGES (Belum di-stage)                 [Stage All]│
│                                │ ├── [ ] M  src/server.ts                         [ + Stage ]   │
│                                │ └── [ ] ?  brief/v06_master.md (untracked)       [ + Stage ]   │
│                                ├────────────────────────────────────────────────────────────────┤
│                                │ 💬 Commit / Snapshot Message:                                  │
│                                │ [ 2026-09-29_07-30_sebelum refactor income router            ] │
│                                │                                                                │
│                                │ Actions:                                                       │
│                                │ [💾 Commit to Branch]   [📸 Save as Local Snapshot]            │
│                                │ [📋 Copy Diff for AI]   [⚡ Discard Changes]                    │
└────────────────────────────────┴────────────────────────────────────────────────────────────────┘
```

#### Komponen Kunci Mode 1:
1. **Left Column (Recent Commits):** Menampilkan 5–10 commit terakhir untuk konteks cepat.
2. **Right Column (Top-Down Split):**
   - **Bagian Atas (Staged):** File yang sudah di-stage (`git add`). Ada tombol unstage individual atau massal.
   - **Bagian Bawah (Unstaged):** File modified/untracked. Ada tombol stage individual atau massal.
3. **Tombol `[📋 Copy Diff for AI]`:** Memformat seluruh diff staged & unstaged ke clipboard dalam format markdown ````diff agar bisa langsung di-paste ke AI untuk rekomendasi commit message.

---

### MODE 2: Stashing & Snapshot View (3-Column Layout)

Mode inspeksi snapshot lokal dan stash. Semua tersusun dalam **3 Kolom Horizontal**:

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│ 📸 PakCLI Git Manager - [ Repo: node-income-pocket-expence (master) ▼ ]                    [✕] │
├─────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Tab: [📂 Working Changes]   [📦 Stash / Snapshot (Active)]   [📜 History Only]                  │
├───────────────────────────────┬───────────────────────────────┬─────────────────────────────────┤
│ 1. HISTORY STASH / SNAPSHOT   │ 2. THE CHANGES (Files in Snap)│ 3. DIFF VIEWER (File Preview)   │
├───────────────────────────────┼───────────────────────────────┼─────────────────────────────────┤
│ ▼ Local Snapshots             │ Selected:                     │ Diff: src/routes/income.ts      │
│ 🔘 2026-09-29_07-30_router-ref│ 2026-09-29_07-30_router-ref   │ ─────────────────────────────── │
│    [2 files | 10m ago]        │                               │ @@ -14,4 +14,6 @@               │
│ ○ 2026-09-29_06-45_fix-calc   │ Modified Files:               │  const baseIncome = 1000;       │
│    [3 files | 55m ago]        │ 📄 src/routes/income.ts (sel) │ -const tax = base * 0.1;        │
│ ○ 2026-09-28_23-15_pre-backup │ 📄 package.json               │ +const taxRate = getTaxRate();  │
│    [1 file | 8h ago]          │                               │ +const tax = base * taxRate;    │
│                               │                               │                                 │
│ ▼ Git Stash Stack             │                               │                                 │
│ ○ stash@{0}: WIP on master    │                               │                                 │
│                               │                               │                                 │
├───────────────────────────────┼───────────────────────────────┼─────────────────────────────────┤
│ Actions for Selected Snap:    │ Actions for Selected File:    │ View Options:                   │
│ [📸 New Snapshot]             │ [↩️ Restore This File Only]   │ [ Split Diff | Unified Diff ]   │
│ [⏪ Rollback All Files]       │ [📋 Copy File Diff for AI]    │ [📋 Copy Raw Patch]             │
│ [🗑️ Delete Snapshot]          │                               │                                 │
└───────────────────────────────┴───────────────────────────────┴─────────────────────────────────┘
```

#### Komponen Kunci Mode 2:
1. **Kolom 1 (Kiri - Stash & Snapshot History):** Daftar snapshot `refs/snapshots/*` dan `git stash`. Urut dari yang terbaru.
2. **Kolom 2 (Tengah - File Changes List):** Menampilkan daftar file apa saja yang tersimpan di dalam snapshot yang sedang diklik.
3. **Kolom 3 (Kanan - Diffs Viewer):** Menampilkan visualisasi diff syntax-highlighted untuk file yang dipilih di kolom 2.
4. **Granular File Restore:** Tombol `[↩️ Restore This File Only]` memungkinkan rollback hanya file yang rusak tanpa membatalkan file lainnya.

---

### MODE 3: History Only View (Table / Data Grid dengan Text Selection)

Mode audit dan operasi Git tingkat lanjut. **Semua teks di tabel ini bebas di-select, di-drag, dan di-copy (right-click / Ctrl+C)**.

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│ 📸 PakCLI Git Manager - [ Repo: pakcli-plugin-local (feat/ui) ▼ ]                          [✕] │
├─────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Tab: [📂 Working Changes]   [📦 Stash / Snapshot]   [📜 History Only (Active)]                  │
│                                                                                                 │
│ 🔍 [ Search commit message, author, or SHA...                                    ]  [🔄 Refresh]│
├───────────────────┬─────────┬──────────────────────────────────────────┬────────────────────────┤
│ DATE / TIME       │ COMMIT  │ COMMIT MESSAGE (Selectable Text)         │ ACTIONS                │
├───────────────────┼─────────┼──────────────────────────────────────────┼────────────────────────┤
│ 2026-09-29 07:15  │ dac732c │ feat: FIXED SyncCodeblockRenderer UI     │ [⚙️ Branch Actions ▼]  │
│ 2026-09-29 06:30  │ 71430f2 │ fix(ytd): fix 1080p resolution clamping  │ [⚙️ Branch Actions ▼]  │
│ 2026-09-29 05:40  │ b24864f │ fix(ytd): remove format 18 fallback      │ [⚙️ Branch Actions ▼]  │
│ 2026-09-29 04:12  │ 83de881 │ fix(ytd): force range input 100% width   │ [⚙️ Branch Actions ▼]  │
│ 2026-09-28 22:50  │ 30d7054 │ fix(ytd): pin slider handles to edges    │ [⚙️ Branch Actions ▼]  │
│ 2026-09-28 19:10  │ e9bf90f │ fix(ytd): use actual fetched duration    │ [⚙️ Branch Actions ▼]  │
├───────────────────┴─────────┴──────────────────────────────────────────┴────────────────────────┤
│ Menu [⚙️ Branch Actions ▼] pada setiap baris commit:                                             │
│                                                                                                 │
│ ├── 1. 🔀 Checkout (Pindah HEAD ke commit ini)                                                  │
│ ├── 2. 🌿 Add New Branch (Buat branch baru bercabang dari commit ini)                           │
│ ├── 3. 🧬 Merge to Active Branch (Gabungkan commit ini ke branch yang sedang aktif)            │
│ ├── 4. ⚠️ Overwrite Active Branch (Hard reset branch aktif agar sama persis dengan commit ini)  │
│ └── ⏪ Undo to this (Rollback ke titik ini & hapus commit setelahnya)                           │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### Penjelasan Tindakan Aksi di Mode 3:
1. **Checkout:** `git checkout <commit-id>` (menginspeksi kode pada titik waktu tersebut).
2. **Add New Branch:** `git branch <new-branch-name> <commit-id>` (membuat cabang eksperimen baru dari titik aman).
3. **Merge to Active Branch:** `git merge <commit-id>` (menggabungkan perubahan dari commit/branch tersebut ke branch kerja Anda).
4. **⚠️ Overwrite Active Branch:** `git reset --hard <commit-id>` (menimpa branch aktif saat ini menjadi identik dengan commit ini — *dilengkapi dialog konfirmasi keamanan*).
5. **⏪ Undo to this (Safe Rollback):**
   - Mengembalikan working tree ke commit ini.
   - Pilihan: Soft rollback (menyisakan perubahan di unstaged) atau Hard undo (menghapus commit-commit sampah di depannya).

---

## 4. Rekomendasi Fitur Tambahan (Valuable Suggestions)

Agar sistem ini menjadi Git Manager paling canggih di Obsidian, berikut 5 saran fitur tambahan:

### 1. Conflict & Merge State Sentinel (Peringatan Dini Bentrok)
Jika repo sedang berada di tengah-tengah `MERGING`, `REBASING`, atau ada konflik file, UI otomatis menampilkan banner merah:
> `⚠️ CONFLICT DETECTED in 2 files (src/routes/income.ts). [Resolve in Obsidian] [Abort Merge]`

### 2. Guard Modal untuk Aksi Destruktif (Overwrite / Hard Undo)
Aksi seperti `Overwrite` atau `Undo to this` berpotensi menghilangkan kode uncommitted. Sistem wajib memunculkan modal:
> *"Apakah Anda yakin ingin Overwrite? Sistem akan otomatis membuat 1 Snapshot Pengaman sebelum melakukan reset."*  
*(Safety net otomatis!)*

### 3. Context Menu Klik Kanan pada Baris History
Selain tombol action dropdown, klik kanan pada baris teks mana saja memberikan shortcut:
- `Copy Commit Hash (Short / Full)`
- `Copy Commit Message`
- `Copy Git Checkout Command`

### 4. Batch 1-Click Snapshot All Dirty Repos (Global Toolbar)
Di header atas jendela, selalu ada tombol:
> `[⚡ Snapshot All Dirty Repos (2)]`  
Menjalankan snapshot otomatis untuk semua repo yang terdeteksi Dirty di dalam Vault tanpa perlu berpindah tab satu per satu.

### 5. Ekspor Log ke Obsidian Note (`.md`)
Tombol untuk mengekspor history snapshot atau git log repo ke dalam note Obsidian dengan format codeblock ````tree` interaktif.

---

## 5. Entry Points & Ribbon Shortcut (Akses Cepat Pengguna)

Sesuai pola arsitektur PakCLI di [`src/main.ts`](file:///d:/0pro/pakcli-plugin/local/src/main.ts), Git Manager memiliki 3 pintu masuk akses cepat:

```
┌─────────────────────────┐
│ Obsidian Left Ribbon    │
├─────────────────────────┤
│ [📁 Files]              │
│ [🔍 Search]             │
│ [🎬 YT Downloader]      │
│ [⚡ ScriptSync]          │
│ [📋 CopyPaste]          │
│ [🌿 Git Manager] ◄──────┼───► Klik: Langsung buka Git Manager Popup / Modal!
└─────────────────────────┘
```

### 1. Ribbon Icon Shortcut (Sidebar Kiri Obsidian)
- **Icon:** `git-pull-request` atau `git-branch`
- **Tooltip:** `PakCLI: Multi-Repo Git Sentinel & Snapshot Manager`
- **Kode Registrasi di `main.ts`:**
  ```typescript
  this.addRibbonIcon('git-pull-request', 'PakCLI: Multi-Repo Git Sentinel & Snapshot Manager', () => {
      new GitManagerModal(this.app, this).open();
  });
  ```

### 2. Status Bar Item (Tray Kanan Bawah)
- Menampilkan status counter real-time: `📸 Git: 2 Dirty / 4 Repos`
- Mengklik badge membuka popup manager, atau klik tombol `[⚡]` langsung mengeksekusi quick snapshot semua repo dirty.

### 3. Command Palette (`Ctrl + P`)
- `PakCLI: Open Multi-Repo Git Manager`
- `PakCLI: Quick Snapshot All Dirty Repos`
- `PakCLI: Copy Git Diff for AI (Active Repo)`

---

## 6. Settings: Dependency Health Check (Internet, Git, Bash)

Mengikuti pola arsitektur **Setup & Dependencies** di modul YTD ([`src/features/ytd/settings.ts`](file:///d:/0pro/pakcli-plugin/local/src/features/ytd/settings.ts)), tab Settings PakCLI dilengkapi panel diagnosa otomatis dengan bahasa yang **informatif, formal, namun tetap santai & bersahabat**:

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│ ⚙️ PakCLI Settings ➔ Git Sentinel & Snapshot Manager                                           │
├─────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Setup & Environment Diagnostics:                                                                │
│ Pastikan environment sistem Anda siap untuk menjalankan otomasi Git lokal dan snapshotting.     │
│                                                                                                 │
│ ┌─────────────────────────────────────────────────────────────────────────────────────────────┐ │
│ │ 🌐 Internet Connection                                                                      │ │
│ │    ✅ Online & Siap Sinkronisasi                                                           │ │
│ │    Koneksi internet stabil. Aman untuk sync branch remote dan pemeriksaan status GitHub.   │ │
│ │    [Jika Offline: "🌐 Mode Offline Aktif. Santai saja lad, Local Snapshot tetap berfungsi   │ │
│ │     100% normal karena seluruh checkpoint disimpan di disk lokal Anda!"]                    │ │
│ │                                                                                             │ │
│ │ 📦 Git Core Engine (git --version)                                                          │ │
│ │    ✅ Git Ready: git version 2.46.0.windows.1 (C:\Program Files\Git\cmd\git.exe)           │ │
│ │    Mesin Git utama terdeteksi dan siap mengeksekusi operasi snapshot & porcelain status.    │ │
│ │    [Jika Missing: "❌ Git Belum Terdeteksi di PATH! Silakan install Git for Windows agar    │ │
│ │     fitur ini bisa membaca repositori Anda."]                                               │ │
│ │                                                                                             │ │
│ │ 🐚 Bash Shell Environment (bash --version)                                                  │ │
│ │    ✅ Bash Ready: GNU bash, version 5.2.26(1)-release (Git Bash terpasang)                 │ │
│ │    Shell Bash tersedia untuk menjalankan pipeline formatting diff dan export log.          │ │
│ │    [Jika Missing: "💡 Bash Tidak Ditemukan. Tenang saja, PakCLI otomatis memakai native     │ │
│ │     PowerShell bridge sebagai mesin fallback tanpa ada fitur yang berkurang!"]             │ │
│ └─────────────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                                 │
│ Actions:  [🔄 Re-check Dependencies]   [📖 Open Git Setup Guide]                                │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Logika Pemeriksaan Dependensi (TypeScript Service):
```typescript
export interface GitManagerHealthStatus {
    internet: boolean;
    gitInstalled: boolean;
    gitVersion: string;
    bashInstalled: boolean;
    bashVersion: string;
    notes: string[];
}

export async function checkGitManagerDeps(): Promise<GitManagerHealthStatus> {
    // 1. Cek Internet via Obsidian requestUrl (bypasses browser CORS)
    let internet = false;
    try {
        const res = await requestUrl({ url: "https://www.google.com/generate_204", method: "GET" });
        internet = res.status >= 200 && res.status < 400;
    } catch {
        internet = false;
    }

    // 2. Cek Git Binary
    let gitInstalled = false;
    let gitVersion = "";
    try {
        gitVersion = (await runCommand("git", ["--version"])).trim();
        gitInstalled = true;
    } catch {
        gitInstalled = false;
    }

    // 3. Cek Bash Binary (Git Bash / WSL)
    let bashInstalled = false;
    let bashVersion = "";
    try {
        bashVersion = (await runCommand("bash", ["--version"])).split("\n")[0].trim();
        bashInstalled = true;
    } catch {
        bashInstalled = false;
    }

    return { internet, gitInstalled, gitVersion, bashInstalled, bashVersion, notes: [] };
}
```

---

## 7. Ringkasan File & Roadmap Implementasi

| Dokumen | Isi & Fokus |
| :--- | :--- |
| [v01_without-git-snapshot.md](file:///d:/0pro/pakcli-plugin/local/brief/v01_without-git-snapshot.md) | Analisis masalah, commit clutter, keterbatasan alur Git linear standar. |
| [v02_with-git-snapshot.md](file:///d:/0pro/pakcli-plugin/local/brief/v02_with-git-snapshot.md) | Konsep plumbing Git `refs/snapshots/*`, anti-bocor ke remote, dan isolasi lokal. |
| [v03_multiple-repo-git-manager.md](file:///d:/0pro/pakcli-plugin/local/brief/v03_multiple-repo-git-manager.md) | **Spesifikasi lengkap Multi-Repo Git Manager**: Ribbon icon shortcut, format `yyyy-mm-dd_hh-mm_notes`, 3 View Mode (Upload/Changes, Stashing 3-Column, History Action Grid), AI Diff Exporter, dan Dependency Health Check (Internet, Git, Bash). |


