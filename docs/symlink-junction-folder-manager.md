---
id: symlink-junction-folder-manager
title: Symlink & Junction Folder Manager
plugin: local
status: 1
tags:
  - pakcli
  - local
  - symlink
  - junction
  - feature
created: 2026-10-09
---

# Symlink & Junction Folder Manager

## 1. Overview
Pengelola tautan simbolik (*symbolic links*) dan NTFS directory junctions tingkat sistem operasi yang memungkinkan penyatuan folder eksternal dari lokasi drive manapun ke dalam Obsidian vault tanpa menduplikasi ruang disk.

## 2. Key Capabilities
- **Create & Manage Junctions**: Membuat directory junction aman menggunakan perintah native Windows `mklink /J`.
- **Vault Virtual Ingestion**: Menghubungkan direktori proyek git eksternal ke dalam vault untuk pengindeksan wikitext instan.
- **Broken Link Detection**: Memeriksa validitas target folder junction secara otomatis dan memberikan peringatan jika target fisik dipindahkan.

## 3. Integration Points
- Terintegrasi di modul `src/features/symlink/` pada `pakcli-local`.

## 4. Status: 1 (Implemented)
Fitur sudah diimplementasikan penuh dan aktif di `pakcli-local`.
