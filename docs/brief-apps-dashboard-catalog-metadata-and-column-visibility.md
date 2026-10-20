# 📌 Master Brief: Apps Dashboard Catalog Metadata, Column Visibility & Vault-Relative Path

> **Feature Status**: `0` (Specification & Architecture)  
> **Target Module**: `local` (`pakcli-local`)  
> **Date**: 2026-10-20  

---

## 1. Executive Summary & Problem Statement

Pada implementasi Apps Dashboard awal:
1. **Header "Action" Duplikat:** Terdapat dua kolom berdampingan berlabel `Action` (satu berisi tombol `[ Open folder → ]`, satu lagi berisi tombol `[ ⧉ Row ]` bawaan `GenericTable`). Hal ini membingungkan dan merusak estetika tabel.
2. **Path Terikat Hardcoded `~/apps`:** Saat ini scanner mencari di `~/apps`. User menginginkan path aplikasi **relatif terhadap Vault Root** dengan default **`root/apps/`** (atau `apps/`).
3. **Belum Mendukung Metadata Katalog (`index.md` / `_catalog.json`):** Folder aplikasi modern (seperti `d:\0pro\template\catalog-website-style-retro_GITHUB\apps\radiansincostan\`) memiliki file `index.md` dengan frontmatter YAML kaya (`title`, `sector`, `category`, `scope`, `file-size`, `tags`, `overview`, `badge`, `img`) serta file `index_catalog.json` dan `index.html`.
4. **Kolom Kaku (Belum Ada Toggle Visibility):** Semua kolom saat ini tampil paten. User menginginkan **setiap kolom dapat di-toggle visibilitasnya** secara bebas, dengan kolom default sesuai tampilan saat ini.

---

## 2. Spesifikasi Solusi & Arsitektur

### 2.1 Perbaikan Kolom Aksi Tunggal (Single Unified Actions Column)
* Matikan `enableRowTsvCopy: false` di `GenericTable` agar tabel tidak membuat kolom ekstra otomatis.
* Satukan kedua aksi ke dalam satu kolom terpadu bernama **`Actions`**:
  ```text
  [ Open folder → ]   [ ⧉ Row ]
  ```
* Tombol `[ ⧉ Row ]` diletakkan berdampingan dengan `[ Open folder → ]` dalam container fleksibel yang rapi.

---

### 2.2 Resolusi Path Relatif terhadap Vault (`root/apps/`)
Pengaturan `appsRootFolder` di settings mendukung 3 mode resolusi cerdas:

1. **Mode Relatif Vault (Default: `root/apps/`):**
   * Jika path diawali `root/apps/` atau `apps/` (atau path relatif lainnya tanpa `~` atau drive letter):
   * Scanner mencari di dalam vault aktif:
     - Prioritas 1: `<vaultRoot>/root/apps/` (jika folder `root/` ada di vault).
     - Prioritas 2: `<vaultRoot>/apps/` (jika folder `apps/` langsung ada di root vault).
     - Prioritas 3: `<vaultRoot>/<rawPath>`.
2. **Mode Home Directory (`~/...`):**
   * Di-resolve ke `os.homedir()` (misal `C:\Users\<user>\apps`).
3. **Mode Absolute Path (`D:\...` atau `/var/...`):**
   * Langsung membaca path sistem target secara utuh.

---

### 2.3 Skema Metadata Katalog (`AppCatalogMeta`)
Scanner (`AppScanner.ts`) otomatis membaca metadata dari setiap subfolder aplikasi jika ditemukan file `index.md` atau `index_catalog.json`:

```ts
export interface AppCatalogMeta {
  title?: string;        // e.g. "📐 Unit Circle Resolver"
  sector?: string;       // e.g. "edu"
  category?: string;     // e.g. "MATH & CANVAS"
  scope?: string[];      // e.g. ["edu"]
  fileSize?: string;     // e.g. "6.8 KB"
  tags?: string[];       // e.g. ["SVG Arc", "Math Engine", "Zero-Backend"]
  overview?: string;     // e.g. "Interactive trigonometric unit circle calculator..."
  badge?: string;        // e.g. "v2.4"
  img?: string;          // e.g. "[[img-lightmode.webp]], [[img-darkmode.webp]]"
  thumbnail?: string;    // e.g. "apps/radiansincostan/img.webp"
  imgLight?: string;     // e.g. "apps/radiansincostan/img-lightmode.webp"
  imgDark?: string;      // e.g. "apps/radiansincostan/img-darkmode.webp"
  linkLive?: string;     // e.g. "apps/radiansincostan/index.html"
  linkPlayground?: string; // e.g. "apps/radiansincostan/index_playground.html"
  linkGithub?: string;   // e.g. "https://github.com/..."
}
```

#### Aturan Parser `AppScanner.ts`:
1. Jika ada `index.md`, ekstrak blok YAML frontmatter antara `---` dan `---` menggunakan regex YAML parser ringan tanpa dependensi eksternal.
2. Jika ada `index_catalog.json` atau `_catalog.json`, baca data JSON sebagai fallback/pelengkap.
3. Simpan hasil parsing ke `app.catalog`.

---

### 2.4 Sistem Toggle Visibilitas Kolom (`[ 👁 Columns ▾ ]`)

Di baris toolbar (sebelah kanan search bar), tambahkan tombol dropdown **`[ 👁 Columns ▾ ]`**:

```text
┌────────────────────────────────────────────────────────────────────────┐
│ [ Search folder, repo, or hosting site... __________________ ]         │
│ [ 👁 Columns ▾ ]   [ ⟳ Rescan ]   [ ⚙ Settings ]                       │
└────────────────────────────────────────────────────────────────────────┘
        │ klik [ 👁 Columns ▾ ]
        ▼
┌──────────────────────────────────────────────┐
│  Visible Columns:                            │
│  [✓] Folder                                  │
│  [✓] Path                                    │
│  [✓] GitHub Repo                             │
│  [✓] Static Host                             │
│  [✓] Actions                                 │
│  ──────────────────────────────────────────  │
│  Catalog Metadata Columns:                   │
│  [ ] Title (📐 Unit Circle...)               │
│  [ ] Category (MATH & CANVAS)                │
│  [ ] Sector (edu)                            │
│  [ ] Badge (v2.4)                            │
│  [ ] File Size (6.8 KB)                      │
│  [ ] Tags (SVG Arc, Math Engine)             │
│  [ ] Overview (Description)                  │
│  [ ] Preview Thumbnail (img.webp)            │
│  [ ] Live Link (index.html)                  │
│  ──────────────────────────────────────────  │
│  [ Reset to Default ]                        │
└──────────────────────────────────────────────┘
```

#### Aturan Visibilitas:
* **Default Active Columns:** `["folderName", "path", "githubRepo", "staticHost", "actions"]` (Persis seperti tampilan saat ini).
* **Kolom Tambahan Opsional:** User bisa mengaktifkan kolom metadata apa pun hanya dengan 1 klik checkbox.
* **Tersimpan Otomatis (Persistent):** Pilihan kolom disimpan di `settings.visibleColumns: string[]` sehingga tidak hilang saat tab ditutup.

---

### 2.5 Modal Settings Terpadu (`AppsDashboardSettingsModal`)
Saat user mengklik **`[ ⚙ Settings ]`**, buka modal konfigurasi lengkap:
1. **Apps Root Folder:** Input teks path dengan keterangan: *"Path relatif terhadap vault (default: root/apps/) atau path absolut"*.
2. **Scan Depth:** Pilihan kedalaman scan direktori (1, 2, atau 3 tingkat).
3. **Server Port:** Port loopback bridge lokal (default: `4747`).
4. **Demo Mock Mode:** Toggle switch `[x] Enable Demo Mock Data` untuk pengujian instan 5 project dummy.

---

## 3. Rencana Implementasi & Roadmap File

| File Target | Tanggung Jawab Perubahan |
| :--- | :--- |
| `local/src/features/appsDashboard/types.ts` | Tambahkan interface `AppCatalogMeta`, field `catalog?` di `AppScanRecord`, dan `visibleColumns` di settings. |
| `local/src/features/appsDashboard/services/AppScanner.ts` | Tambahkan parsing YAML frontmatter `index.md`, parsing `index_catalog.json`, dan resolusi path relatif terhadap `vaultRoot`. |
| `local/src/features/appsDashboard/services/MockData.ts` | Lengkapi mock data dengan contoh data katalog (`title`, `badge`, `category`, `tags`). |
| `local/src/features/appsDashboard/store/AppDashboardStore.ts` | Simpan referensi `vaultRoot`, dukung setting `visibleColumns`, dan reaktif update. |
| `local/src/features/appsDashboard/ui/AppsDashboardView.ts` | 1) Hapus duplikasi kolom Action (satukan tombol Open folder & Row copy).<br/>2) Tambahkan tombol dropdown `[ 👁 Columns ▾ ]`.<br/>3) Sediakan renderer untuk seluruh kolom katalog baru. |
| `local/src/features/appsDashboard/ui/modals/AppsDashboardSettingsModal.ts` | Modal settings terstruktur untuk konfigurasi folder root/apps/, scan depth, dan demo mode. |
| `local/src/styles/appsDashboard.scss` | Styling badge kategori, tags pill, thumbnail preview cell, dan dropdown menu kolom. |

---

## 4. Checklist Kriteria Penerimaan (Acceptance Criteria)

- [ ] Status 0 brief dibuat dan terdokumentasi lengkap
- [ ] Kolom `Action` ganda diperbaiki menjadi 1 kolom terpadu `Actions` yang rapi
- [ ] Pengaturan `appsRootFolder` mendukung default `root/apps/` yang di-resolve relatif terhadap root vault
- [ ] Scanner otomatis mengekstrak metadata dari `index.md` (frontmatter YAML) dan `index_catalog.json`
- [ ] Tombol toolbar `[ 👁 Columns ▾ ]` memungkinkan toggle visibilitas setiap kolom
- [ ] Kolom default tetap sesuai tampilan saat ini (Folder, Path, GitHub Repo, Static Host, Actions)
- [ ] Kolom katalog (Title, Category, Sector, Badge, File Size, Tags, Overview, Thumbnail, Live Link) bisa diaktifkan
- [ ] Modal `[ ⚙ Settings ]` memungkinkan edit folder path `root/apps/` dan toggle Demo Mode
- [ ] `npm run build` lulus compile dengan 0 error
- [ ] Commit Status 1 setelah verifikasi tuntas
