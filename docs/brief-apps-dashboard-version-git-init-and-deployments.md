# 📌 Master Brief: Apps Dashboard Git Initialization, Version Viewing & Dual Deployments

> **Feature Status**: `0` (Specification & Architecture)  
> **Target Module**: `local` (`pakcli-local`)  
> **Platform**: Windows Desktop (Node.js OS Bridge)  
> **Date**: 2026-10-20  

---

## 1. Executive Summary & Problem Statement

Pada arsitektur Apps Dashboard saat ini:
1. **Status Inisialisasi Git (0 -> 1):** Subfolder aplikasi di `root/apps/` yang belum memiliki git repository (`isRepo: false`) atau belum terhubung ke remote GitHub (`remoteUrl: ""`) membutuhkan alur inisialisasi satu-klik dari status 0 (uninitialized) ke status 1 (initialized git repository dengan initial commit dan remote link).
2. **Penayangan Versi (Version Viewing):** Pengguna ingin meninjau (*view*) versi yang berbeda, riwayat tag/commit, dan status rilis tanpa melakukan komit otomatis atau increment versi berulang (hanya transisi 0 -> 1 inisialisasi, bukan auto-bump 1->2345).
3. **Fokus Deployment Terbatas (Hanya Firebase & GitHub Pages):** Fokus deployment aplikasi saat ini dikhususkan secara spesifik hanya untuk dua provider terverifikasi:
   - **Firebase Hosting** (Google Cloud / Firebase static web hosting).
   - **GitHub Pages** (GitHub static branch / gh-pages hosting).

---

## 2. Spesifikasi Teknis & Solusi

### 2.1 Git Repository Initialization (Status 0 -> 1)
Ketika suatu aplikasi belum memiliki repository Git (`app.git.isRepo === false`):
- Tampilkan tombol **`[ ⚡ Init Git ]`** pada kolom **GitHub Repo**.
- Mengklik tombol menjalankan operasi inisialisasi:
  1. `git init` di direktori aplikasi.
  2. Pembuatan `.gitignore` standar (mengabaikan `node_modules/`, `.DS_Store`, `dist/` jika belum ada).
  3. Komit inisial: `git commit -m "chore: initial release"`.
- Jika repo sudah ada tetapi belum terhubung ke remote:
  - Tampilkan tombol **`[ 🔗 Link GitHub ]`** untuk menginput remote URL atau menggunakan GitHub CLI (`gh repo create`).
  - Menghubungkan remote: `git remote add origin <url>`.

---

### 2.2 Penayangan Riwayat Versi (Version Viewing)
Di tab **Version history** pada `HostDrawer`:
- Menampilkan daftar commit dan rilis/tag yang ada di repositori lokal.
- Menyediakan status visual apakah commit tersebut saat ini *Live* di hosting atau berstatus *Local build*.
- Tidak melakukan komit otomatis atau modifikasi berulang ke repositori (hanya inspeksi dan penayangan versi secara transparan).

---

### 2.3 Dual Deployment Providers (Firebase Hosting & GitHub Pages)
Dukungan konfigurasi dan deployment difokuskan pada 2 provider:

1. **Firebase Hosting**:
   - Jika `firebase.json` belum ada, sediakan wizard inisialisasi konfigurasi dasar:
     ```json
     {
       "hosting": {
         "public": "dist",
         "ignore": ["firebase.json", "**/.*", "**/node_modules/**"]
       }
     }
     ```
   - Deployment: `firebase deploy --only hosting` (Production) atau `firebase hosting:channel:deploy <channel>` (Preview).
   - Streaming log output secara real-time ke console drawer.

2. **GitHub Pages**:
   - Inisialisasi branch `gh-pages` jika belum aktif.
   - Deployment: push folder publik atau commit target ke branch `gh-pages` (`git push origin HEAD:gh-pages`).
   - Verifikasi URL Pages: `https://<user>.github.io/<repo>`.
   - Streaming log proses deployment langsung ke console drawer.

---

## 3. Checklist Kriteria Penerimaan (Acceptance Criteria)

- [ ] **AC-1**: Tombol `[ ⚡ Init Git ]` muncul otomatis di tabel untuk folder yang belum memiliki git repository.
- [ ] **AC-2**: Fitur `initGit` berhasil menginisialisasi repo dan commit pertama tanpa merusak file yang ada.
- [ ] **AC-3**: Tombol `[ 🔗 Link GitHub ]` memungkinkan penambahan remote URL repositori.
- [ ] **AC-4**: Tab **Version history** menyajikan daftar commit & versi yang ada secara informatif tanpa membuat komit otomatis.
- [ ] **AC-5**: Konfigurasi dan deploy Firebase Hosting berfungsi dengan streaming log.
- [ ] **AC-6**: Konfigurasi dan deploy GitHub Pages berfungsi dengan streaming log.
- [ ] **AC-7**: Kompilasi plugin `npm --prefix local run build` berhasil dengan 0 error TypeScript.
