# 📌 Master Brief: Firebase Project Selection, Dynamic Account Detection (GitHub/Firebase) & Config Editor

> **Feature Status**: `0` (Specification & Architecture)  
> **Target Module**: `local` (`pakcli-local`)  
> **Platform**: Windows Desktop (Obsidian Desktop Plugin)  
> **Date**: 2026-10-20  

---

## 1. Problem Statement & Root Cause

Saat pengguna mencoba men-deploy aplikasi `radiansincostan` ke Firebase Hosting, proses deployment gagal dengan pesan kesalahan:
```text
Error: Failed to get Firebase project radiansincostan. Please make sure the project exists and your account has permission to access it.
Deployment failed with exit code 2
```

### 1.1 Akar Masalah (Root Cause):
1. **Hardcoded Project ID Berdasarkan Folder Name**:
   - Kode di `AppsDashboardView.ts` dan `HostDrawer.ts` sebelumnya mengeksekusi:
     ```ts
     const siteId = app.folderName.toLowerCase().replace(/[^a-z0-9-]/g, "");
     await this.store.setupFirebaseForApp(app, siteId, "dist");
     ```
   - Hal ini membuat berkas `.firebaserc` otomatis berisi `default: radiansincostan`, padahal di Firebase Console pengguna tidak memiliki project bernama tersebut.
2. **Hardcoded `"dist"` Public Directory**:
   - Parameter `publicDir` di-hardcode ke `"dist"`.
   - Pada aplikasi static zero-build (seperti `radiansincostan`), berkas `index.html` berada langsung di root folder aplikasi (`.`), bukan di dalam subfolder `dist/`. Men-deploy ke `dist` yang tidak ada akan menghasilkan error atau halaman kosong 404.
3. **Hardcoded Akun / Username**:
   - Sebelumnya username GitHub di-hardcode ke `"fadhlisl"`, padahal akun aktif di sistem saat ini adalah `pakcli` (terdeteksi via `gh api user` / `git config user.name`).
   - Email akun Google Firebase belum dicek secara dinamis dari sistem lokal (akun aktif: `dcalibri@gmail.com` via `firebase login:list`).
4. **Ketiadaan UI Pemilihan Project & Konfigurasi Ulang**:
   - Tidak ada modal konfirmasi untuk memilih project Firebase yang aktif.
   - Tidak ada tombol "Edit Config" di `HostDrawer` untuk mengubah project jika sudah terlanjur tertulis nama yang salah di `.firebaserc`.

---

## 2. Arsitektur & Rencana Solusi (Action Plan)

### 2.1 Deteksi Akun Dinamis dari Sistem Lokal (`CliBridge.checkHealth`)
1. **GitHub Username & Email**:
   - Mengambil username aktif via CLI:
     1. `gh api user --jq .login` (menghasilkan misal `pakcli`).
     2. Fallback: `git config user.name` dan `git config user.email`.
   - Menggunakan nilai ini di `LinkRemoteModal` secara dinamis (menggantikan hardcoded string).
2. **Google Firebase User Email**:
   - Mengambil email aktif via `firebase login:list`.
   - Menampilkan email aktif (`dcalibri@gmail.com`) pada `DiagnosticBar` dan `SetupFirebaseModal`.

---

### 2.2 Modal Pemilihan Firebase (`SetupFirebaseModal`)
Ketika pengguna mengklik **"Setup Firebase Hosting"** (baik dari menu baris `+ Host ▾` maupun dari tombol setup di `HostDrawer`):
1. **Daftar Project Firebase Akun Pengguna**:
   - Memanggil `firebase projects:list --json` melalui `CliBridge.listFirebaseProjects()`.
   - Menampilkan dropdown daftar project nyata di akun pengguna (misal: `pakcli`, `coba-obs`, dll.).
   - Menyediakan input teks manual jika pengguna ingin mengetikkan Project ID kustom.
   - Menampilkan info akun Google yang sedang aktif (`dcalibri@gmail.com`).
   - Tombol **`[ 🔄 Refresh Projects ]`** untuk memperbarui daftar project secara live dari CLI.
2. **Deteksi Otomatis Public Directory**:
   - Jika terdapat folder `dist/` atau `build/`, otomatis pilih `dist` atau `build`.
   - Jika berkas `index.html` ada di root folder aplikasi, otomatis pilih `.` (Root Folder).
   - Pengguna tetap dapat mengedit nama folder publik secara bebas.
3. **Simpan Konfigurasi**:
   - Menulis `.firebaserc` dengan Project ID yang dipilih.
   - Menulis `firebase.json` dengan `public` directory yang sesuai.
   - Me-refresh `HostDrawer` dan status record aplikasi secara reaktif.

---

### 2.3 Tombol Edit Konfigurasi di `HostDrawer`
1. Pada kartu hosting Firebase di `HostDrawer`:
   - Tambahkan tombol **`[ ⚙️ Edit Config ]`** di samping nama Project ID.
   - Mengklik tombol ini akan membuka `SetupFirebaseModal` yang sudah terisi dengan konfigurasi saat ini, sehingga pengguna dapat dengan mudah mengganti project (misal dari `radiansincostan` ke `pakcli`) tanpa perlu mengedit berkas tersembunyi secara manual.

---

### 2.4 Smart Deployment Diagnostics
1. Pada `CliBridge.streamDeploy()`:
   - Jika stdout/stderr Firebase menghasilkan:
     `Failed to get Firebase project ...`
   - Berikan catatan panduan otomatis di log streaming:
     `💡 Hint: Project tersebut tidak ditemukan di akun Firebase Anda. Klik tombol [⚙️ Edit Config] di panel Host Drawer untuk memilih project yang valid (misal: pakcli).`

---

## 3. Checklist Kriteria Penerimaan (Acceptance Criteria)

- [ ] **AC-1**: Username GitHub dan email Firebase dicek secara dinamis dari CLI sistem lokal (`gh`/`git` dan `firebase login:list`).
- [ ] **AC-2**: Mengklik "Setup Firebase Hosting" menampilkan modal interaktif `SetupFirebaseModal`, bukan langsung menulis folderName secara sepihak.
- [ ] **AC-3**: Modal menampilkan daftar project Firebase nyata dari akun pengguna via CLI (`firebase projects:list`), dengan opsi fallback teks.
- [ ] **AC-4**: Public directory mendeteksi secara cerdas apakah aplikasi menggunakan root `.` atau `dist/`.
- [ ] **AC-5**: Tersedia tombol `[ ⚙️ Edit Config ]` di Host Drawer untuk mengganti project / direktori publik kapan saja.
- [ ] **AC-6**: Deployment berhasil ke project yang valid (misal `pakcli`) tanpa exit code 2.
- [ ] **AC-7**: Kompilasi `npm --prefix local run build` lulus dengan 0 error TypeScript.
