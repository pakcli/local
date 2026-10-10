# Master Brief v12: YTD Batch URL & Playlist Extraction Downloader Engine

- **Plugin**: `pakcli-local` (`local/`)
- **Fitur ID**: `ytd-batch-url-playlist-downloader`
- **Docs Ref**: `local/docs/ytd-batch-url-playlist-downloader.md`
- **Status Dokumen**: `0` (Sedang/Mau dibuat)
- **Kompatibilitas**: Desktop-only (Node.js child process + `yt-dlp` + `ffmpeg`)

---

## 1. Latar Belakang & Problem Statement
Saat ini antarmuka utama YTD Downloader di PakCLI Local (`YTDownloaderView` & `DownloadHero`) hanya menerima satu single link per sesi pengunduhan. Ketika pengguna ingin:
1. Mengunduh sekumpulan tautan video YouTube / Instagram sekaligus (batch URL).
2. Memasukkan satu tautan **YouTube Playlist** (`youtube.com/playlist?list=...` atau URL video dengan parameter `&list=...`) dan ingin mengekstrak seluruh video di dalam playlist tersebut menjadi antrean unduhan.

Pengguna terpaksa harus melakukan paste dan klik download berulang kali. Selain itu, pengguna membutuhkan fleksibilitas konfirmasi konfigurasi:
- **Opsi A (Universal/Same Config)**: Menerapkan satu konfigurasi global (misal resolusi `1080p`, format `video/audio`, target folder yang sama) ke seluruh item yang di-fetch.
- **Opsi B (Per-Item Custom Config)**: Memeriksa dan mengedit konfigurasi per video (mengubah resolusi, format audio-only, atau membatasi potongan durasi tertentu) sebelum proses download dimulai.

---

## 2. Arsitektur & Spesifikasi Fitur

### 2.1 Deteksi Input Mode (Single, Multi-Line, atau Playlist)
Input di Hero Section atau Modal Batch akan mendukung 2 tipe input:
1. **Multi-line Textarea URL**:
   - Menerima kumpulan URL yang dipisahkan baris baru (`\n`).
   - Otomatis melakukan sanitasi dan validasi format URL (YouTube / Instagram).
2. **Playlist URL Handler**:
   - Jika mendeteksi tautan playlist YouTube (`list=PL...`), sistem menggunakan yt-dlp dengan parameter `--flat-playlist --dump-single-json` atau `--dump-json` untuk mengekstrak seluruh entri video di playlist tanpa mengunduh file biner langsung.
   - Hasil ekstraksi berupa daftar video lengkap dengan ID, title, durasi, uploader, dan thumbnail.

### 2.2 Mode Konfigurasi Unduhan:
Modal / Review Drawer interaktif menyediakan toggle:
1. **"Use Same Config for All" (Default Global)**:
   - Pengguna memilih format utama (e.g. `1080p`, `720p`, atau `Audio MP3`), folder target, dan langsung mengantrekan semua item ke `taskManager`.
2. **"Review & Customize Per Item"**:
   - Tabel pratinjau daftar item batch/playlist dengan kolom:
     - Checkbox aktif/non-aktifkan item tertentu.
     - Thumbnail & Video Title.
     - Dropdown Quality per-item (`4K`, `1080p`, `720p`, `Audio`).
     - Custom Destination Folder (opsional).
   - Tombol **"Queue All Selected (N)"** untuk mengeksekusi antrean.

### 2.3 Antrean Eksekusi Teratur (Queue Concurrency Engine)
- Menghindari pemblokiran CPU / network freeze akibat menjalankan 20 proses yt-dlp secara simultan.
- Menggunakan queue worker dengan batas konkurensi (default: 2 unduhan aktif bersamaan, sisanya berstatus `queued`).
- Setiap item yang selesai otomatis membuat file media biner, catatan markdown vault pendamping, dan transcript/subtitles sesuai pipeline standar YTD.

---

## 3. Rencana Komponen & File Perubahan

1. **Service / Engine**:
   - `local/src/features/ytd/utils/playlistParser.ts`:
     - Fungsi `fetchPlaylistItems(playlistUrl, settings)` memanfaatkan yt-dlp `--flat-playlist -J` untuk ekstraksi daftar video super cepat tanpa lag.
     - Parser multi-line URL `parseBatchUrls(rawText)`.
2. **UI Component**:
   - `local/src/features/ytd/ui/components/BatchUrlModal.ts`:
     - Modal terdedikasi untuk input multi-line URL atau link Playlist.
     - Pilihan mode: *Same Config for All* vs *Customize Each*.
     - Daftar preview item dengan batch actions (Select All / Deselect All / Change All Quality).
   - `local/src/features/ytd/ui/components/DownloadHero.ts`:
     - Menambahkan tombol / tab switch "⚡ Batch / Playlist" di samping URL input untuk membuka batch dialog.
   - `local/src/features/ytd/ui/YTDownloaderView.ts`:
     - Pendaftaran event & handling batch pipeline ke `taskManager`.
3. **Dokumentasi & Status**:
   - `local/docs/ytd-batch-url-playlist-downloader.md`: Dokumen fitur dengan `status: 0`.
