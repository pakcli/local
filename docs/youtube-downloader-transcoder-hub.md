---
id: youtube-downloader-transcoder-hub
title: YouTube Downloader & Transcoder Hub
plugin: local
status: 1
tags:
  - pakcli
  - local
  - ytdlp
  - media
  - feature
created: 2026-10-09
---

# YouTube Downloader & Transcoder Hub

## 1. Overview
Pusat pengunduhan dan transcoding media lokal terintegrasi yang memanfaatkan `yt-dlp` dan `ffmpeg` untuk mengunduh video, audio, dan metadata YouTube langsung ke direktori aset vault.

## 2. Key Capabilities
- **One-Click Video / Audio Extraction**: Mengunduh konten YouTube sebagai MP4 atau audio MP3 beresolusi tinggi langsung dari modal input link.
- **Automatic Note Scaffolding**: Membuat catatan markdown pendamping berisi judul video, durasi, channel, deskripsi, thumbnail, dan wikitext audio embed.
- **Local Transcoder Pipeline**: Konversi format audio otomatis melalui binary ffmpeg lokal.

## 3. Integration Points
- Terintegrasi di modul `src/features/ytd/` dan file styling `ytcapture.css`.

## 4. Status: 1 (Implemented)
Fitur sudah diimplementasikan penuh dan aktif di `pakcli-local`.
