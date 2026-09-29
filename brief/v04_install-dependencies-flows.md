# Brief v04: Alur Diagnosa & Instalasi Dependensi Berbasis PowerShell

> **Status:** Architecture & Workflow Specification  
> **Scope:** `pakcli-plugin/local` (Hub, Git Manager, YTD, & Symlink Manager)  
> **Core Principle:** **PowerShell sebagai Master Engine Tunggal**. Seluruh diagnosa sistem dan aksi instalasi wajib dieksekusi via skrip PowerShell secara terpusat, modular, dan bertingkat.

---

## 1. Filosofi & Mental Model: "The Gatekeeper Flow"

Dalam PakCLI Suite, **PowerShell (`pwsh` atau `powershell.exe`) bertindak sebagai "Konduktor Utama"**:

```
                               ┌────────────────────────────────────────────────────────┐
                               │           LEVEL 0: POWERSHELL GATEKEEPER               │
                               │  Apakah pwsh / powershell.exe tersedia di sistem?      │
                               └──────────────────────────┬─────────────────────────────┘
                                                          │
                             ┌────────────────────────────┴───────────────────────────┐
                             │                                                        │
                      [ ❌ BELUM ADA ]                                         [ ✅ TERSEDIA ]
                             │                                                        │
              Fitur Standar Tetap Berjalan!                                     Engine Aktif!
           (Baca Note, Preview, CopyPaste OK)                                         │
                             │                                                        ▼
                 Panel Diagnosa Ditangguhkan                               ┌─────────────────────┐
           "Pasang PowerShell untuk membuka                                │ LEVEL 1: DIAGNOSA   │
              fitur diagnosa & 1-click install"                            │  Semua Dependensi   │
                                                                           └──────────┬──────────┘
                                                                                      │
                                                               ┌──────────────────────┼──────────────────────┐
                                                               ▼                      ▼                      ▼
                                                           [📦 GIT]               [🎬 YTD]              [🔗 SYMLINK]
                                                           git, bash          yt-dlp, ffmpeg         Dev Mode, Junction
                                                               │                      │                      │
                                                               └──────────────────────┼──────────────────────┘
                                                                                      │
                                                                                      ▼
                                                                           ┌─────────────────────┐
                                                                           │ LEVEL 2: INSTALLER  │
                                                                           │ 1-Click via PS1     │
                                                                           │ (winget / direct)   │
                                                                           └─────────────────────┘
```

### 3 Prinsip Utama:
1. **Graceful Non-Blocking (Tanpa Crash):**  
   Jika PowerShell belum terdeteksi di laptop pengguna, **plugin TIDAK boleh crash atau error**. Fitur-fitur dasar teks (membaca catatan, live preview markdown, copy-paste) tetap dapat digunakan dengan normal.
2. **Prasyarat Diagnosa (PowerShell First):**  
   Untuk membuka tab diagnosa menyeluruh dan menjalankan tombol instalasi otomatis, PowerShell harus aktif terlebih dahulu.
3. **All-in-One Native Windows Bridge:**  
   Tidak perlu mengandalkan binary luar aneh-aneh. Segala hal (deteksi registry Windows, cek hak akses admin/Developer Mode, unduh file, instalasi winget) diserahkan ke PowerShell.

---

## 2. Rincian Dependensi per Fitur

| Modul Fitur | Dependensi Target | Metode Pengecekan (PowerShell) | Aksi Instalasi Otomatis (PowerShell) |
| :--- | :--- | :--- | :--- |
| **Level 0: Core Engine** | **PowerShell** (`pwsh` / `powershell.exe`) | Node `child_process.exec("where.exe pwsh")` | Manual install via Microsoft Store / MSI link |
| **Git Manager** | **Git CLI** & **Git Bash** | `git --version`, `where.exe git`, `bash --version` | `winget install --id Git.Git -e --source winget` |
| **YTD Capture** | **yt-dlp** & **ffmpeg** | `yt-dlp --version`, `ffmpeg -version` | `winget install yt-dlp.yt-dlp` & `winget install Gyan.FFmpeg` |
| **Symlink Manager** | **Developer Mode** & **Junction** | Cek Registry `HKLM:\...\AppModelUnlock` | Elevasi script admin untuk aktifkan Dev Mode tanpa reboot |

---

## 3. UI/UX Wireframe Alur Diagnosa & Instalasi

### Wireframe A: Kondisi Level 0 (PowerShell Belum Terdeteksi)
Ketika sistem belum mendeteksi PowerShell (atau child_process dibatasi):

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│ ⚙️ PakCLI Settings ➔ Setup & Dependencies                                                       │
├─────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                 │
│  ⚠️ PowerShell Engine Diperlukan untuk Diagnosa & Instalasi Otomatis                            │
│                                                                                                 │
│  Halo lad! Fitur pengeditan catatan dan preview Anda tetap berjalan normal tanpa kendala.       │
│  Namun, untuk menjalankan diagnosa dependensi (Git, yt-dlp, Symlink) serta instalasi 1-klik,   │
│  PakCLI membutuhkan PowerShell aktif di perangkat Anda.                                         │
│                                                                                                 │
│  Terdeteksi Lingkungan Sistem:                                                                  │
│  🖥️ OS: Windows 11 (x64)  |  Status: ❌ PowerShell belum terdeteksi di Environment PATH        │
│                                                                                                 │
│  Pilih salah satu cara termudah untuk memasang PowerShell:                                       │
│                                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │ OPSI 1: Pasang via Microsoft Store (Rekomendasi untuk Windows 10/11)                      │  │
│  │ Membuka aplikasi Microsoft Store resmi langsung ke laman PowerShell Core (pwsh).         │  │
│  │ Klik tombol di bawah ➔ Langsung tekan "Get / Dapatkan" di jendela Store yang terbuka:      │  │
│  │                                                                                           │  │
│  │ [ 🏪 Buka Microsoft Store (PowerShell) ]                                                  │  │
│  └───────────────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │ OPSI 2: Unduh Manual dari Website Resmi Microsoft                                         │  │
│  │ Membuka peramban browser ke web resmi GitHub / Microsoft untuk mengunduh installer .msi. │  │
│  │                                                                                           │  │
│  │ [ 🌐 Buka Web Resmi PowerShell (Download Sendiri) ]                                       │  │
│  └───────────────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                                 │
│  Setelah selesai menginstal, tekan tombol verifikasi:                                           │
│  [ 🔄 Cek Ulang Status PowerShell ]                                                             │
│                                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### Mekanisme Teknis di Balik 2 Tombol Level 0:
1. **Tombol 1 (`[🏪 Buka Microsoft Store]`):**
   - Node.js memicu protocol URI Windows bawaan tanpa butuh PowerShell:
     ```typescript
     // Membuka Microsoft Store langsung ke package resmi Microsoft.PowerShell
     window.open("ms-windows-store://pdp/?productid=9MZ1SNWT0N5D");
     ```
   - *Alternatif cmd.exe (jika winget ada):* Node.js mengeksekusi via shell dasar `cmd.exe /c winget install Microsoft.PowerShell`.
2. **Tombol 2 (`[🌐 Buka Web Resmi PowerShell]`):**
   - Mengarahkan peramban pengguna langsung ke tautan unduh resmi:
     ```typescript
     window.open("https://github.com/PowerShell/PowerShell/releases/latest");
     ```
3. **Tombol Refresh (`[🔄 Cek Ulang Status]`):**
   - Menjalankan kembali probing Node `child_process.exec("where.exe pwsh || where.exe powershell")`. Jika berhasil, halaman otomatis beralih ke **Wireframe B (Level 1)**.


---

### Wireframe B: Kondisi Level 1 (PowerShell Aktif ➔ Diagnosa Terbuka)
Ketika PowerShell terdeteksi, panel diagnosa lengkap untuk seluruh modul terbuka dengan bahasa yang santai namun informatif:

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│ ⚙️ PakCLI Settings ➔ Setup & Dependencies Hub                                                   │
├─────────────────────────────────────────────────────────────────────────────────────────────────┤
│  ⚡ Master Engine: ✅ PowerShell Core 7.4.2 Aktif & Siap Tempur!                                │
│                                                                                                 │
│  [🔄 Jalankan Diagnosa Ulang]                                             [📦 Cek Update Semua] │
├─────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                 │
│  ▼ 🌿 MODUL GIT MANAGER                                                                         │
│    ├── 🌐 Koneksi Internet : ✅ Online (Siap sinkronisasi remote & cek update)                 │
│    ├── 📦 Git Core Engine  : ❌ Belum Terpasang (git command not found)                        │
│    │     Status : Mesin snapshot lokal membutuhkan Git untuk mencatat history objek.            │
│    │     Solusi : [⚡ Pasang Git via PowerShell (winget)]   [📖 Panduan Manual]                 │
│    └── 🐚 Bash Environment : 💡 Belum Ada (Santai saja, PowerShell siap jadi fallback penuh)   │
│                                                                                                 │
│  ▼ 🎬 MODUL YT DOWNLOADER (YTD)                                                                 │
│    ├── 📥 yt-dlp Binary    : ✅ Terpasang (v2026.03.15) di AppData/Local                        │
│    └── 🎞️ FFmpeg Engine    : ❌ Belum Terpasang                                                │
│          Status : Konversi audio/video 1080p membutuhkan FFmpeg.                                │
│          Solusi : [⚡ Pasang FFmpeg via PowerShell (winget)]                                    │
│                                                                                                 │
│  ▼ 🔗 MODUL SYMLINK MANAGER                                                                     │
│    ├── 🔀 Junction Support : ✅ Aktif (Bisa membuat folder junction antar-drive lokal)          │
│    └── 🛡️ Developer Mode   : ⚠️ Belum Aktif                                                    │
│          Status : Perlu Developer Mode agar mklink /D tidak meminta konfirmasi Administrator.   │
│          Solusi : [⚡ Aktifkan Developer Mode via PowerShell Elevasi]                           │
│                                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

### Wireframe C: Level 2 - Modal Progress Eksekusi PowerShell (1-Click Install)
Ketika user mengklik tombol `[⚡ Pasang Git via PowerShell]`, muncul modal progress transparan dengan output langsung dari terminal PowerShell:

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│  ⚡ PakCLI PowerShell Runner - Menginstal Git for Windows                                  [✕] │
├─────────────────────────────────────────────────────────────────────────────────────────────────┤
│  Status: Sedang mengunduh dan memasang paket resmi via winget...                                │
│                                                                                                 │
│  ┌─ Log Output (PowerShell Stream) ───────────────────────────────────────────────────────────┐ │
│  │ > Executing: winget install --id Git.Git -e --source winget --accept-source-agreements    │ │
│  │ Found Git [Git.Git] Version 2.46.0                                                         │ │
│  │ Downloading https://github.com/git-for-windows/git/releases/...                            │ │
│  │ ████████████████████████████████ 100% (62.4 MB)                                           │ │
│  │ Installing package...                                                                      │ │
│  │ Successfully installed Git!                                                                │ │
│  │ Path registered to Environment PATH.                                                       │ │
│  └────────────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                                 │
│  Progress: [==================================================] 100%                            │
│                                                                                                 │
│  [✔ Instalasi Selesai!]                             [ Tutup ]                                   │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Logika Skrip PowerShell di Balik Layar

### A. Diagnosa Komprehensif Satu Kali Jalan (`Test-PakCLIDependencies.ps1`)
Alih-alih memanggil ratusan kali child process dari Node.js, PakCLI cukup memanggil **1 skrip PowerShell tunggal** yang mengembalikan JSON lengkap:

```powershell
# Test-PakCLIDependencies.ps1
$result = [PSCustomObject]@{
    PowerShell = $PSVersionTable.PSVersion.ToString()
    Internet   = $false
    Git        = @{ Installed = $false; Version = ""; Path = "" }
    Bash       = @{ Installed = $false; Version = "" }
    YtDlp      = @{ Installed = $false; Version = "" }
    FFmpeg     = @{ Installed = $false; Version = "" }
    Symlink    = @{ DevMode = $false; HasAdmin = $false }
    WinGet     = [bool](Get-Command winget -ErrorAction SilentlyContinue)
}

# 1. Cek Internet
try {
    $req = [System.Net.WebRequest]::Create("https://www.google.com/generate_204")
    $req.Timeout = 3000
    $resp = $req.GetResponse()
    $result.Internet = ($resp.StatusCode -eq 204 -or $resp.StatusCode -eq 200)
} catch { $result.Internet = $false }

# 2. Cek Git & Bash
if (Get-Command git -ErrorAction SilentlyContinue) {
    $result.Git.Installed = $true
    $result.Git.Version = (git --version)
    $result.Git.Path = (Get-Command git).Source
}
if (Get-Command bash -ErrorAction SilentlyContinue) {
    $result.Bash.Installed = $true
    $result.Bash.Version = (bash --version | Select-Object -First 1)
}

# 3. Cek Developer Mode (Symlink tanpa Admin)
$devKey = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock"
if (Test-Path $devKey) {
    $val = (Get-ItemProperty -Path $devKey -Name "AllowDevelopmentWithoutDevLicense" -ErrorAction SilentlyContinue).AllowDevelopmentWithoutDevLicense
    $result.Symlink.DevMode = ($val -eq 1)
}

# Output JSON murni ke Node.js
$result | ConvertTo-Json -Compress
```

### B. Installer Helper (`Install-PakCLIDep.ps1`)
Ketika user mengklik tombol install:

```powershell
# Install-PakCLIDep.ps1
param (
    [Parameter(Mandatory=$true)]
    [ValidateSet('git', 'ytdlp', 'ffmpeg', 'devmode')]
    [string]$Target
)

switch ($Target) {
    "git" {
        if (Get-Command winget -ErrorAction SilentlyContinue) {
            winget install --id Git.Git -e --source winget --accept-source-agreements --accept-package-agreements
        } else {
            # Fallback direct download portable Git
            Write-Host "Winget not found, downloading Git Standalone Installer..."
            Invoke-WebRequest -Uri "https://github.com/git-for-windows/git/releases/download/v2.46.0.windows.1/Git-2.46.0-64-bit.exe" -OutFile "$env:TEMP\GitInstaller.exe"
            Start-Process -FilePath "$env:TEMP\GitInstaller.exe" -ArgumentList "/VERYSILENT /NORESTART" -Wait
        }
    }
    "ytdlp" {
        winget install yt-dlp.yt-dlp -e --accept-source-agreements
    }
    "ffmpeg" {
        winget install Gyan.FFmpeg -e --accept-source-agreements
    }
    "devmode" {
        # Membutuhkan elevasi Administrator untuk menulis registry Developer Mode
        Start-Process powershell -Verb RunAs -ArgumentList "-NoProfile -Command Set-ItemProperty -Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock' -Name 'AllowDevelopmentWithoutDevLicense' -Value 1" -Wait
    }
}
```

---

## 5. Ringkasan Hubungan Antar-Dokumen

| Dokumen | Peran & Topik |
| :--- | :--- |
| [v01_without-git-snapshot.md](file:///d:/0pro/pakcli-plugin/local/brief/v01_without-git-snapshot.md) | Baseline & Problem Definition (mengapa commit linear bermasalah). |
| [v02_with-git-snapshot.md](file:///d:/0pro/pakcli-plugin/local/brief/v02_with-git-snapshot.md) | Konsep internal Git Snapshot (`refs/snapshots/*`, isolasi remote). |
| [v03_multiple-repo-git-manager.md](file:///d:/0pro/pakcli-plugin/local/brief/v03_multiple-repo-git-manager.md) | Antarmuka Multi-Repo Git Manager, 3 View Modes, AI Diff Exporter, Ribbon Icon. |
| [v04_install-dependencies-flows.md](file:///d:/0pro/pakcli-plugin/local/brief/v04_install-dependencies-flows.md) | **Arsitektur Diagnosa & Installer PowerShell**: Gatekeeper Flow (PowerShell Tier 0), Non-blocking safety, Diagnosa JSON terpusat, dan 1-Click Installer (Git, YTD, Symlink). |
