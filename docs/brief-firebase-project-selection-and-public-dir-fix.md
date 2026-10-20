# 📌 Master Brief: Firebase Project Selection, Auto Public-Dir Detection & Config Editor

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
   - Hal ini membuat berkas `.firebaserc` otomatis berisi:
     ```json
     {
       "projects": {
         "default": "radiansincostan"
       }
     }
     ```
   - Namun, di ekosistem Google Firebase, Project ID harus terdaftar di Google Cloud / Firebase Console milik pengguna.
   - Akun pengguna saat ini memiliki 10 project yang valid (`pakcli`, `coba-obs`, `anatomi-manusia`, `cdd-mrecvrdi`, `indonesia17agustus1945`, `itsgonnabegood`, `lamboarfurniture`, dll.), dan **tidak ada** project bernama `radiansincostan`.
2. **Hardcoded `"dist"` Public Directory**:
   - Parameter `publicDir` di-hardcode ke `"dist"`.
   - Pada aplikasi static zero-build (seperti `radiansincostan`), berkas `index.html` berada langsung di root folder aplikasi (`.`), bukan di dalam subfolder `dist/`. Men-deploy ke `dist` yang tidak ada akan menghasilkan error atau halaman kosong 404.
3. **Ketiadaan UI Pemilihan Project & Konfigurasi Ulang**:
   - Tidak ada modal konfirmasi untuk memilih project Firebase yang aktif.
   - Tidak ada tombol "Edit Config" di `HostDrawer` untuk mengubah project jika sudah terlanjur tertulis nama yang salah di `.firebaserc`.

---

## 2. Arsitektur & Rencana Solusi (Action Plan)

### 2.1 Modal Pemilihan Firebase (`SetupFirebaseModal`)
Ketika pengguna mengklik **"Setup Firebase Hosting"** (baik dari menu baris `+ Host ▾` maupun dari tombol setup di `HostDrawer`), plugin akan menampilkan modal interaktif:
1. **Daftar Project Firebase Akun Pengguna**:
   - Memanggil `firebase projects:list --json` melalui `CliBridge.listFirebaseProjects()`.
   - Menampilkan dropdown daftar project yang ada di akun pengguna (misal: `pakcli`, `coba-obs`, dll.).
   - Menyediakan input teks manual jika pengguna ingin mengetikkan Project ID kustom.
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

### 2.2 Tombol Edit Konfigurasi di `HostDrawer`
1. Pada kartu hosting Firebase di `HostDrawer`:
   - Tambahkan tombol **`[ ⚙️ Edit Config ]`** di samping nama Project ID.
   - Mengklik tombol ini akan membuka `SetupFirebaseModal` yang sudah terisi dengan konfigurasi saat ini, sehingga pengguna dapat dengan mudah mengganti project (misal dari `radiansincostan` ke `pakcli`) tanpa perlu mengedit berkas tersembunyi secara manual.

---

### 2.3 Smart Deployment Diagnostics
1. Pada `CliBridge.streamDeploy()`:
   - Jika stdout/stderr Firebase menghasilkan:
     `Failed to get Firebase project ...`
   - Berikan catatan panduan otomatis di log streaming:
     `💡 Hint: Project tersebut tidak ditemukan di akun Firebase Anda. Klik tombol [⚙️ Edit Config] di panel Host Drawer untuk memilih project yang valid (misal: pakcli).`

---

## 3. Checklist Kriteria Penerimaan (Acceptance Criteria)

- [ ] **AC-1**: Mengklik "Setup Firebase Hosting" menampilkan modal interaktif `SetupFirebaseModal`, bukan langsung menulis folderName secara sepihak.
- [ ] **AC-2**: Modal menampilkan daftar project Firebase nyata dari akun pengguna via CLI (`firebase projects:list`), dengan opsi fallback teks.
- [ ] **AC-3**: Public directory mendeteksi secara cerdas apakah aplikasi menggunakan root `.` atau `dist/`.
- [ ] **AC-4**: Tersedia tombol `[ ⚙️ Edit Config ]` di Host Drawer untuk mengganti project / direktori publik kapan saja.
- [ ] **AC-5**: Deployment berhasil ke project yang valid (misal `pakcli`) tanpa exit code 2.
- [ ] **AC-6**: Kompilasi `npm --prefix local run build` lulus dengan 0 error TypeScript.
