---
id: filename-scheme-slide-suffix-and-image-scaling
title: Slide Suffix Filename Scheme and Image Quality Scaling
plugin: local
status: 0
tags:
  - pakcli
  - local
  - naming-convention
  - slide-suffix
  - image-scaling
  - ffmpeg
  - instagram
  - youtube
created: 2026-10-16
---

# 📌 Master Brief: Slide Suffix Filename Scheme and Image Quality Scaling (`pakcli-local`)

> **Feature Status**: `0` (Draft / Pending Implementation)  
> **Target Module**: `local/src/features/ytd`  
> **Platform**: Cross-platform (Desktop & Mobile)  
> **Date**: 2026-10-16  

---

## 1. Objective & Problem Statement
- **Problem**:
  1. **Penamaan File Kurang Terstruktur untuk Batches/Slides**:
     - Format penamaan sebelumnya (`ig_title_1080p_auto_YYYY-MM-DD_HH-mm-ss`) tidak menyertakan identitas channel/kreator di depan, tidak membatasi judul ke 15 karakter secara konsisten, dan tidak memiliki penanda slide (`s01`, `s02`, dst.) untuk postingan multi-slide/carousel atau `s00` untuk catatan deskripsi master.
     - Akibatnya file note `.md` tidak otomatis tersortir di urutan paling atas (`s00`), dan slide tidak terorganisir dengan rapi.
  2. **Image Quality Scaling (144p – 4K) Belum Terintegrasi**:
     - Pengguna ingin dapat memilih kualitas gambar mulai dari 144p hingga 4K (`144p`, `240p`, `360p`, `480p`, `720p`, `1080p`, `1440p`, `4k`) dengan tetap mempertahankan rasio aspek asli (original ratio) dan format asli (`.jpg`), tanpa terpotong atau gepeng.
  3. **Thumbnail Preview Rusak di UI**:
     - Instagram memblokir direct hotlinking thumbnail dari origin Electron `app://`, menyebabkan ikon broken image pada preview card.

- **Solution**:
  1. **New Standardized Filename Scheme**:
     - Pola nama file:
       `{channel}_{title15}_{YYYY-MM-DD}_{HH-mm-ss}_s{XX}_{format}_{quality}.{ext}`
     - Penanda slide `s{XX}`:
       - `s00` : Master Markdown note (`.md`) yang berisi deskripsi, metadata, dan web embed iframe (selalu tersortir paling atas).
       - `s01`, `s02`, `s03`, dst. : File media gambar/video hasil capture/download.
     - Batasan panjang judul: Maksimal 15 karakter pertama yang telah dibersihkan (`title15`).
     - Komponen format & quality: contoh `_jpg_1080p`, `_mp4_1080p`, `_mp3_audio`, `_jpg_4k`.
  2. **Image Quality Picker & FFmpeg Lanczos Scaling**:
     - Membuka pill kualitas (144p hingga 4K) untuk image post.
     - Jika pengguna memilih resolusi tertentu (misal `4K` = 2160p, `720p`, `360p`, dll.):
       Gunakan FFmpeg Lanczos scaling:
       `ffmpeg -i input.jpg -vf "scale=-2:${targetHeight}:flags=lanczos" -q:v 2 output.jpg`
     - Mengunci rasio aspek asli dengan flag `-2` (tidak gepeng) dan mempertahankan format `.jpg`.
  3. **Thumbnail Hotlink Fix**:
     - Tambahkan `referrerpolicy="no-referrer"` pada elemen `<img>` thumbnail preview di `DownloadHero.ts` dan `CaptureModal.ts`.
     - Gunakan base64 Data URI atau buffer fallback agar gambar 100% muncul mulus.

---

## 2. Technical Architecture & Constraints
- **Preserve Aspect Ratio**:
  - Rumus FFmpeg `scale=-2:H` atau `scale=W:-2` memastikan kelipatan 2 untuk kompatibilitas encoder dan mempertahankan rasio asli tanpa distorsi.
- **Zero Config & Backward Compatibility**:
  - Format penamaan baru diterapkan secara otomatis di seluruh pipeline unduhan (`YTDownloaderView` dan `CaptureModal`).
  - Catatan deskripsi `s00` mereferensikan file media `s01` (`![[..._s01_...]]`).

---

## 3. Implementation Plan & Target Files
| File | Status | Description |
| :--- | :---: | :--- |
| `docs/brief-filename-scheme-slide-suffix-and-image-scaling.md` | ⏳ | Master brief (Status 0 -> 1) |
| `src/features/ytd/utils/fileHelpers.ts` | ⏳ | Update `buildMediaBaseName` untuk skema `{channel}_{title15}_{date}_{time}_s{XX}_{format}_{quality}` |
| `src/features/ytd/utils/ytdlp.ts` | ⏳ | Fungsi scaling gambar via FFmpeg (`scaleImageViaFFmpeg`) & download image |
| `src/features/ytd/ui/components/DownloadHero.ts` | ⏳ | Perbaikan `referrerpolicy="no-referrer"` pada tag img thumbnail |
| `src/features/ytd/ui/components/DownloadForm.ts` | ⏳ | Pastikan pill quality 144p - 4K aktif untuk mode gambar |
| `src/features/ytd/ui/YTDownloaderView.ts` | ⏳ | Integrasi filename scheme baru, slide numbering `s00`/`s01`, dan image scaling |
| `src/features/ytd/ui/CaptureModal.ts` | ⏳ | Integrasi filename scheme baru dan image scaling di modal capture |

---

## 4. Acceptance Criteria Checklist
- [ ] Status 0 brief dibuat dan di-commit ke branch aktif
- [ ] Format penamaan file mengikuti `{channel}_{title15}_{date}_{time}_s{XX}_{format}_{quality}.{ext}`
- [ ] File note deskripsi menggunakan `s00` sehingga tersortir di paling atas folder
- [ ] File media menggunakan `s01`, `s02`, dst.
- [ ] Pengguna dapat memilih kualitas 144p hingga 4K untuk gambar
- [ ] Gambar di-scale dengan FFmpeg mempertahankan rasio aspek asli dan format `.jpg`
- [ ] Thumbnail preview tidak rusak (bebas blokir referrer)
- [ ] Build produksi (`npm run build`) sukses 0 error dan ukuran bundle < 5.0 MB
- [ ] Status 1 brief diperbarui dan di-commit
