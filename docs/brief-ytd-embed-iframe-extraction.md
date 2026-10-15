---
id: ytd-embed-iframe-extraction
title: YTD YouTube & Instagram Embed & iframe Extraction
plugin: local
status: 1
tags:
  - pakcli
  - local
  - ytdlp
  - youtube
  - instagram
  - embed
  - iframe
  - markdown
created: 2026-10-15
---

# 📌 Master Brief: YouTube & Instagram Embed and iframe Extraction (`pakcli-local`)

> **Feature Status**: `1` (Implemented & Verified)  
> **Target Module**: `local/src/features/ytd`  
> **Platform**: Cross-platform (Desktop & Mobile)  
> **Date**: 2026-10-15  

---

## 1. Objective & Problem Statement
- **Problem**:
  - Saat ini, ekstraksi media YouTube dan Instagram melalui `CaptureModal` dan `YTDownloaderView` di `pakcli-local` hanya memasukkan tautan file lokal internal vault (`![[clip.mp4]]` dan `![[thumb.jpg]]`) ke dalam catatan Markdown (`notes.md`).
  - Catatan tersebut tidak memiliki embed interaktif langsung dari platform web (YouTube / Instagram), sehingga:
    1. Jika file `.mp4` belum diunduh (misalnya mode metadata/transcript-only atau di platform mobile), catatan tidak memiliki player media yang bisa diputar langsung.
    2. Tidak ada iframe web resmi yang memungkinkan pengguna memutar video asli dengan kontrol resmi, navigasi timestamp, atau melihat interaksi Instagram Reel secara langsung di dalam Obsidian.
    3. Pengguna tidak memiliki cara cepat untuk menyalin kode embed/iframe dari UI modal atau riwayat capture.

- **Solution**:
  1. **Ekstraksi Embed & iframe Otomatis ke Catatan Markdown**:
     - **YouTube**:
       - Native Obsidian embed: `![](https://www.youtube.com/watch?v=${videoId})`
       - Responsive iframe player (dengan timestamp start clip jika diclip):
         ```html
         <iframe width="100%" height="420" src="https://www.youtube-nocookie.com/embed/${videoId}?start=${startSeconds}" title="${title}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>
         ```
     - **Instagram**:
       - Responsive Instagram embed iframe (mendukung `/reel/`, `/p/`, `/reels/`):
         ```html
         <iframe width="100%" height="520" src="https://www.instagram.com/reel/${postId}/embed/" frameborder="0" scrolling="no" allowtransparency="true"></iframe>
         ```
  2. **Struktur Catatan Markdown yang Rapi & Terorganisir**:
     - Bagian **Media & Embeds**:
       - Menampilkan Local Video Player (`![[clip.mp4]]`) & Thumbnail (`![[thumb.jpg]]`).
       - Menampilkan Web Embed Section yang dapat di-collapse (`> [!info] Web Player (YouTube / Instagram)`) dengan iframe interaktif.
  3. **Tombol Cepat "Copy Embed" & "Copy iframe" di UI**:
     - Tambahkan tombol di `CaptureModal` dan `YTDownloaderView` untuk langsung meng-copy kode iframe / embed link ke clipboard sekali klik.
  4. **Settings & Preset Config**:
     - Opsi konfigurasi di pengaturan YTD (`includeWebEmbeds: boolean`, default: `true`).

---

## 2. Technical Architecture & Constraints
- **Platform Agnostic**:
  - iframe YouTube menggunakan domain privacy-enhanced (`youtube-nocookie.com`) agar performa kencang dan minim tracking.
  - iframe Instagram menggunakan endpoint resmi `/embed/` yang aman dan diizinkan di webview Electron Obsidian.
- **Zero Layout Drift**:
  - Jika file video lokal (`.mp4`) ada, player lokal tetap menjadi media utama; web embed melengkapinya sebagai live web fallback/companion.
- **Frontmatter Metadata Enhancement**:
  - Menambahkan key `embed_url` dan `embed_iframe` ke YAML frontmatter agar Dataview, SQLSeal, dan Tablite table dapat merender kolom preview interaktif.

---

## 3. Implementation Plan & Target Files
| File | Status | Description |
| :--- | :---: | :--- |
| `docs/brief-ytd-embed-iframe-extraction.md` | ✅ | Master brief (Status 0 -> 1) |
| `src/features/ytd/types.ts` | ✅ | Setting types for embed toggle, default width ("100%"), height ("520") |
| `src/features/ytd/utils/fileHelpers.ts` | ✅ | Generate YouTube & Instagram iframe/embed markdown di `buildNotesMarkdown` and `buildWebEmbed` |
| `src/features/ytd/ui/CaptureModal.ts` | ✅ | Integrasi tombol Copy Embed, Copy iframe & passing parameter embed |
| `src/features/ytd/ui/components/DownloadHero.ts` | ✅ | Tombol Copy iframe & Copy Embed URL di preview card |
| `src/features/ytd/ui/YTDownloaderView.ts` | ✅ | Integrasi pembuatan note dengan web embed & iframe serta embed dimensions |
| `src/features/ytd/settings.ts` | ✅ | Pengaturan toggle embed / iframe extraction serta editable width & height |
| `src/styles/ytcapture.css` | ✅ | Styling untuk small action buttons dan button rows |

---

## 4. Acceptance Criteria Checklist
- [x] Status 0 brief dibuat dan di-commit ke branch aktif
- [x] Catatan hasil capture YouTube menyertakan iframe YouTube interaktif (lengkap dengan timestamp start clip)
- [x] Catatan hasil capture Instagram menyertakan iframe Instagram reel/post resmi
- [x] Default iframe width adalah `100%` dan height `520`, dapat diedit di menu plugin settings
- [x] YAML Frontmatter menyertakan metadata `platform`, `embed_url`, dan `embed_iframe`
- [x] Terdapat tombol salin kode iframe/embed di UI CaptureModal dan YTDownloaderView
- [x] Ekstraksi berfungsi mulus di desktop & mobile tanpa merusak file download mp4/jpg lokal
- [x] Production build (`npm run build`) sukses tanpa error dan lolos verifikasi (bundle 520 KB < 5.0 MB)
- [x] Status 1 brief diperbarui dan di-commit
