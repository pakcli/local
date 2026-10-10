---
id: local-dependency-binary-manager
title: Local Dependency & Binary Manager
plugin: local
status: 0
tags:
  - pakcli
  - local
  - binaries
  - dependencies
  - feature
created: 2026-10-09
---

# Local Dependency & Binary Manager

## 1. Overview
Manajer ketergantungan binary eksternal mandiri yang memeriksa ketersediaan executable penting (`ffmpeg.exe`, `yt-dlp.exe`, `tesseract.exe`) di sistem lokal, memverifikasi versi, dan mengunduh rilis binary portabel secara otomatis jika belum tersedia.

## 2. Key Capabilities (Planned)
- **Automatic Health Check**: Memindai ketersediaan executable di `PATH` sistem dan direktori data lokal plugin.
- **One-Click Binary Downloader**: Mengunduh binary resmi versi rilis langsung ke subdirektori terisolasi tanpa memerlukan hak akses administrator.
- **Version Compatibility Verifier**: Memastikan kompatibilitas argumen CLI ffmpeg dan yt-dlp sebelum dipanggil oleh modul eksekutif.

## 3. Integration Points
- Terhubung dengan modul `ytd` dan rencana engine OCR lokal.

## 4. Status: 0 (Planned / In Progress)
Spesifikasi detektor dan script verifikasi telah dibuat; modul auto-installer portabel sedang dalam pengembangan.
