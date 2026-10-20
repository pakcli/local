# 📌 Master Brief: Modular UI Components & Headless Engine Architecture (pakcli-local)

> **Feature Status**: `1` (Completed & Verified)  
> **Target Module**: `local` (`pakcli-local`)  
> **Date**: 2026-10-20  

---

## 1. Executive Summary & Problem Statement

Saat ini dalam codebase `local/src/`, terjadi **Overlapping Duplication** parah di mana setiap folder fitur (`features/ytd`, `features/copypaste`, `features/gitManager`, `features/symlink`, `features/hub`) membangun komponen UI mereka sendiri dari nol:
1. **Tombol Copy Berulang:** Logika SVG clipboard + tooltip + animasi `✓` centang 1000ms ditulis ulang di minimal 4 file berbeda.
2. **Search Bar Berulang:** Input filter pencarian dengan icon kaca pembesar, tombol reset `[x]`, dan event keyboard `/` dibuat berulang kali.
3. **Modal Tersebar (8 Modal):** Setiap modal (`CaptureModal`, `PlaylistSyncModal`, `ScanSyncModal`, `SymlinkModal`, dll) menduplikasi boilerplate header, scrollable body, dan footer tombol konfirmasi/batal.
4. **Tabel Data Berulang:** `TableView` di YTD dan `depsTable` di Hub masing-masing menulis logika DOM tabel dari nol.
5. **`main.ts` Monolith (917 baris):** Berisi timer khusus ScriptSync, context menu logic, command registry, dan wiring yang seharusnya terisolasi.

Tujuan refactoring ini adalah mentransformasi codebase menjadi **Design System Reusable (`uiComponents/`)** dan **Headless Business Logic (`modules/` / `features/`)**.

---

## 2. Target Directory Architecture

```text
local/src/
├── uiComponents/                   ← 🎨 REUSABLE UI SYSTEM (Shared across all features)
│   ├── index.ts                    ← Single entry barrel export
│   ├── actions/
│   │   └── CopyButton.ts           ← Universal hover/click copy action with 1s checkmark
│   ├── inputs/
│   │   └── SearchFilterBar.ts      ← Search bar with clear [x], debounce, and '/' focus
│   ├── modals/
│   │   ├── BaseModal.ts            ← Clean modal shell (Header, Scrollable Body, Footer)
│   │   └── ConfirmModal.ts         ← Reusable Confirm & Type-to-Confirm dialog
│   └── table/
│       └── GenericTable.ts         ← Data-driven table (selection-friendly, sort, TSV export)
│
├── features/                       ← ⚙ DOMAIN FEATURES & HEADLESS ENGINES
│   ├── copypaste/
│   ├── githubFetcher/
│   ├── gitManager/
│   ├── hub/
│   ├── rawOpener/
│   ├── scriptSync/
│   ├── symlink/
│   ├── taskbar/
│   └── ytd/
│
├── utils/                          ← 🛠 OS & Node Helpers (nativeCopy, nodeHelpers)
├── styles/                         ← 🎨 Scoped SCSS stylesheets
├── settings.ts                     ← ⚙ Global Local Settings schema
└── main.ts                         ← 🚪 Lean orchestrator (< 250 lines)
```

---

## 3. Komponen Spesifikasi `uiComponents/`

### 3.1 `CopyButton` (`uiComponents/actions/CopyButton.ts`)
* **Tanggung Jawab:** Merender tombol copy [⧉] interaktif.
* **Perilaku:**
  - Klik menyalin teks target ke OS clipboard via `navigator.clipboard.writeText` atau fallback native.
  - Ikon berganti menjadi tanda centang hijau `✓` selama 1.000 ms, lalu kembali ke ikon awal secara otomatis.
  - Mendukung mode inline, icon-only, atau button with label.
  - Anti-spam: Klik berulang tidak membuat multiple timeout berantakan.

### 3.2 `SearchFilterBar` (`uiComponents/inputs/SearchFilterBar.ts`)
* **Tanggung Jawab:** Input pencarian universal dengan keyboard navigation.
* **Perilaku:**
  - Ikon pencarian di kiri, tombol clear `[×]` otomatis muncul jika ada teks input.
  - Debounce callback (default 150ms) agar tidak membebani rendering.
  - Global listener shortcut `/` otomatis memfokuskan input pencarian.
  - Tombol `Escape` membersihkan pencarian atau menghilangkan fokus.

### 3.3 `BaseModal` (`uiComponents/modals/BaseModal.ts`)
* **Tanggung Jawab:** Wrapper turunan `Modal` dari Obsidian dengan struktur rapi.
* **Struktur Slot:**
  - `headerEl`: Title + badge status + subtitle deskriptif.
  - `bodyEl`: Konten utama dengan scrollbar terisolasi (`overflow-y: auto`).
  - `footerEl`: Aksi utama (tombol Cancel, Save, Apply, atau action kustom).
  - Lifecycle: `onOpen()`, `onClose()`, auto focus input pertama.

### 3.4 `ConfirmModal` (`uiComponents/modals/ConfirmModal.ts`)
* **Tanggung Jawab:** Modal dialog konfirmasi universal.
* **Mode Operasi:**
  1. **Standard Confirmation:** Pesan penjelasan + tombol Cancel + Confirm (dengan warna bahaya/warning opsional).
  2. **Type-to-Confirm:** Tombol konfirmasi terkunci mati (*disabled*) sampai user mengetik kata kunci target (misal nama repo/site) secara persis.

### 3.5 `GenericTable` (`uiComponents/table/GenericTable.ts`)
* **Tanggung Jawab:** Render tabel data terstruktur berbasis skema kolom.
* **Fitur Utama:**
  - **Free Text Selection:** Teks sel tidak di-hijack link atau button inline.
  - **Hover Action Slots:** Mengintegrasikan `CopyButton` otomatis di kolom yang bertipe copyable.
  - **TSV 1-Click Exporter:** Tombol salin baris atau seluruh tabel dalam format TSV standar RFC 4180 untuk Sheets/Excel.
  - **Sorting:** Header kolom yang bisa diklik untuk sorting Ascending/Descending.

---

## 4. Rencana Implementasi & Checklist Kriteria (Acceptance Criteria)

- [x] Status 0 brief dibuat dan terdokumentasi
- [x] Buat direktori `local/src/uiComponents/` beserta subfoldernya
- [x] Implementasikan `CopyButton.ts` (dengan auto-revert 1s)
- [x] Implementasikan `SearchFilterBar.ts` (dengan debounce dan keyboard focus)
- [x] Implementasikan `BaseModal.ts` dan `ConfirmModal.ts` (type-to-confirm ready)
- [x] Implementasikan `GenericTable.ts` (data-driven schema, RFC 4180 TSV export)
- [x] Buat barrel export `local/src/uiComponents/index.ts`
- [x] Verifikasi integrasi ke `depsTable.ts` dan `CopyPasteDiffModal.ts`
- [x] Verifikasi `npm run build` berhasil tanpa error compile (Green build)
- [x] Commit Status 1 setelah pengujian selesai
