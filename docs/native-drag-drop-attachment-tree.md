---
id: native-drag-drop-attachment-tree
title: Native Drag & Drop Attachment & File Explorer Tree
plugin: local
status: 0
tags:
  - pakcli
  - local
  - dragdrop
  - attachment
  - tree
  - feature
created: 2026-10-09
updated: 2026-10-09
---

# Native Drag & Drop Attachment & File Explorer Tree

## 1. Overview
Fitur integrasi penanganan file lampiran desktop asli yang memungkinkan penarikan (drag-and-drop) file gambar, PDF, dokumen biner langsung dari File Explorer OS atau panel tree navigasi lokal ke dalam vault dengan perutean direktori otomatis dan sanitasi nama file.

## 2. Status: 0 (Lagi Dibuat / In Progress)
> **STATUS PERPINDAHAN**:
> Fitur ini **sedang dipindahkan dari `pakcli-panel` ke dalam `pakcli-local`**. Penanganan file I/O fisik dan penangkapan event drag-and-drop OS native kini menjadi tanggung jawab modul `local` agar konsisten dengan `symlink`, `rawOpener`, dan bridge desktop lainnya.

## 3. Key Capabilities (Sedang Dibangun)
- **Native OS Drag-and-Drop Capture**: Menangkap event drag file dari Windows File Explorer atau Finder secara langsung tanpa batasan sandbox browser.
- **Intelligent Attachment Routing**: Memindahkan atau menyalin file yang di-drop ke direktori aset target yang telah dikonfigurasi tanpa mengotori root vault.
- **Wikitext & Markdown Embed Generation**: Menghasilkan tautan embed `![[nama-file.ext]]` secara otomatis di posisi kursor editor aktif.
- **Conflict & Duplicate Resolution**: Memberikan opsi auto-rename numerik atau penimpaan file jika nama aset yang di-drop sudah ada di vault.

## 4. Integration Points
- Terintegrasi dengan modul clipboard OS (`src/features/copypaste/`) dan jembatan file sistem di `pakcli-local`.
