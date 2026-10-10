---
id: dual-asset-generator
title: Dual-Asset Generator (img_sensored.jpg & img_raw.jpg)
plugin: local
status: -1
tags:
  - pakcli
  - local
  - asset
  - privacy
  - feature
created: 2026-10-09
---

# Dual-Asset Generator (img_sensored.jpg & img_raw.jpg)

## 1. Overview
Sistem pembuatan dan penautan pasangan aset ganda otomatis yang menghasilkan file tersensor publik (`img_sensored.jpg`) dan file mentah privat (`img_raw.jpg`) dengan pengelolaan akses tautan terenkripsi.

## 2. Key Capabilities (Backlog)
- **Automatic Paired Generation**: Menyimpan versi bersih untuk arsip lokal dan versi tersensor untuk kebutuhan ekspor web/klien.
- **Symlink / Reference Binding**: Memetakan kedua aset dalam satu metadata relasional di catatan markdown.
- **Export Filter Gatekeeper**: Memastikan hanya versi tersensor yang dimasukkan saat mengekspor ke Quartz atau GitHub Pages.

## 3. Integration Points
- Terhubung dengan `privacy-sensor-canvas-blackout-brush` dan modul export.

## 4. Status: -1 (Backlog)
Fitur berada dalam backlog antrean fitur privacy publishing.
