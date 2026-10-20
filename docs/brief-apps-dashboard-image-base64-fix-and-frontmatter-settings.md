# 📌 Master Brief: Apps Dashboard Image Preview Fix (Dual Resource/Base64) & Frontmatter Field Mapping Settings

> **Feature Status**: `0` (Specification & Architecture)  
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
1. **Prioritas 1: Obsidian Native Vault Resource**:
   - Jika berkas berada di dalam vault, gunakan `app.vault.adapter.getResourcePath(relativePath)` yang menghasilkan URL resmi Obsidian (`app://obsidian.md/...`).
2. **Prioritas 2: Node.js Buffer to Base64 Data URI**:
   - Jika berkas di luar vault atau protokol native gagal, baca langsung file via `fs.readFileSync(fullPath)` dan konversikan ke `data:image/webp;base64,...`.
   - Data URI berjalan 100% di semua webview tanpa batasan CORS atau skema URL.
3. **Pembersihan Handler Error**:
   - Cek `if (!card.querySelector(".pakcli-thumb-placeholder"))` sebelum menyisipkan placeholder agar tidak terjadi duplikasi horizontal.
4. **Dimensi Card Tetap**:
   - `width: 256px; height: 256px; min-width: 256px; max-width: 256px;` untuk menjamin bentuk kotak sempurna.

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
   - Menggunakan konfigurasi `FrontmatterFieldMapping` saat mem-parsing blok YAML frontmatter `index.md`.
3. **UI Pengaturan di `AppsDashboardSettingsModal.ts`**:
   - Bagian **Frontmatter Field Mapping**:
     - Setiap field memiliki input teks dengan nilai default.
     - Tombol **`[ ↺ Reset Mapping to Defaults ]`**.
   - Bagian **Visible Columns**:
     - Checkbox untuk setiap kolom agar pengguna dapat mengatur kolom bawaan yang muncul di dashboard.

---

## 3. Checklist Kriteria Penerimaan (Acceptance Criteria)

- [ ] **AC-1**: Gambar thumbnail `radiansincostan` tampil dengan benar (resolusi via resourcePath / base64 data URI).
- [ ] **AC-2**: Placeholder gambar tidak berulang/terduplikasi jika gambar tidak ditemukan.
- [ ] **AC-3**: Container thumbnail berukuran tepat 256x256 px dan hover overlay berfungsi normal.
- [ ] **AC-4**: Halaman pengaturan menyediakan form konfigurasi Frontmatter Field Mapping yang lengkap.
- [ ] **AC-5**: Mengubah nama kunci frontmatter di pengaturan tercermin saat pemindaian ulang scanner.
- [ ] **AC-6**: Kompilasi plugin `npm --prefix local run build` berhasil dengan 0 error TypeScript.
