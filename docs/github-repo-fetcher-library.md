---
id: github-repo-fetcher-library
title: GitHub Repository Batch Fetcher & Asset Inspector
plugin: local
status: 1
tags:
  - pakcli
  - local
  - github
  - library
  - gh-cli
  - feature
created: 2026-10-10
---

# GitHub Repository Batch Fetcher & Asset Inspector

## 1. Overview
Layanan pengumpul arsip repositori GitHub otomatis berbasis desktop bridge yang memanfaatkan integrasi GitHub CLI (`gh`) lokal atau REST/GraphQL API untuk memindai URL repositori, mengekstrak metadata rilis biner, mendeteksi kompatibilitas OS, mengkloning isi README lengkap, dan menyimpannya sebagai catatan markdown terstruktur di direktori vault target (default: `Digital Library/Github Repository/`).

## 2. Kenapa Fitur Ini di `pakcli-local`?
1. **Menggunakan Local GitHub CLI (`gh`)**: `pakcli-local` adalah modul spesialis desktop bridge (bersama `yt-dlp` dan `ffmpeg`). Menggunakan binary `gh` yang terotentikasi di OS lokal memungkinkan batch fetching puluhan repositori tanpa terkena batasan ketat IP rate-limit anonymous browser.
2. **Asset Inspection & Local Archiving**: Memetakan file rilis biner (installer `.exe`, `.dmg`, `.deb`, `.apk`, `.zip`, dll.) beserta ukurannya untuk inventarisasi software dan plugin offline di dalam Obsidian.

## 3. Spesifikasi Frontmatter & Catatan Target

Setiap repo yang di-fetch menghasilkan satu file markdown mandiri di:
`{custom_vault_dir}/[repo-name].md` (Default: `Digital Library/Github Repository/[repo-name].md`)

### Format Schema Metadata:
```yaml
---
name: "[Nama Repositori / File]"
repo_url: "https://github.com/owner/repo"
demo_url: "https://demo-or-preview-url.com"  # Terdeteksi dari homepage/website field repo
overview: ""                                 # Kosong secara default untuk diisi catatan manual pengguna
compatibility:                               # Terdeteksi otomatis dari deskripsi/release tags
  - os: windows
    versions: ["windows 10", "windows 11"]
  - os: linux
  - os: android
language:                                    # Bahasa dokumentasi & primary programming language
  - english
  - typescript
latest_release:                              # Grup informasi rilis terbaru
  tag: "v1.0.0"
  published_at: "2026-10-01"
  assets:
    - file: "app-setup.exe"
      size: "64.2 MB"
    - file: "app-linux.AppImage"
      size: "72.1 MB"
license: "MIT"                               # SPDX Identifier / Nama Lisensi
fetch_date: "2026-10-10"                     # Tanggal fetch (YYYY-MM-DD)
fetch_time: "10:24:46"                       # Waktu fetch (HH:mm:ss)
---

# README

[Salinan utuh seluruh teks README.md dari repository target. Jika tidak ada README, biarkan kosong]
```

## 4. Key Capabilities (Spesifikasi Fitur)
- **Single & Batch Fetching**:
  - Modal input link tunggal (misal: `https://github.com/studiowebux/obsidian-findoc`).
  - Batch input (menempelkan 10-50 URL sekaligus dari clipboard atau memindai daftar URL di dalam note aktif).
- **GitHub CLI Integration (`gh`)**:
  - Mengeksekusi `gh repo view <owner/repo> --json name,url,homepageUrl,description,licenseInfo,languages`
  - Mengeksekusi `gh release view --json tagName,publishedAt,assets`
- **Smart OS & Platform Compatibility Parser**:
  - Menganalisis file extension pada assets (`.exe` -> Windows, `.dmg` / `.pkg` -> macOS, `.apk` -> Android, `.deb` / `.rpm` -> Linux) dan mencatat kompatibilitas versi sistem operasi.
- **Custom Destination Folder**:
  - Opsi pengaturan path folder penyimpanan vault, dengan default `Digital Library/Github Repository/`.
- **Automatic Internal Link Healing & Non-Destructive Update**:
  - Jika file repositori sudah pernah di-fetch sebelumnya, opsi re-fetch hanya memperbarui status release dan README tanpa menghapus catatan catatan manual di bagian `overview`.

## 5. Integration Points
- **CLI Bridge**: Terhubung dengan subsistem eksekusi proses lokal di `local/src/features/`.
- **Panel Matrix**: Dapat diintegrasikan ke tabel `SQLSeal` atau `agGrid` di `pakcli-panel` untuk menyortir repositori berdasarkan ukuran aset, lisensi, atau tanggal rilis.

## 6. Status: -1 (Backlog)
Konsep arsitektur dan skema metadata telah diformalkan; siap diimplementasikan ke dalam kode modul `pakcli-local`.
