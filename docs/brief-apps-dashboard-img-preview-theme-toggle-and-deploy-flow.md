# 📌 Master Brief: Apps Dashboard Image Preview (256px), Theme Switcher, Git Init & Deployment Flow

> **Feature Status**: `0` (Specification & Architecture)  
> **Target Module**: `local` (`pakcli-local`)  
> **Platform**: Windows Desktop (Obsidian Desktop Plugin)  
> **Date**: 2026-10-20  

---

## 1. Executive Summary & Problem Statement

Berdasarkan hasil pengujian antarmuka dan *feedback* pengguna pada tangkapan layar `media_1792485974554_22b93804.png`:
1. **Duplikasi Ikon Menu Hosting**: Menu dropdown `+ Host ▾` menampilkan ikon ganda (misal: ikon Obsidian flame + emoji `🔥 Firebase Hosting`, dan ikon github + emoji `🐙 GitHub Pages`). Ini terlihat redundant dan harus dibersihkan.
2. **Kebutuhan Pre-requisite GitHub Pages**: Untuk melakukan deployment atau inisialisasi **GitHub Pages**, aplikasi **wajib** memiliki remote Git terhubung terlebih dahulu (`app.git.remoteUrl`). Sedangkan untuk **Firebase Hosting**, remote Git tidak diwajibkan (bisa langsung deploy dari direktori publik lokal).
3. **Saran Nama Remote Otomatis (Title Slug) & Validasi**: Saat inisialisasi / link remote GitHub, sistem harus memberikan *default suggestion* nama repositori berdasarkan **`title`** aplikasi yang telah di-slugify, dilengkapi tombol **`[ Check ]`** untuk validasi serta *textbox* yang dapat dikustomisasi secara bebas.
4. **GitHub Pages Domain Prefix**: Menghasilkan dan menampilkan URL Pages berbasis prefix domain (contoh: `<prefix>.github.io/<repo>`).
5. **Aksi Pembukaan Ganda**: Tombol aksi pada aplikasi harus mendukung:
   - **Open in Obsidian**: Membuka berkas HTML aplikasi langsung di dalam tab/leaf Obsidian.
   - **Open in Default Browser**: Membuka URL/berkas aplikasi di browser eksternal sistem operasi.
6. **Kolom Image Preview 256px Aktif Secara Default**: Kolom `thumbnail` dimasukkan ke dalam `DEFAULT_VISIBLE_COLUMNS` dengan tinggi standar gambar **`256px`** (`object-fit: contain`).
7. **Deteksi Tema Cerdas & Hover Controls**:
   - Gambar awal otomatis menyesuaikan tema aktif Obsidian (Light / Dark mode).
   - Pada saat kursor *hover* di atas kartu gambar:
     - Area **Center Top**: Dapat diklik untuk langsung membuka HTML aplikasi di Obsidian.
     - Area **Bawah**: Menampilkan toggle tombol **`[ Light ]`** dan **`[ Dark ]`** untuk melihat pratinjau instan tampilan terang/gelap.
8. **Sinkronisasi Markdown Metadata**: Menambahkan kolom referensi remote GitHub dan domain di berkas `index.md` aplikasi contoh (`radiansincostan`).

---

## 2. Arsitektur & Spesifikasi Solusi

### 2.1 Pembersihan Duplikasi Ikon Menu Hosting
Memperbaiki `openHostProviderMenu` di `AppsDashboardView.ts`:
- Gunakan teks bersih tanpa emoji:
  - `item.setTitle("Firebase Hosting").setIcon("flame")`
  - `item.setTitle("GitHub Pages").setIcon("github")`
- Menghilangkan redundansi visual.

---

### 2.2 Modal Link Remote Cerdas (`LinkRemoteModal`)
Ketika pengguna mengklik `+ Remote` atau saat GitHub Pages membutuhkan remote:
1. **Saran Nama Default**: Mengambil `app.catalog?.title || app.folderName`, membersihkan simbol, dan mengonversinya menjadi kebab-case (misal: `unit-circle-resolver`).
2. **Form Kontrol**:
   - Input Text: Nama Repositori / Remote URL.
   - Tombol **`[ Check ]`**: Memeriksa format slug, karakter ilegal, atau memvalidasi ketersediaan URL remote via git/HTTP ping.
   - Tombol **`[ Link Remote ]`**: Menghubungkan remote `git remote add origin <url>`.

---

### 2.3 Aturan Pre-requisite Deployment: GitHub Pages vs Firebase
- **Aturan GitHub Pages**:
  - Jika pengguna memilih **GitHub Pages** (baik via menu `+ Host ▾` atau `HostDrawer`), sistem memeriksa `app.git.remoteUrl`.
  - Jika belum ada remote (`!app.git.remoteUrl`):
    - Tampilkan Notice: `⚠️ GitHub Pages requires a linked GitHub remote repository first.`
    - Otomatis membuka modal `LinkRemoteModal` dengan saran nama terisi.
    - Setelah remote tersimpan, proses setup GitHub Pages langsung dilanjutkan.
- **Aturan Firebase Hosting**:
  - Tidak memerlukan remote Git. Dapat langsung membuat `firebase.json` dan deploy dari folder lokal.

---

### 2.4 Kolom Preview Gambar (256px) & Sinkronisasi Tema
1. **Default Visibility**:
   ```ts
   export const DEFAULT_VISIBLE_COLUMNS: string[] = [
     "folderName",
     "thumbnail",
     "path",
     "githubRepo",
     "staticHost",
     "actions",
   ];
   ```
2. **Dimensi & Render Visual**:
   - Container kartu gambar berukuran tinggi tetap `256px`.
   - Mengambil `imgLight` (`img-lightmode.webp`) dan `imgDark` (`img-darkmode.webp`) jika tersedia.
   - Default gambar:
     - Mode gelap Obsidian (`document.body.classList.contains("theme-dark")`) -> menampilkan `img-darkmode.webp`.
     - Mode terang Obsidian -> menampilkan `img-lightmode.webp`.
3. **Hover Overlay Grid**:
   ```text
   ┌──────────────────────────────────────────────┐
   │                                              │
   │               [ 🌐 Open HTML ]               │  <-- Center Top Click
   │                                              │
   │                 (Preview Image)              │
   │                                              │
   │           ┌──────────────┬──────────────┐    │
   │           │  ☀️ Light    │   🌙 Dark    │    │  <-- Bottom Toggle
   │           └──────────────┴──────────────┘    │
   └──────────────────────────────────────────────┘
   ```
   - Mengklik **Center Top** membuka `index.html` lokal di tab Obsidian.
   - Mengklik **Light / Dark** mengganti src gambar aktif secara instan tanpa reload halaman.

---

### 2.5 Aksi Terpadu: Open in Obsidian vs Open in Browser
Pada kolom **Actions**:
- Tombol **`[ 📖 App ]`** / **`[ 🌐 Obsidian ]`**: Membuka `index.html` menggunakan `workspace.openLinkText` atau `MarkdownView` / web leaf Obsidian.
- Tombol **`[ ↗ Browser ]`**: Membuka via shell OS default browser (`window.open` atau `electron.shell.openExternal`).
- Tombol **`[ 📂 Folder ]`**: Membuka direktori di OS file explorer.
- Tombol **`[ ⧉ Row ]`**: Menyalin data baris sebagai TSV.

---

### 2.6 Sinkronisasi Markdown Frontmatter (`radiansincostan/index.md`)
Menambahkan metadata git dan domain ke `index.md`:
```yaml
---
title: 📐 Unit Circle Resolver
sector: edu
category: MATH & CANVAS
scope: [edu]
file-size: 6.8 KB
tags: [SVG Arc, Math Engine, Zero-Backend]
overview: Interactive trigonometric unit circle calculator. Drag dynamic angle point to solve real-time sin, cos, and tan with exact radical fractions.
badge: v2.4
img: "[[img-lightmode.webp]], [[img-darkmode.webp]]"
imgLight: img-lightmode.webp
imgDark: img-darkmode.webp
github: "https://github.com/fadhlisl/fadhlisl-my-id/blob/main/apps/radiansincostan/standalone.md"
git-page: "fadhlisl.github.io"
---
```

---

## 3. Checklist Kriteria Penerimaan (Acceptance Criteria)

- [ ] **AC-1**: Duplikasi ikon pada menu dropdown `+ Host ▾` dihilangkan (hanya satu ikon bersih per item).
- [ ] **AC-2**: Dialog link remote memberikan saran nama repo default dari `title` yang di-slugify dan memiliki tombol `[ Check ]`.
- [ ] **AC-3**: Alur GitHub Pages mewajibkan remote Git terlebih dahulu dan memicu dialog remote jika belum ada.
- [ ] **AC-4**: Alur Firebase Hosting dapat berjalan mandiri tanpa mewajibkan remote Git.
- [ ] **AC-5**: Kolom thumbnail tampil secara default dengan tinggi gambar tepat 256px.
- [ ] **AC-6**: Thumbnail secara cerdas menampilkan versi Light/Dark sesuai tema aktif Obsidian.
- [ ] **AC-7**: Hover pada thumbnail memunculkan overlay: tombol toggle Light/Dark di bawah dan area klik Center Top untuk membuka HTML di Obsidian.
- [ ] **AC-8**: Tindakan membuka aplikasi menyediakan opsi `Open in Obsidian` dan `Open in Default Browser`.
- [ ] **AC-9**: File `index.md` pada aplikasi `radiansincostan` diperbarui dengan kolom git & domain.
- [ ] **AC-10**: Kompilasi `npm --prefix local run build` berhasil dengan 0 error TypeScript.
