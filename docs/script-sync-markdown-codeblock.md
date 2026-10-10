---
id: script-sync-markdown-codeblock
title: Script Sync & Markdown Codeblock Parser
plugin: local
status: 1
tags:
  - pakcli
  - local
  - script
  - codeblock
  - feature
created: 2026-10-09
---

# Script Sync & Markdown Codeblock Parser

## 1. Overview
Parser dan eksekutor blok kode skrip (PowerShell, Python, Bash) yang tertanam langsung di dalam catatan markdown dengan kemampuan sinkronisasi dua arah ke file skrip fisik di sistem operasi.

## 2. Key Capabilities
- **Executable Markdown Codeblocks**: Tombol jalankan langsung (*Run Codeblock*) dengan penangkap output stdout/stderr real-time.
- **Two-Way File Sync**: Perubahan pada skrip di dalam codeblock otomatis disinkronkan ke file script fisik di disk lokal dan sebaliknya.
- **Safe Environment Guard**: Menjalankan skrip dalam direktori kerja terkontrol dengan konfirmasi izin eksekusi.

## 3. Integration Points
- Terintegrasi di modul `src/features/scriptSync/` pada `pakcli-local`.

## 4. Status: 1 (Implemented)
Fitur sudah diimplementasikan penuh dan aktif di `pakcli-local`.
