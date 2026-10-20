# 📌 Master Brief: Self-Contained Accounts Manager, Interactive PowerShell Login Console & Firebase Project Setup

> **Feature Status**: `0` (Specification & Architecture)  
> **Target Module**: `local` (`pakcli-local`)  
> **Platform**: Windows Desktop (Obsidian Desktop Plugin)  
> **Date**: 2026-10-20  

---

## 1. Problem Statement & User Decisions

### 1.1 Masalah Sebelumnya
1. **Deployment Firebase Gagal (Exit Code 2)**:
   - Plugin sebelumnya meng-hardcode Project ID `radiansincostan` dan direktori `dist`. Project tersebut tidak ada di akun Google pengguna, dan folder `dist` tidak ada di aplikasi `radiansincostan` (karena `index.html` ada di root `.`).
2. **Ketiadaan Visibilitas & Kontrol Akun**:
   - Pengguna tidak dapat melihat akun GitHub dan Google Firebase yang sedang aktif.
   - Tidak ada antarmuka untuk memilih atau mengganti akun lokal.

### 1.2 Keputusan Desain dari Pengguna (Key User Decisions)
1. **Standalone & Bundled-In (No External Dependency)**:
   - Fitur harus **self-contained** di dalam plugin `local` (`pakcli-local`).
   - Tidak memerlukan dependensi eksternal terhadap `all-lads-tool`. Semua logic PowerShell dibundle langsung melalui Node `child_process` dan `powershell.exe` bawaan Windows.
2. **Interactive PowerShell Login Window ("Expose How It Works")**:
   - Saat pengguna ingin menambah/login akun baru, plugin membuka jendela terminal PowerShell interaktif (`powershell -NoExit -Command "..."`).
   - Terminal menampilkan banner ASCII, perintah CLI yang dijalankan (`firebase login`), dan status otorisasi browser secara transparan (tanpa black box).
3. **Kolom Akun Terpadu ("Accounts" Column)**:
   - Satu kolom di tabel yang menggabungkan GitHub (`🐙 pa****`) dan Google Firebase (`🔥 dc******@gmail.com`).
   - Default disensor (hanya 2 huruf pertama yang tampil).
   - Tombol **Expose (`👁️`)** untuk membuka/menutup sensor per baris.
4. **Zero-Browser Account Switcher (`⚙️`)**:
   - Tombol **`[ ⚙️ ]`** di cell akun membuka modal `AccountManagerModal`.
   - Menampilkan akun yang sudah ada di PC:
     - Google: `dcalibri@gmail.com` (aktif) dan `pakcli4000@gmail.com` (tersimpan di PC).
     - GitHub: `pakcli`.
   - Mengganti akun aktif ke project/app berjalan via `firebase login:use <email>` (0 browser auth, 0.1 detik).
   - Tombol **`[ 💻 Buka PowerShell Login ]`** untuk login akun baru ke PC.
   - Tombol **`[ 🚪 Logout Akun dari PC ]`** untuk membersihkan akun dari PC.
5. **Setup Firebase Modal (`SetupFirebaseModal`)**:
   - Menampilkan dropdown daftar project dari akun aktif via `firebase projects:list --json` (misal: `pakcli`, `coba-obs`, dll.).
   - Mendeteksi public directory secara cerdas (`.` untuk root folder aplikasi jika `index.html` di root, atau `dist` jika ada subfolder `dist/`).

---

## 2. Arsitektur Komponen & Implementasi Teknis

### 2.1 Backend CLI Bridge (`CliBridge.ts`)
1. **`getSystemAccountsInfo()`**:
   - Membaca akun Google Firebase aktif dan tersimpan dari `firebase login:list`.
   - Membaca username GitHub aktif dari `gh api user --jq .login` / `git config user.name`.
2. **`openInteractiveFirebaseLogin()`**:
   - Menjalankan terminal PowerShell baru:
     ```ts
     const psScript = `
       Write-Host "==================================================" -ForegroundColor Cyan
       Write-Host " 🔥 FIREBASE AUTHENTICATION (Interactive Console) " -ForegroundColor Yellow
       Write-Host "==================================================" -ForegroundColor Cyan
       Write-Host "[*] Executing: firebase login..." -ForegroundColor Gray
       firebase login
       Write-Host ""
       Write-Host "[OK] Finished! You can close this window and return to Obsidian." -ForegroundColor Green
     `;
     child_process.spawn("cmd.exe", ["/c", "start", "powershell.exe", "-NoExit", "-Command", psScript], { detached: true });
     ```
3. **`openInteractiveGitHubLogin()`**:
   - Menjalankan terminal PowerShell untuk `gh auth login` secara interaktif.
4. **`switchFirebaseAccount(email: string)`**:
   - Menjalankan `firebase login:use <email>` secara headless.
5. **`logoutFirebaseAccount(email?: string)`**:
   - Menjalankan `firebase logout` atau `firebase logout <email>`.
6. **`listFirebaseProjects()`**:
   - Mem-parsing output JSON `firebase projects:list --json` menjadi array daftar `{ projectId, displayName }`.

---

### 2.2 Model & Kolom Tabel (`types.ts` & `AppsDashboardView.ts`)
1. Menambahkan kolom `accounts` ke `ALL_AVAILABLE_COLUMNS` dan `DEFAULT_VISIBLE_COLUMNS`.
2. Fungsi `maskAccountIdentifier(str)`:
   - `pakcli` ➔ `pa****`
   - `dcalibri@gmail.com` ➔ `dc******@gmail.com`
3. Renderer kolom:
   - Baris 1: `🐙 pa****` (atau teks terbuka jika di-unmask).
   - Baris 2: `🔥 dc******@gmail.com`.
   - Tombol `[ 👁️ ]` toggle expose per baris.
   - Tombol `[ ⚙️ ]` membuka `AccountManagerModal`.

---

### 2.3 Modal Komponen Baru
1. **`AccountManagerModal`**:
   - Daftar akun Google Firebase yang tersimpan di PC dengan radio button pilih & tombol `[ ⇄ Gunakan Akun Ini ]`.
   - Tombol `[ 💻 Buka PowerShell Login ]` untuk menambah akun.
   - Tombol `[ 🚪 Logout Akun ]`.
   - Info akun GitHub lokal dan opsi penetapan git author.
2. **`SetupFirebaseModal`**:
   - Dropdown pilihan Project ID dari akun aktif.
   - Pilihan Public Directory (`.` vs `dist`).
   - Tombol simpan menulis `.firebaserc` dan `firebase.json` yang benar.
3. Tombol `[ ⚙️ Edit Config ]` di **`HostDrawer`** untuk mengubah project/direktori publik aplikasi yang sudah terkonfigurasi.

---

## 3. Checklist Kriteria Penerimaan (Acceptance Criteria)

- [ ] **AC-1**: Plugin berjalan 100% self-contained tanpa dependensi file eksternal dari `all-lads-tool`.
- [ ] **AC-2**: Terdapat kolom **Accounts** yang menampilkan akun GitHub dan Google Firebase dalam satu cell.
- [ ] **AC-3**: Akun disensor 2 huruf pertama secara default (`pa****`, `dc******@gmail.com`) dengan tombol **`👁️`** untuk expose/reveal.
- [ ] **AC-4**: Tombol **`[ ⚙️ ]`** membuka modal manajemen akun untuk switch akun lokal PC secara instan (zero browser).
- [ ] **AC-5**: Tersedia tombol **`[ 💻 Buka PowerShell Login ]`** yang membuka terminal PowerShell interaktif transparan untuk proses login.
- [ ] **AC-6**: `SetupFirebaseModal` menampilkan dropdown 10 project nyata (`pakcli`, dll.) dan auto-deteksi direktori publik (`.` untuk `radiansincostan`).
- [ ] **AC-7**: Host Drawer menyediakan tombol `[ ⚙️ Edit Config ]` untuk mengganti project kapan saja.
- [ ] **AC-8**: Kompilasi `npm --prefix local run build` berhasil dengan 0 error TypeScript.
