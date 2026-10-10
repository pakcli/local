---
id: raw-file-opener-format-switcher
title: Raw File Opener & Format Switcher
plugin: local
status: 1
tags:
  - pakcli
  - local
  - rawOpener
  - editor
  - feature
created: 2026-10-09
---

# Raw File Opener & Format Switcher

## 1. Overview
Penampil dan pengubah mode tampilan file mentah yang memungkinkan peninjauan dan pengeditan file non-markdown (JSON mentah, YAML murni, CSV, script powershell, binary hex preview) langsung di tab Obsidian dengan syntax highlighter terintegrasi.

## 2. Key Capabilities
- **Format Switcher Header Action**: Mengubah mode tampilan antara formatted render, raw codeblock, atau hex viewer dalam satu klik tombol header.
- **Direct System Default Launcher**: Opsi membuka file target secara langsung pada aplikasi default sistem operasi (misal VSCode, Notepad++, atau Affinty Designer).
- **Embedded Editor Support**: Menampilkan editor teks mini dengan auto-save yang terisolasi dari markdown parser Obsidian.

## 3. Integration Points
- Terintegrasi di modul `src/features/rawOpener/` pada `pakcli-local`.

## 4. Status: 1 (Implemented)
Fitur sudah diimplementasikan penuh dan aktif di `pakcli-local`.
