---
id: instagram-image-posts-support
title: Instagram Photo & Image-Only Posts Support
plugin: local
status: 1
tags:
  - pakcli
  - local
  - instagram
  - image-posts
  - embed
  - iframe
  - markdown
created: 2026-10-15
---

# 📌 Master Brief: Instagram Photo & Image-Only Posts Support (`pakcli-local`)

> **Feature Status**: `1` (Implemented & Verified)  
> **Target Module**: `local/src/features/ytd`  
> **Platform**: Cross-platform (Desktop & Mobile)  
> **Date**: 2026-10-15  

---

## 1. Objective & Problem Statement
- **Problem**:
  - Ketika pengguna memasukkan URL postingan Instagram berupa foto/gambar tunggal atau carousel foto (contoh: `https://www.instagram.com/p/DeglkiPl1Qf/`), `yt-dlp` gagal dengan pesan:
    `ERROR: [Instagram] DeglkiPl1Qf: There is no video in this post`
  - Hal ini menyebabkan `fetchVideoInfo` crash dan menampilkan toast `Fetch failed`, sehingga pengguna tidak dapat melihat preview, tidak dapat menyalin iframe embed, dan tidak dapat mengunduh media atau menghasilkan catatan Markdown sama sekali.

- **Solution**:
  1. **Graceful Fallback & Image Post Detection**:
     - Deteksi error `There is no video in this post` dari yt-dlp pada postingan Instagram (`/p/`, `/reel/`, `/tv/`).
     - Alih-alih gagal, ubah menjadi mode **Instagram Image Post**:
       - Ekstrak `shortcode` (contoh: `DeglkiPl1Qf`).
       - Sediakan direct high-resolution image URL via endpoint publik Instagram `https://www.instagram.com/p/${shortcode}/media/?size=l` yang menghasilkan file JPEG 1080p tanpa perlu token API.
       - Tetapkan `media_type: "image"` dan durasi `0`.
  2. **Preview & UI Adaptasi Khusus Foto/Image**:
     - Di `DownloadHero` dan `CaptureModal`, tampilkan badge `📸 Instagram (Photo)`.
     - Tampilkan thumbnail preview foto resolusi tinggi.
     - Sediakan tombol cepat `📋 Copy iframe` dan `🔗 Copy Embed URL` untuk menyalin kode embed resmi Instagram iframe.
     - Di `DownloadForm`, sesuaikan label format menjadi `jpg` (Image Post) dan nonaktifkan opsi video-only (FPS, resolution) secara rapi.
  3. **Penyimpanan Gambar & Pembuatan Catatan Markdown**:
     - Unduh file gambar `.jpg` beresolusi tinggi langsung ke vault.
     - Buat catatan Markdown dengan:
       - Frontmatter metadata lengkap: `platform: instagram`, `media_type: image`, `embed_url`, `embed_iframe`.
       - Embed gambar lokal: `![[ig_..._image.jpg]]`.
       - Web Player & iframe embed Instagram resmi yang interaktif.

---

## 2. Technical Architecture & Constraints
- **Platform Agnostic**:
  - Menggunakan Obsidian `requestUrl` atau Node `https` untuk mengikuti redirect 302 Instagram media endpoint.
- **Zero Layout Drift & Non-Destructive**:
  - Alur video YouTube dan Instagram Reels yang sudah ada tetap berjalan 100% seperti semula.
  - Hanya mengaktifkan fallback ketika yt-dlp melaporkan postingan tidak memiliki video.
- **Bundle & Performance Safety**:
  - Menggunakan API bawaan tanpa dependensi npm tambahan (bundle tetap < 5.0 MB).

---

## 3. Implementation Plan & Target Files
| File | Status | Description |
| :--- | :---: | :--- |
| `docs/brief-instagram-image-posts-support.md` | ✅ | Master brief (Status 0 -> 1) |
| `src/features/ytd/types.ts` | ✅ | Tambahkan `media_type?: "video" | "image"` pada `VideoPreview` dan `YtDlpInfo` |
| `src/features/ytd/utils/ytdlp.ts` | ✅ | Handle error `There is no video in this post`, generate metadata foto & downloader gambar |
| `src/features/ytd/utils/fileHelpers.ts` | ✅ | Format penamaan file jpg & catatan Markdown untuk media bertipe image |
| `src/features/ytd/ui/components/DownloadHero.ts` | ✅ | Indikator badge `📸 Instagram (Photo)` |
| `src/features/ytd/ui/components/DownloadForm.ts` | ✅ | Adaptasi UI form untuk postingan gambar/foto (`jpg (Image Post)`) |
| `src/features/ytd/ui/YTDownloaderView.ts` | ✅ | Alur unduh gambar & create note khusus image post |
| `src/features/ytd/ui/CaptureModal.ts` | ✅ | Dukungan image post di modal capture |

---

## 4. Acceptance Criteria Checklist
- [x] Status 0 brief dibuat dan di-commit ke branch aktif
- [x] Postingan foto/gambar Instagram (seperti `https://www.instagram.com/p/DeglkiPl1Qf/`) berhasil di-fetch tanpa error `There is no video in this post`
- [x] Preview card menampilkan thumbnail gambar resolusi tinggi dan badge `📸 Instagram (Photo)`
- [x] Tombol `📋 Copy iframe` dan `🔗 Copy Embed URL` berfungsi normal untuk postingan foto
- [x] Tombol `Fetch & Download` berhasil mengunduh file gambar `.jpg` ke vault dan membuat catatan Markdown dengan iframe embed
- [x] Build produksi (`npm run build`) sukses 0 error dan ukuran bundle < 5.0 MB (525 KB)
- [x] Status 1 brief diperbarui dan di-commit
