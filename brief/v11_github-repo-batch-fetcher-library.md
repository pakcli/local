# Brief Arsitektur & Spesifikasi Teknis: `v11_github_repo_batch_fetcher_library`
## Fitur: GitHub Repository Batch Fetcher & Offline App/Plugin Library

---

## 1. Latar Belakang & Motivasi

Pengguna Obsidian sering kali menemukan repository GitHub menarik (tools CLI, plugin Obsidian, library kode, utility app), namun tautan tersebut sering tercecer di browser bookmarks atau catatan acak tanpa dokumentasi offline yang terstruktur.

Melalui modul `v11_github_repo_batch_fetcher_library` di `pakcli-local`:
1. Pengguna dapat memasukkan 1 URL atau puluhan URL repository GitHub sekaligus.
2. Sistem memanfaatkan **GitHub CLI (`gh`)** lokal (atau fallback ke REST API) untuk mengekstrak metadata penting:
   - Nama repo & tautan utama.
   - Demo / preview URL (homepage).
   - Platform & OS Compatibility (Windows XP/10/11, macOS, Linux, Android) yang dideteksi secara cerdas dari ekstensi file rilis binary (`.exe`, `.msi`, `.dmg`, `.pkg`, `.deb`, `.apk`, dll.).
   - Bahasa pemrograman & bahasa dokumentasi.
   - Daftar file rilis terbaru (`latest_release`) beserta ukuran file byte/KB/MB.
   - Tipe Lisensi (MIT, GPL, Apache, dll.).
   - Timestamp fetch (`fetch_date` dan `fetch_time`).
   - Salinan utuh `README.md` repositori.
3. Catatan otomatis disimpan ke direktori vault yang dapat dikonfigurasi (default: `Digital Library/Github Repository/[nama-repo].md`).
4. Non-Destructive Update: Jika di-fetch ulang saat ada rilis baru, bagian `overview` catatan manual pengguna tetap dipertahankan.

---

## 2. Arsitektur Komponen

```
[UI: Ribbon / Command Palette]
            │
            ▼
[Modal: GitHubRepoBatchFetcherModal]
   (Single / Multi-Line Textarea Input)
            │
            ▼
[Manager: GitHubFetcherManager]
   ├── [Runner: GitHubCliRunner] ─── (Cek & panggil `gh` CLI lokal)
   ├── [Fallback: GitHubApiFetcher] ─ (Fallback HTTPS fetch jika `gh` belum terpasang)
   ├── [Parser: GitHubRepoParser] ── (Deteksi kompatibilitas OS, ukuran rilis, lisensi)
   └── [Writer: VaultLibraryWriter] ─ (Tulis markdown + frontmatter ke vault target)
```

---

## 3. Spesifikasi Skema Frontmatter & Format Catatan

Target file: `{vaultRoot}/{settings.githubLibraryFolder}/[repo-name].md`

```yaml
---
name: "obsidian-findoc"
repo_url: "https://github.com/studiowebux/obsidian-findoc"
demo_url: "https://studiowebux.github.io/obsidian-findoc/"
overview: ""
compatibility:
  - windows: ["windows 10", "windows 11"]
  - macos: ["macos 14", "macos 15"]
  - linux: ["ubuntu", "debian"]
language:
  - english
  - typescript
latest_release:
  version: "v1.2.0"
  published_at: "2026-02-08"
  assets:
    - file: "main.js"
      size: "450.2 KB"
    - file: "manifest.json"
      size: "1.2 KB"
    - file: "styles.css"
      size: "24.5 KB"
license: "MIT"
fetch_date: "2026-10-10"
fetch_time: "10:24:46"
---

# README

[Salinan utuh Markdown README repositori]
```

---

## 4. Alur Kerja Deteksi Kompatibilitas OS & Format
1. **Analisis Ekstensi Aset Rilis**:
   - `.exe`, `.msi` ➔ Windows (default: Windows 10, Windows 11).
   - `.dmg`, `.pkg` ➔ macOS.
   - `.deb`, `.rpm`, `.AppImage`, `.tar.gz` ➔ Linux.
   - `.apk` ➔ Android.
   - `.ipa` ➔ iOS.
2. **Ukuran File Human-Readable**:
   - Konversi byte mentah menjadi format rapi (`B`, `KB`, `MB`, `GB`).
3. **Penyimpanan Folder Fleksibel**:
   - Jika folder belum ada, sistem otomatis membuat parent folders secara rekursif (`vault.createFolder`).

---

## 5. Rencana Pengujian & Validasi
- Jalankan pengetesan dengan repositori nyata: `https://github.com/studiowebux/obsidian-findoc`.
- Verifikasi hasil pembuatan file di `Digital Library/Github Repository/obsidian-findoc.md`.
- Kompilasi plugin `pakcli-local` dengan `pnpm build` atau `npm run build`.
