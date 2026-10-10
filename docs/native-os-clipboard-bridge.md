---
id: native-os-clipboard-bridge
title: Native OS Clipboard Bridge
plugin: local
status: 1
tags:
  - pakcli
  - local
  - clipboard
  - feature
created: 2026-10-09
---

# Native OS Clipboard Bridge

## 1. Overview
Jembatan integrasi clipboard sistem operasi asli yang memungkinkan pembacaan dan penulisan data clipboard biner, gambar, dan rich text melampaui batasan standar browser/sandbox Obsidian.

## 2. Key Capabilities
- **Desktop Clipboard Access**: Memanfaatkan API native Electron dan PowerShell untuk membaca metadata clipboard sistem operasi secara presisi.
- **Image & Data URI Handling**: Menangkap gambar hasil print screen/snip langsung ke vault tanpa distorsi kompresi.
- **Safe Sanitization**: Memastikan data teks yang dipaste dibersihkan dari format tersembunyi yang merusak markdown.

## 3. Integration Points
- Terintegrasi di modul `src/features/copypaste/` di `pakcli-local`.

## 4. Status: 1 (Implemented)
Fitur sudah diimplementasikan penuh dan aktif di produksi `pakcli-local`.
