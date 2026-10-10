---
id: ytd-batch-url-playlist-downloader
title: YTD Batch URL & Playlist Extraction Downloader Engine
plugin: local
status: 0
tags:
  - pakcli
  - local
  - ytdlp
  - playlist
  - batch
  - feature
created: 2026-10-10
---

# YTD Batch URL & Playlist Extraction Downloader Engine

## 1. Overview
Modul ekstensi dari YouTube & Instagram Downloader (`pakcli-local`) untuk mengunduh daftar video dalam jumlah banyak sekaligus (Batch URL via multi-line input) maupun ekstraksi otomatis seluruh entri video dari sebuah **YouTube Playlist**.

## 2. Fitur Utama
1. **Multi-line Batch URL Input**: Input puluhan URL YouTube / Instagram dalam satu kotak teks.
2. **YouTube Playlist Deep-Extraction**: Otomatis mendeteksi parameter playlist (`list=...`) dan mengekstrak daftar video menggunakan `yt-dlp --flat-playlist` tanpa delay.
3. **Konfigurasi Fleksibel (Same Config vs Per-Item Edit)**:
   - *Same Config*: Terapkan satu setting resolusi (mis. 1080p atau Audio MP3) dan output folder ke seluruh antrean.
   - *Custom Edit*: Preview tabel dengan kebebasan memilih mana video yang diaktifkan/dinonaktifkan dan mengubah resolusi masing-masing video secara individual.
4. **Controlled Concurrency Queue**: Pengunduhan dilakukan secara berurutan dengan slot konkurensi terkontrol agar CPU dan jaringan tetap stabil.

## 3. Status: 0 (In Progress / Mau dibuat)
Brief telah dirancang dan sedang dalam tahap implementasi kode.
