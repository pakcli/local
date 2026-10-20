# 📌 Master Brief: Unified Accounts Column (GitHub & Google), 2-Letter Masking with Expose Toggle, Local PC Account Switcher & Firebase Project Selector

> **Feature Status**: `0` (Specification & Architecture)  
> **Target Module**: `local` (`pakcli-local`)  
> **Platform**: Windows Desktop (Obsidian Desktop Plugin)  
> **Date**: 2026-10-20  

---

## 1. Problem Statement & User Requirements

### 1.1 Masalah Sebelumnya:
1. **Deployment Firebase Gagal (Exit Code 2)**:
   - Plugin secara sepihak menetapkan folder `radiansincostan` sebagai Project ID dan `dist` sebagai direktori publik. Proyek ini tidak ada di akun Google Firebase pengguna, sehingga deployment gagal.
2. **Ketiadaan Visibilitas Akun**:
   - Pengguna tidak dapat melihat akun GitHub dan Google Firebase mana yang saat ini terhubung dan mengelola setiap aplikasi.

### 1.2 Kebutuhan Fitur Baru dari Pengguna:
1. **Kolom Akun Terpadu ("Accounts" Column)**:
   - Satu kolom di dashboard table yang menampilkan akun **GitHub** dan akun **Google Firebase** secara bersamaan.
2. **Proteksi Privasi Sensor 2 Huruf + Tombol Expose (`👁️`)**:
   - Secara default disensor: hanya **2 huruf pertama** yang terlihat, sisanya digantikan dengan bintang `**`.
     - Contoh GitHub: `pakcli` ➔ `pa****`
     - Contoh Google: `dcalibri@gmail.com` ➔ `dc******@gmail.com`
   - Tombol **Expose** (`👁️`) di sampingnya untuk membuka/menutup sensor (unmask/mask toggle) secara instan.
3. **Tombol Config / Switch Account Lokal PC (Tanpa Login Browser)**:
   - Tombol **`[ ⚙️ / ⇄ ]`** di samping cell akun untuk mengganti atau menetapkan (*assign*) akun ke aplikasi tersebut.
   - **Hanya menampilkan akun yang SUDAH login di PC saat ini**:
     - Google/Firebase: Terdeteksi akun `dcalibri@gmail.com` (aktif) dan `pakcli4000@gmail.com`. Dapat dialihkan via `firebase login:use <email>` tanpa membuka browser pop-up.
     - GitHub: Terdeteksi akun `pakcli` via CLI/keyring. Dapat di-assign ke konfigurasi git repo lokal (`git config user.name`/`user.email`) tanpa browser auth.
   - **Zero Browser Authentication**: Tidak ada dialog OAuth di browser web, 100% menggunakan session yang sudah tersedia di PC.
4. **Modal Konfigurasi Firebase (`SetupFirebaseModal`)**:
   - Memilih Project ID nyata dari akun pengguna (misal: `pakcli`, `coba-obs`, dll.) via `firebase projects:list --json`.
   - Menetapkan public directory secara cerdas (`.` untuk root index.html, atau `dist` jika ada subfolder dist).

---

## 2. Arsitektur Komponen & Data Flow

### 2.1 Backend / CLI Bridge (`CliBridge.ts`)
1. **`getSystemAccountsInfo()`**:
   - Membaca akun Google Firebase yang login di PC via `firebase login:list`:
     - Email aktif (e.g. `dcalibri@gmail.com`).
     - Email cadangan/tersedia di PC (e.g. `pakcli4000@gmail.com`).
   - Membaca akun GitHub yang login di PC via `gh api user --jq .login` / `gh auth status` / `git config`:
     - Username (e.g. `pakcli`).
     - Email (e.g. `276874584+pakcli@users.noreply.github.com`).
2. **`switchFirebaseAccount(email: string)`**:
   - Menjalankan `firebase login:use <email>` secara headless (zero browser auth).
3. **`listFirebaseProjects()`**:
   - Menjalankan `firebase projects:list --json` untuk mendapatkan daftar ID proyek milik akun yang sedang aktif.

---

### 2.2 Model & Types (`types.ts`)
```ts
export interface SystemAccountsInfo {
  firebase: {
    activeEmail?: string;
    availableEmails: string[];
  };
  github: {
    username?: string;
    email?: string;
  };
}
```
- Menambahkan kolom `"accounts"` ke `ALL_AVAILABLE_COLUMNS` dan `DEFAULT_VISIBLE_COLUMNS`.

---

### 2.3 UI Table Column: "Accounts" (`AppsDashboardView.ts`)
- **Tampilan Cell**:
  ```text
  ┌──────────────────────────────────────────────┐
  │ 🐙 pa****                                    │
  │ 🔥 dc******@gmail.com                        │
  │ [ 👁️ Reveal ]  [ ⚙️ Assign / Switch ]        │
  └──────────────────────────────────────────────┘
  ```
- **Fungsi Sensor (`maskAccountIdentifier`)**:
  - `pakcli` ➔ `pa****`
  - `dcalibri@gmail.com` ➔ `dc******@gmail.com`
  - Klik `👁️` ➔ toggle state tampilan cell antara tersensor dan terbuka.
- **Tombol `[ ⚙️ ]` (Assign / Switch Account Modal)**:
  - Membuka modal `AccountAssignmentModal`:
    - Dropdown / pilihan akun Google yang sudah login di PC (`dcalibri@gmail.com` vs `pakcli4000@gmail.com`).
    - Akun GitHub lokal (`pakcli`).
    - Tombol simpan dan assign ke aplikasi saat ini.

---

### 2.4 Modal Konfigurasi Firebase (`SetupFirebaseModal`)
- Menampilkan pilihan Project ID dari daftar project di akun aktif (`pakcli`, `coba-obs`, dll.).
- Memilih public directory (otomatis mendeteksi root `.` atau `dist/`).
- Tombol simpan menulis `.firebaserc` dan `firebase.json` yang valid.

---

## 3. Checklist Kriteria Penerimaan (Acceptance Criteria)

- [ ] **AC-1**: Terdapat kolom baru **Accounts** yang menampilkan akun GitHub dan akun Google Firebase dalam 1 cell.
- [ ] **AC-2**: Nilai akun disensor secara default (hanya 2 huruf pertama yang tampil, sisanya `****`).
- [ ] **AC-3**: Terdapat tombol **Expose/Reveal (`👁️`)** yang dapat menyalakan/mematikan sensor per baris.
- [ ] **AC-4**: Terdapat tombol **Config/Switch (`⚙️`)** di samping cell untuk memilih akun yang sudah login di PC.
- [ ] **AC-5**: Pergantian akun berjalan 100% lokal di PC tanpa membuka auth di browser (`firebase login:use`).
- [ ] **AC-6**: `SetupFirebaseModal` memungkinkan pemilihan project Firebase nyata (`pakcli`, dll.) dan auto-deteksi direktori publik (`.` untuk `radiansincostan`).
- [ ] **AC-7**: Kompilasi `npm --prefix local run build` berhasil dengan 0 error TypeScript.
