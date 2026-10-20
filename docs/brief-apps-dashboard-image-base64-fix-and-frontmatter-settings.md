# 📌 Master Brief: Apps Dashboard Image Preview Fix (Dual Resource/Base64) & Frontmatter Field Mapping Settings

> **Feature Status**: `1` (Verified & Completed)  
> **Target Module**: `local` (`pakcli-local`)  
> **Platform**: Windows Desktop (Obsidian Desktop Plugin)  
> **Date**: 2026-10-20  

---

## 1. Executive Summary & Problem Statement

Berdasarkan pengujian terbaru dan tangkapan layar `media_1792487551450_e6a89822.png`:
1. **Preview Image Gagal Memuat ("No preview image" Berulang)**:
   - `resolveImgUri` menggunakan skema kustom `app://local/...` yang tidak didaftarkan oleh Chromium di Obsidian, menyebabkan `ERR_UNKNOWN_URL_SCHEME` dan memicu `imgEl.onerror`.
   - `imgEl.onerror` berulang kali membuat elemen placeholder sehingga placeholder `🖼 No preview image` terduplikasi berjajar secara horizontal.
2. **Kebutuhan Pengaturan Frontmatter Mapping di Halaman Settings**:
   - Pengguna membutuhkan antarmuka di modal pengaturan (`AppsDashboardSettingsModal`) untuk menyesuaikan dan menetapkan (*assign*) nama kunci YAML frontmatter dari berkas `index.md` ke kolom dashboard:
     - Kunci Judul (default: `title`)
     - Kunci Kategori (default: `category`)
     - Kunci Tags (default: `tags`)
     - Kunci Badge (default: `badge`)
     - Kunci Gambar / Thumbnail (default: `img`)
     - Kunci Gambar Terang (default: `imgLight`)
     - Kunci Gambar Gelap (default: `imgDark`)
     - Kunci Domain GitHub Pages (default: `git-page`)
     - Kunci Remote GitHub (default: `github`)
   - Pengguna juga dapat mengatur kolom default yang aktif langsung dari halaman pengaturan.

---

## 2. Arsitektur & Spesifikasi Solusi

### 2.1 Perbaikan Pemuatan Gambar (Dual Resource / Base64 Data URI)
Untuk menjamin gambar selalu termuat 100% tanpa kendala skema protokol:
1. **Prioritas 1: Node.js Buffer to Base64 Data URI**:
   - Langsung membaca buffer gambar via `fs.readFileSync(fullPath)` dan men-generate `data:image/webp;base64,...` (atau png/svg/jpg).
   - Data URI berjalan 100% di Chromium/Electron tanpa batasan CORS atau skema URL eksternal.
2. **Prioritas 2: Obsidian Vault Resource Adapter**:
   - Fallback menggunakan `app.vault.adapter.getResourcePath(relativePath)` jika berkas dalam vault.
3. **Pembersihan Handler Error & Lifecycle**:
   - `showPlaceholder()` dan `hidePlaceholder()` menjaga elemen placeholder tidak terduplikasi.
   - `imgEl.onload` otomatis menghapus placeholder ketika gambar berhasil didekode.
4. **Dimensi Card Tetap**:
   - `width: 256px; height: 256px; min-width: 256px; max-width: 256px; min-height: 256px; max-height: 256px;` untuk menjamin bentuk kotak 256x256 px.

---

### 2.2 Pengaturan Frontmatter Mapping (`FrontmatterFieldMapping`)

1. **Struktur Tipe Data Baru (`types.ts`)**:
   ```ts
   export interface FrontmatterFieldMapping {
     titleKey: string;       // default: "title"
     categoryKey: string;    // default: "category"
     tagsKey: string;        // default: "tags"
     badgeKey: string;       // default: "badge"
     imgKey: string;         // default: "img"
     imgLightKey: string;    // default: "imgLight"
     imgDarkKey: string;     // default: "imgDark"
     gitPageKey: string;     // default: "git-page"
     githubKey: string;      // default: "github"
   }
   ```
2. **Integrasi Scanner (`AppScanner.ts`)**:
   - Menggunakan konfigurasi dinamis `FrontmatterFieldMapping` saat mem-parsing blok YAML frontmatter `index.md`.
   - Parsing tag mendukung multiline list (`- tag`), inline array (`[tag1, tag2]`), dan baris teks koma.
3. **UI Pengaturan di `AppsDashboardSettingsModal.ts`**:
   - Bagian **Frontmatter Field Mapping**:
     - 9 input text untuk setiap mapping field dengan placeholder dan fallback default.
     - Tombol **`[ ↺ Reset Mapping ]`**.
   - Bagian **Column Visibility**:
     - Grid checkbox untuk semua kolom (Core & Catalog) dengan tombol **`[ ↺ Reset Columns ]`**.

---

## 3. Checklist Kriteria Penerimaan (Acceptance Criteria)

- [x] **AC-1**: Gambar thumbnail `radiansincostan` tampil dengan benar (resolusi via Base64 data URI).
- [x] **AC-2**: Placeholder gambar tidak berulang/terduplikasi jika gambar tidak ditemukan.
- [x] **AC-3**: Container thumbnail berukuran tepat 256x256 px dan hover overlay berfungsi normal.
- [x] **AC-4**: Halaman pengaturan menyediakan form konfigurasi Frontmatter Field Mapping yang lengkap.
- [x] **AC-5**: Mengubah nama kunci frontmatter di pengaturan tercermin saat pemindaian ulang scanner.
- [x] **AC-6**: Kompilasi plugin `npm --prefix local run build` berhasil dengan 0 error TypeScript.
