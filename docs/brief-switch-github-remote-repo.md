# 📌 Master Brief: Git Remote Repository Switcher & Editor ("Switch Repo Nicely")

> **Feature Status**: `0` (Specification & Architecture)  
> **Target Module**: `local` (`pakcli-local`)  
> **Platform**: Windows Desktop (Obsidian Desktop Plugin)  
> **Date**: 2026-10-20  

---

## 1. Problem Statement & Root Cause

### 1.1 Masalah Saat Ini:
Pada aplikasi `radiansincostan`, kolom **GitHub Repo** menampilkan:
```text
github.com/fadhlisl/radian-si... [ ↗ ]
```
Pengguna menunjukkan bahwa:
1. `fadhlisl` **bukan** username yang diinginkan (username yang aktif di PC adalah `pakcli`).
2. Pengguna **tidak memiliki cara/tombol visual di UI** untuk mengganti remote repo tersebut ke repositori lain atau ke username `pakcli`.
3. Saat ini cell hanya menampilkan teks URL dan tombol `[ ↗ ]` (buka di browser), tanpa tombol **Edit / Switch / Unlink**.

### 1.2 Akar Masalah (Root Cause):
1. **URL Sudah Tersimpan di Git Remote Lokal**:
   - Di repositori folder `radiansincostan/.git/config`, git remote `origin` telah diset ke:
     `https://github.com/fadhlisl/radian-sin-cos-tan.git`.
2. **UI Bersifat Read-Only Setelah Remote Terhubung**:
   - Logika di `AppsDashboardView.ts` hanya menampilkan tombol `[ + Link Remote ]` jika repo **belum** memiliki remote (`!app.git.remoteUrl`).
   - Begitu remote sudah terhubung, UI berubah menjadi teks mati + tombol `[ ↗ ]` tanpa tombol edit `[ ✏️ ]`.

---

## 2. Solusi Desain ("How to Switch Repo Nicely")

### 2.1 Tombol `[ ✏️ ]` (Switch / Change Remote) pada Kolom GitHub Repo
Di samping tombol `[ ↗ ]`, kita tambahkan tombol **Edit/Switch Repo (`[ ✏️ ]`)**:
```text
┌────────────────────────────────────────────────────────┐
│ github.com/fadhlisl/radian-si...  [ ✏️ ] [ ↗ ]          │
└────────────────────────────────────────────────────────┘
```
- Mengklik tombol `[ ✏️ ]` akan membuka modal **`SwitchRemoteModal`** / **`LinkRemoteModal`**:
  1. **Username Sistem Aktif**:
     - Otomatis menggunakan `pakcli` (terdeteksi dari sistem).
  2. **Pilihan Cepat (*One-Click Quick Switch*)**:
     - Tombol `[ ⚡ Switch to https://github.com/pakcli/radiansincostan.git ]`.
  3. **Input URL Kustom**:
     - Text field yang dapat diisi URL repositori baru apa pun (HTTPS / SSH).
  4. **Tombol `[ 🗑️ Unlink Remote ]`**:
     - Menghapus remote `origin` dari repositori jika pengguna ingin memutus tautan remote sama sekali.
  5. **Tombol `[ Save / Switch Remote ]`**:
     - Menjalankan `git remote set-url origin <newUrl>` di folder aplikasi.
     - Melakukan re-scan otomatis sehingga dashboard langsung menampilkan URL baru.

---

### 2.2 Integrasi di Host Drawer
Pada panel samping `HostDrawer`:
- Tambahkan baris metadata **"Remote Repo"**:
  - Menampilkan remote URL saat ini.
  - Tombol **`[ ✏️ Change ]`** (membuka modal switch repo).
  - Tombol **`[ 🗑️ Unlink ]`** (menghapus remote).

---

### 2.3 Metode Backend di `CliBridge.ts`
1. **`setGitHubRemote(appPath: string, newUrl: string)`**:
   - Menjalankan:
     `git remote set-url origin "<newUrl>"` (atau `git remote add origin "<newUrl>"` jika belum ada).
2. **`unlinkGitHubRemote(appPath: string)`**:
   - Menjalankan:
     `git remote remove origin`.

---

## 3. Checklist Kriteria Penerimaan (Acceptance Criteria)

- [ ] **AC-1**: Kolom GitHub Repo menyediakan tombol **`[ ✏️ ]`** untuk mengedit/mengganti remote URL yang sudah ada.
- [ ] **AC-2**: Modal switch repo menyarankan username sistem yang benar (`pakcli`), bukan hardcoded `fadhlisl`.
- [ ] **AC-3**: Pengguna dapat mengubah remote repo ke `https://github.com/pakcli/radiansincostan.git` secara visual tanpa buka terminal.
- [ ] **AC-4**: Terdapat opsi **Unlink Remote** untuk memutus tautan git origin.
- [ ] **AC-5**: Panel Host Drawer menampilkan remote URL beserta tombol edit/change.
- [ ] **AC-6**: Kompilasi `npm --prefix local run build` berhasil dengan 0 error TypeScript.
