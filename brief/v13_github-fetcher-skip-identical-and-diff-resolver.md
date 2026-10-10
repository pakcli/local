# Master Brief v13: GitHub Fetcher Skip Identical & Interactive Frontmatter Diff Conflict Resolver

- **Plugin**: `pakcli-local` (`local/`)
- **Modul**: `src/features/githubFetcher/`
- **Fitur ID**: `github-repo-fetcher-diff-resolver`
- **Status Dokumen**: `0` (Sedang dibuat / In progress)
- **Kompatibilitas**: Desktop-only (Obsidian Bridge)

---

## 1. Problem Statement
Saat pengguna melakukan batch fetch repositori GitHub:
1. Banyak repositori yang mungkin sudah pernah di-fetch sebelumnya dan **datanya identik (sama persis)** baik rilis, lisensi, maupun README-nya. Melakukan penulisan ulang ke disk memboroskan I/O dan memicu listener modifikasi file Obsidian yang tidak perlu.
2. Jika file catatan repositori sudah ada di vault (`[repo].md`) namun memiliki perbedaan data (misal pengguna telah mengedit frontmatter manual, versi rilis bertambah, kompatibilitas berubah, dll.), menimpa secara sepihak dapat merusak custom metadata milik pengguna.
3. Pengguna membutuhkan dialog resolusi konflik interaktif (Diff Resolver) dengan fitur:
   - Tombol seleksi per-properti frontmatter: `Use Old` (Vault) vs `Use New` (Fetched GitHub).
   - Tombol global footer: `Use All Old` vs `Use All New`.
   - Tombol `Cancel` untuk membatalkan proses pada repositori tersebut atau menghentikan batch.

---

## 2. Alur Mekanisme (Workflow Logic)

### Step 1: Pre-Fetch & Content Comparison
1. Sistem mengekstrak metadata dan markdown terbaru dari GitHub.
2. Memeriksa keberadaan file target di vault (`{libraryFolder}/{repo}.md`).
3. **Kondisi A: File Belum Ada** -> Langsung tulis file baru (`status: created`).
4. **Kondisi B: File Sudah Ada**:
   - Parse frontmatter yang ada di vault (`oldFrontmatter`) vs frontmatter baru hasil fetch (`newFrontmatter`).
   - Normalisasikan dan bandingkan frontmatter + isi README.
   - **Jika Identik (100% Same Data)**:
     - Langsung dilewati / skip (`status: skipped`, notifikasi `"Identical data, skipped"`).
   - **Jika Berbeda (Different Frontmatter / Data)**:
     - Tahan proses penulisan file, lalu buka **Frontmatter Diff Conflict Modal**.

### Step 2: Interactive Frontmatter Diff Modal
1. **Per-Field Diff Row**:
   Menampilkan daftar properti yang berbeda (misal `latest_release`, `compatibility`, `overview`, `license`, `demo_url`):
   - Kolom Kiri: **Vault Current (Old)** dengan tombol toggle `Use Old`.
   - Kolom Kanan: **GitHub Incoming (New)** dengan tombol toggle `Use New`.
   - Nilai default dapat disetel ke `Use New` (atau mempertahankan custom `overview`).
2. **Footer Actions**:
   - `[Use All Old]`: Memilih semua properti versi vault yang lama.
   - `[Use All New]`: Memilih semua properti versi hasil fetch baru.
   - `[Apply & Save]`: Menuliskan hasil gabungan (merged frontmatter) ke file note vault.
   - `[Cancel]`: Membatalkan pembaruan untuk repositori ini tanpa mengubah catatan vault.

### Step 3: Batch Queue Integration
- Jika dalam mode batch terdapat beberapa file konflik, modal dapat menyajikan konflik satu per satu (atau opsi "Apply choice to remaining conflicts" jika pengguna ingin serentak).
- Tombol `Cancel Batch` tersedia di modal batch fetching utama untuk membatalkan antrean sewaktu-waktu.

---

## 3. Komponen & File yang Terlibat
1. `local/src/features/githubFetcher/services/GitHubRepoParser.ts`:
   - `parseExistingFrontmatter(content)`: Mengekstrak raw frontmatter object dan markdown body.
   - `compareMetadata(oldMeta, newMeta)`: Mendeteksi apakah seluruh data identik atau terdapat perbedaan spesifik per field.
   - `mergeFrontmatter(oldMeta, newMeta, selections)`: Menggabungkan properti berdasarkan pilihan pengguna.
2. `local/src/features/githubFetcher/ui/GitHubDiffModal.ts`:
   - Modal popup diff interaktif dengan pilihan `Use Old` / `Use New` per baris.
   - Footer dengan `Use All Old`, `Use All New`, `Apply & Save`, dan `Cancel`.
3. `local/src/features/githubFetcher/GitHubFetcherManager.ts`:
   - Integrasi handler skip identical & pemanggilan diff resolver.
4. `local/src/features/githubFetcher/ui/GitHubBatchFetcherModal.ts`:
   - Penambahan tombol `Cancel Batch` yang responsif saat proses fetching berlangsung.
