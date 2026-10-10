---
id: cross-vault-hub-event-bus
title: Cross-Vault Hub & Event Bus
plugin: local
status: 1
tags:
  - pakcli
  - local
  - hub
  - eventbus
  - feature
created: 2026-10-09
---

# Cross-Vault Hub & Event Bus

## 1. Overview
Jalur komunikasi dan event bus lintas modul yang menghubungkan berbagai subsistem PakCLI (`local`, `panel`, dll.) serta memfasilitasi pertukaran pesan dan sinkronisasi status antar jendela vault Obsidian yang berjalan bersamaan.

## 2. Key Capabilities
- **Typed Event Broadcasting**: Mengirim dan mendengarkan event terstruktur (pembaruan audio, perubahan Git, refresh tabel) dengan jaminan tipe TypeScript.
- **IPC State Synchronization**: Komunikasi antar proses melalui IPC channel lokal dan penulisan status atomik.
- **Cross-Plugin Discovery**: Memastikan fitur lokal dapat dipanggil secara transparan dari UI panel utama.

## 3. Integration Points
- Terintegrasi di modul `src/features/hub/` pada `pakcli-local`.

## 4. Status: 1 (Implemented)
Fitur sudah diimplementasikan penuh dan aktif di `pakcli-local`.
